# Migração Evolution → WAHA — `Vendas` (2026-07-14)

> Segundo capítulo da migração Evolution clássico → WAHA (primeira conta de
> produção real, depois do piloto `Teste-AILA`). Documenta dois bugs reais
> de código descobertos e corrigidos ao vivo durante esta migração, um
> incidente de infraestrutura correlacionado (mas não causado pelo código),
> e a verificação de que nenhuma mensagem foi perdida durante o incidente.
> Precedente: `docs/integracoes/waha/ENCERRAMENTO-EVOLUTION-TESTE-AILA-2026-07-13.md`.

## Contexto

Mesmo método do piloto (criar sessão WAHA → repontar conversas via
`migrate_whatsapp_account` → deslogar Evolution → parear QR → reiniciar →
validar e2e → importar histórico → sincronizar avatares → excluir conta
antiga), desta vez seguido na ordem correta desde o início (repontamento
**antes** do pareamento — a lição do piloto foi aplicada).

Contas:
- **Evolution (antiga):** `Vendas`, `9ceb9256-c8c6-445e-8259-37a98c43dd9a` —
  **excluída** ao final (pelo dono, via UI).
- **WAHA (nova):** `Vendas — WAHA`, `d1a9f086-8932-4d69-a396-a5385a2f5ccd`.

Volume: a maior conta migrada até então (~800 chats no servidor WAHA, 1.213
conversas na plataforma após o import).

## Repontamento e pareamento

Sem incidente de duplicação desta vez — `migrate_whatsapp_account` rodado
como dry-run e depois aplicado **antes** de qualquer pareamento. Evolution
deslogada, QR pareado, sessão reiniciada, 3 testes e2e (inbound/outbound/eco)
confirmados sem duplicar.

## ⚠️ Bug #1: import não reaproveitava conversa fechada

Mesmo com a sequência correta (repontar → parear → importar), a primeira
tentativa de importar o histórico gerou **401 conversas duplicadas** para
**457 clientes**. Causa raiz, achada por leitura direta do código: a função
de landing do import (`landNormalizedChat` em `core.ts`) usava
`findOpenConversation` — só reaproveitava conversas **abertas**. O webhook ao
vivo, para o mesmo cenário (mensagem inbound de cliente com conversa já
existente), usa `includeTerminal: true` e reabre conversas **fechadas**
também (spec 2026-07-03 §1.5). Qualquer cliente cuja conversa na Vendas já
estivesse `resolvida`/`arquivada` (comum numa conta de alto volume) fazia o
import criar uma segunda conversa em vez de reaproveitar.

**Correção:** renomeado para `findConversation` (qualquer status), tanto na
interface (`src/providers/whatsapp/import/core.ts`) quanto na implementação
Deno (`supabase/functions/_shared/import-db.ts`), com teste de regressão
novo. Deployado em produção e confirmado pelo dono antes da segunda
tentativa de import.

**Reconciliação manual:** as 401 conversas duplicadas (457 clientes) foram
mescladas por script SQL assistido — dedupe de mensagens por
direção+horário (tolerância 5s), preservando conteúdo genuinamente novo,
antes do fix estar no ar.

## ⚠️ Bug #2: import WAHA sem resiliência a falha transiente na listagem de chats

Depois do fix do Bug #1, a segunda tentativa de import quebrou com erro 500
não tratado. Causa raiz: `fetchAllWahaChatIds` relista **todo** o conjunto de
chats a cada chamada de lote (só o cursor fatia a lista já buscada) — para
uma conta grande isso são várias páginas HTTP por lote, sem nenhuma
resiliência (diferente do loop por-chat, que já tinha try/catch). Uma falha
pontual numa dessas páginas derrubava a requisição inteira sem ser
capturada.

**Correção:** wrapper `withWahaRetry` (retry com backoff) aplicado às duas
chamadas HTTP externas do import WAHA. Deployado e confirmado pelo dono.

## Incidente de infraestrutura (correlacionado, não causado pelo código)

Durante a terceira tentativa de import (já com os dois fixes acima), o
container Docker do WAHA sofreu OOM-kill no processo `gows` (pico de
processamento de sticker/Lottie, limite de memória `2g` insuficiente),
deixando o processo "zumbi" (vivo, mas sem responder a nenhum HTTP,
incluindo `/health`) por **~33 minutos** (13:33:28–14:06 UTC, 2026-07-14) até
reinício manual. Corrigido em nível de infraestrutura pelo dono: limite de
memória elevado para 5GB, serviço `autoheal` novo (reinicia containers
`unhealthy` automaticamente em ~40s).

**Nota de honestidade:** o fix do Bug #2 (retry com ~1-2s de resiliência
adicional) **não teria sido suficiente** para sobreviver a uma queda de 33
minutos — os dois problemas são reais e válidos, mas independentes. O retry
resolve blips curtos; o `autoheal` resolve quedas prolongadas.

**Verificação de perda de dados:** confirmado via análise de `sent_at` vs.
`created_at` na tabela `messages` que **nenhuma mensagem foi perdida**
durante a janela de indisponibilidade — o WhatsApp multi-dispositivo
enfileira mensagens no celular físico e as entrega em rajada assim que o
dispositivo linkado (sessão WAHA) volta a responder.

## ⚠️ Bug #3: 504 por timeout — `downloadMedia` + retry agressivo + sem orçamento de tempo

Numa quarta tentativa (depois do incidente de infra resolvido), o import
voltou a falhar — desta vez com **504** (gateway timeout), não mais 500.
Investigação por evidência direta (trilha de `audit_logs`, tempo de cada
lote): lotes com mais chats "lentos" tinham duração proporcional ao número
de falhas — cada chat lento custava ~46s (15s de timeout × 3 tentativas de
retry + backoff). Um lote com 4 chats lentos estourava os ~150s de resposta
do gateway da Supabase antes do fim do request.

**Causa raiz mais funda:** `fetchWahaChatMessagesPage` não passava
`downloadMedia=false` — o WAHA por padrão baixa e decodifica a mídia de toda
mensagem ao paginar mensagens, trabalho pesado que o import nunca usa
(mídia histórica fica `media_download_status: "failed"` por design).
Provável contribuinte também para o próprio OOM do incidente acima (o pico
de processamento de mídia aconteceu **durante** a segunda tentativa de
import).

**Correção (3 partes, mesmo PR do Bug #2):**
1. `downloadMedia=false` na busca de mensagens por chat.
2. Orçamento de tempo (~100s) em `processWahaImportBatch` — o lote para de
   pegar novos chats antes do limite do gateway e devolve o cursor real
   alcançado (`done:false`), nunca mais arriscando 504.
3. Retry do fetch de mensagens por chat reduzido de 3 tentativas para 1 (a
   listagem de chats manteve 3 — é barata e roda só uma vez por lote).

## Resultado final

Import re-executado do zero com os 3 fixes ativos: **`done:true`, zero
falhas em todos os lotes**. Verificação pós-import: 1.213 conversas totais,
apenas **7 clientes com mais de uma conversa (8 extras)** — patamar residual
normal, não gerado pelo import (mesma ordem de grandeza do piloto
Teste-AILA). Avatares sincronizados. Conta Evolution antiga excluída pelo
dono via UI (teardown remoto da instância no servidor Evolution deve ter
rodado normalmente, diferente das exclusões via SQL direto do piloto).

## Código

Todos os fixes desta migração (bugs #1, #2, #3 + a RPC
`migrate_whatsapp_account`) estão na branch `fix/waha-import-duplicate-and-retry`,
PR [#279](https://github.com/edmilson-prog/gallo-basediesel/pull/279)
(draft — pendências de outras contas ainda em aberto no momento da escrita).
Já deployados em produção antes do merge (prática já estabelecida no
projeto: deploy direto via `supabase functions deploy`, PR só sincroniza o
Git).

## Lição para as próximas contas

Os 3 bugs corrigidos aqui são genéricos ao pipeline de import WAHA — não
específicos da conta Vendas. As próximas contas (`GALLO Site`,
`VendasExterna`, `Comercial Lucas`) já herdam todos os fixes e não devem
repetir nenhum dos três incidentes. Ver também
`docs/integracoes/waha/ENCERRAMENTO-EVOLUTION-GALLO-SITE-2026-07-14.md` —
primeira conta migrada de ponta a ponta sem nenhum incidente, confirmando
que os fixes seguram.

Próxima conta: **GALLO Site**.
