# Conversas divididas: eco pós-encerramento e os demais mecanismos

> Investigação de 2026-07-23 + **double-check adversarial** no mesmo dia (workflow com 3 agentes
> independentes: refutação de código, varredura de dados recomputada do zero e forense das anomalias).
> Caso relatado: **VOLTECH OFICINA ESPECIALIZADA EM VEICULOS A DIESEL** (+55 49 9973-4586) aparecendo
> como **duas conversas** — mesmo número, mesma instância (`Vendas — WAHA`).

## 1. Veredito (revisado pós double-check)

O diagnóstico original **sobrevive ao double-check como mecanismo dominante**, mas era **incompleto**:

1. **Eco pós-encerramento** (regra intencional): um **eco** (mensagem enviada pelo aparelho, fora da
   plataforma) **nunca reabre** uma conversa encerrada — cria uma nova. O inbound do cliente reabre.
   É o criador de **109 das 130** conversas extras classificáveis. ✅ Confirmado com números
   recomputados independentemente e com o caso VOLTECH reverificado ao milissegundo.
2. **Porém a escala real é ~4× maior que a reportada de início**: a primeira varredura agrupava só por
   `customer_id` (22 pares / 51 conversas). Agrupando por **telefone + instância**, são
   **106 grupos duplicados / 236 conversas** — 84 grupos ancorados em **lead** eram invisíveis ao
   agrupamento original. O eco continua dominante também nos leads.
3. **E o mecanismo não é único.** O double-check encontrou outros criadores de duplicata, incluindo
   **2 bugs genuínos** (§4) — e o achado mais contraintuitivo: das **13 divisões visíveis hoje**
   (2+ conversas abertas ao mesmo tempo), **nenhuma** é eco pós-encerramento (§5).

A regra do eco está documentada em `docs/dev/attendance-close-history.md` §"Matriz de reabertura" e
implementada **identicamente** nos dois pipelines de webhook:

- `supabase/functions/waha-webhook/index.ts` — eco `:858-869` (lookup OPEN-ONLY,
  `.not("status","in","(resolvida,arquivada)")` → INSERT `:873`); inbound `:1108-1118` (sem filtro de
  status → REOPEN `:1157-1169`).
- `supabase/functions/_shared/whatsapp/webhook/core.ts` `:661-676` — o pipeline Meta/Evolution/Go/OpenWA
  (`whatsapp-webhook`) tem **a mesma regra** (`findOpenConversation` sem `includeTerminal` no eco).

## 2. Caso VOLTECH (evidência, reverificada)

Cliente `0d02ed7d-6b65-4df9-bfaa-4a6e0330b6f7`, conta `d1a9f086` (`Vendas — WAHA`).

| Quando (UTC) | O quê | Fonte |
|---|---|---|
| 20/07 19:31:26 | Última mensagem da conversa **A** (`a5081f8f`, 612 msgs) | `messages` |
| **20/07 20:23:22.956** | **Lucas Costa marca a conversa A como `resolvida`** | `conversation_activity` |
| **20/07 20:50:02.391** | **Sistema cria a conversa B** (`2a9dcfb4`) — primeira msg enviada **pelo celular** | `conversation_activity` (`created`, system) |

Contraprova na mesma trilha: a conversa A foi **reaberta** 3× (08/07, 17/07 ×2) — nessas vezes quem
falou primeiro foi **o cliente** (inbound). A 3ª conversa do contato (`eddb0fbb`) está em **outra
instância** (`Comercial Lucas`) — esperada no modelo por-instância, não faz parte da divisão.

## 3. Escala corrigida (recomputada em 23/07)

| Métrica | 1ª investigação | Double-check |
|---|---|---|
| Grupos duplicados (telefone + instância) | 22 (só customer) | **106** (84 lead + 22 customer; 236 conversas) |
| Conversas criadas por eco (total, maioria legítima) | 632 | **737** (drift de banco vivo) |
| …com conversa anterior já encerrada (= histórico partido) | 102 | **109** |
| …dentro de 1h / 24h do encerramento | 24 / 54 | **27 / 59** |
| Grupos com **2+ conversas abertas simultaneamente** | não medido | **13** |

Classificação das **130 conversas extras** (cada conversa de um grupo além da mais antiga, janela
coberta pela trilha `conversation_activity`, que existe desde 04/07):

| Causa | Qtde |
|---|---|
| Eco pós-encerramento (regra intencional) | **109** |
| Corrida de webhooks concorrentes (TOCTOU) | **13** |
| Divisão por 9º dígito (2 leads distintos p/ mesmo número real) | 2 |
| Eco ignorou conversa ABERTA (bug do erro engolido, §4.2) | 1 |
| Inbound criou nova com anterior aberta/recém-fechada (evidência fraca — reancoragem retroativa da Frente B) | 3 |
| Estado anterior desconhecido (conversa pré-trilha/import) | 2 |

Metodologia: primeira mensagem por **`created_at`** (ordem de inserção), não `sent_at` — entregas
atrasadas de webhook e imports de histórico retrodatam `sent_at` e geram falsos "inbound-first"
(foi exatamente o caso do par G. L. DE LIMA, reclassificado de anomalia para confirmação da tese).

## 4. Bugs genuínos encontrados pelo double-check

### 4.1 Corrida TOCTOU na criação de conversa (ativo, recorrente)

`conversations` **não tem índice único** por (âncora, `whatsapp_account_id`) e a idempotência do
webhook é **por evento**, não por contato. Dois eventos diferentes do mesmo contato processados em
paralelo passam ambos pelo lookup antes do INSERT do outro comitar → **os dois inserem**.
Confirmado em produção: **10+ pares no mesmo instante** (gaps de 35 µs a 13 s; combinações in/in,
in/out e out/out; WAHA e Evolution; um burst criou 3 conversas em 13 s durante drenagem de fila;
uma corrida também criou **2 leads duplicados** para o mesmo telefone). Último caso: **22/07** — segue
acontecendo. É a causa de **8 das 13 divisões visíveis hoje** (§5).

### 4.2 Erro de query engolido → INSERT "fail-open" (provado por exclusão)

`waha-webhook/index.ts:858` desestrutura só `{ data }` do lookup do eco e **descarta `error`** — uma
falha transitória (timeout/PostgREST) vira "não existe conversa aberta" e o código **cria uma nova**.
O lookup do inbound (`:1108`) tem o **mesmo defeito latente**.

Prova (caso GILBERTO FISCHER, conv `3bde1e20`): em 16/07 às 12:35:46/12:35:56/12:36:36 três ecos do
mesmo contato foram roteados **para dentro** da conversa aberta `91b5746d` — provando que ela
satisfazia o lookup naquele minuto. Às 12:39:31 um eco idêntico **não a encontrou** e criou `3bde1e20`.
A trilha por trigger (`conversation_activity_capture`, ativa e comprovadamente disparando na semana)
não registra **nenhuma** transição da conversa antiga entre 13/07 e 17/07 — ela esteve continuamente
aberta; sem cliente duplicado, sem troca de conta, sem corrida (3 min de gap). A única explicação
restante é o lookup ter falhado com erro descartado.

### 4.3 Riscos armados (0 ocorrências até hoje, mas sem guarda)

- **Anchor-flip na conversão de lead**: `ConvertLeadModal` (modos link/create) só atualiza o lead —
  **nenhum código reancora as conversas** do lead para o cliente. Como todo resolver checa cliente
  ANTES de lead, após a conversão o telefone resolve para o cliente e o lookup por `customer_id` não
  enxerga a conversa ancorada no lead → duplicata no próximo eco **e** no próximo inbound. Exposição
  atual: 0 conversões registradas (wizard #350/#351 recém-entregue), **4 conversas lead-ancoradas já
  sombreadas** por cliente de mesmo telefone na mesma loja — duplicam na próxima mensagem.
- **"Nova conversa" no app** (`NewConversationDialog` → `createOutbound`): o fluxo de cliente
  existente **não faz lookup nenhum** de conversa — pode duplicar até com conversa ABERTA; o fluxo de
  número novo usa lookup OPEN-ONLY (duplica com encerrada). Nenhum caso em prod atribuível ainda.
- **`findCustomerByPhone`** pega o primeiro match tolerante de lista sem ordenação — dois clientes com
  o mesmo telefone podem resolver diferente a cada invocação (não realizado: 0 grupos com clientes
  duplicados hoje).
- **Importadores de histórico** (`whatsapp-import-history`/`-go`): ~10 duplicatas históricas com a
  assinatura do importador (primeira msg sem `webhook_event_ids`), provavelmente correndo contra o
  webhook vivo na migração WAHA de meados de julho.

## 5. As 13 divisões visíveis HOJE (2+ conversas abertas) — nenhuma é eco pós-encerramento

O eco pós-encerramento, por construção, deixa a anterior **fechada** — ele parte o histórico, mas
raramente produz duas conversas abertas. O que o usuário vê partido **agora** tem outras causas:

| Contato (chave) | Causa |
|---|---|
| 553188071974 @ Vendas—WAHA | corrida (46 ms, par in+out) |
| 554899860870 @ Vendas—WAHA | **9º dígito** (2 leads p/ mesmo número) |
| 554999412825 @ GALLO Site | corrida (14 ms) |
| 554999625626 @ Vendas—WAHA | corrida (39 ms) + 2 leads duplicados |
| 555197539632 @ GALLO Site | corrida (75 ms) |
| 555399511127 @ Vendas—WAHA | **bug do erro engolido** (§4.2) |
| 555481572275 @ conta 5cfd2beb | **9º dígito** (2 leads) |
| 555484008996 @ Vendas—WAHA | corrida (35 µs) |
| 555581156781 @ GALLO Site | corrida (91 ms, mesmo cliente) |
| 555584151576 @ Vendas—WAHA | corrida em burst (3 convs em 13 s) |
| 555599003314 @ Vendas—WAHA | anomalias sequenciais (evidência fraca — Frente B) |
| 555599755317 @ GALLO Site | desconhecida (conversa pré-trilha, import) |
| 556792908840 @ Vendas—WAHA | corrida (8 ms, par in+out) |

O caso VOLTECH não está nesta lista porque a conversa antiga está `resolvida` — ele é o padrão
"histórico partido" (109 casos), visível ao buscar/abrir a antiga, mas não duas abertas em fila.

## 6. O que NÃO é

- **Não** é falha de dedup do envio pela plataforma: `waha-send` é deduplicado por
  `provider_message_id` antes de qualquer escrita (`waha-webhook/index.ts:714-738`).
- **Não** é `@lid` vs `@c.us` no caso VOLTECH: mesmo registro em `customers`, mesmas contas.
- **Não** há RPC/trigger SQL inserindo em `conversations` (grep de todas as migrations: zero), e
  sdr-*/rescue/scheduled-send/connect não criam conversas.
- **Não** há hoje grupos com âncora mista (0) nem clientes duplicados realizados (0).

## 7. Plano de correção (por prioridade) — itens 1, 2 e 4 IMPLEMENTADOS neste PR

1. ✅ **Guarda de unicidade contra a corrida** — migration `20260723165509_unique_open_conversation_guard.sql`:
   limpeza (arquiva todas-menos-a-mais-recente das conversas abertas duplicadas por contato+conta,
   ~13 grupos) + **2 índices únicos parciais** (`conversations_one_open_per_customer_account` /
   `_lead_account`, `WHERE status NOT IN ('resolvida','arquivada') AND whatsapp_account_id IS NOT NULL`).
   Todos os escritores recuperam o 23505 reusando a linha vencedora: `waha-webhook` (eco + inbound),
   adapter do `whatsapp-webhook`, `_shared/import-db.ts` (importadores) e `createOutbound` do app
   ("Nova conversa" passa a navegar para a conversa aberta existente em vez de duplicar).
2. ✅ **Fail-closed nos lookups e writes do `waha-webhook`** — helper `transientDbFailure`: erro
   transitório em lookup/INSERT responde **503 sem `markProcessed`** (o WAHA reentrega; a marca de
   idempotência adiada garante retry limpo) em vez do antigo fail-open (duplicata) ou 200 silencioso
   (mensagem perdida). O inbound virou **open-first** (prefere a conversa aberta; só reabre fechada
   quando não há nenhuma aberta — também elimina a classe de violação do índice no reopen). No
   `whatsapp-webhook`, os lookups do adapter agora propagam erro (throw) em vez de "não achei".
3. ✅ **DECIDIDO (2026-07-23, dono) e implementado: janela de continuidade do eco** — variante
   "anexa sem reabrir": quando o eco chega e a conversa mais recente do contato na instância está
   `resolvida` há menos de N horas, a mensagem **entra nela sem mudar o status** (o próximo inbound
   do cliente reabre esse mesmo thread pela regra normal). `arquivada` nunca participa; fora da
   janela, segue criando conversa nova. N é **por loja** (`stores.settings->echoContinuity.windowHours`,
   default 24, 0 = desligada) com tela Owner-only em **Configurações → Atendimento → Continuidade de
   conversas**. Peças: engine puro `src/providers/whatsapp/echoContinuity.ts` (+testes, espelhado em
   `_shared/`), coluna `conversations.closed_at` mantida por trigger
   (`conversations_maintain_closed_at`, migration `20260723200000`) com backfill da trilha, lookup de
   continuidade no eco do `waha-webhook`. O pipeline legado (Meta/Evolution/Go/OpenWA) mantém
   sempre-criar **de propósito** enquanto não carrega tráfego (nota no `webhook/core.ts`).
   **Consequência deliberada de UX** (flagada na revisão): dentro da janela, o eco anexado **não
   aparece na visão padrão da Inbox** (a conversa segue `resolvida` e o filtro padrão oculta
   resolvidas — antes ele viraria uma conversa nova `aguardando`, visível na fila). O thread volta ao
   topo quando o cliente responde e reabre. O copy da tela de configuração avisa isso ao Owner.
4. ✅ **Reancorar conversas na conversão de lead** — migration `20260723165546_reanchor_lead_conversations.sql`:
   trigger `leads_reanchor_converted` (AFTER UPDATE de `converted_to_customer_id`) re-ancora as
   conversas do lead no cliente (histórico migra junto); conversas abertas que conflitariam com uma
   aberta do cliente na mesma conta são arquivadas (o tráfego já flui para a do cliente). Espelhado
   no mock (`src/mocks/api/leads.ts` + testes).
5. ⏳ **Normalização de 9º dígito no resolver de lead** + dedup dos leads duplicados (2 pares visíveis).
6. ⏳ **Lookup pré-insert no fluxo "Nova conversa"** — parcialmente coberto: a recuperação de 23505 no
   `createOutbound` já impede a duplicata e navega para a conversa existente; um lookup explícito
   pré-insert (UX de aviso) fica como melhoria.

Higiene de dados: a limpeza dos 13 grupos visíveis está NA PRÓPRIA migration do item 1 (recomputada
no apply). As 4 conversas lead-ancoradas sombreadas por cliente de mesmo telefone (§4.3) são resolvidas
organicamente pelo trigger do item 4 quando esses leads forem convertidos — ou por backfill assistido.

### 7.1 Revisão adversarial da implementação (rodada 2)

Um workflow de revisão (3 lentes × verificação adversarial por finding, 22 confirmados) endureceu a
primeira implementação:

- **`whatsapp-webhook` ganhou paridade com o WAHA**: `TransientDbError` taggeada → o catch responde
  **503 sem processed-mark** (Meta/Evolution reentregam) em vez do 200 "error-logged" que descartava
  a mensagem; `reopenConversation` agora propaga erro (inclusive o 23505 do índice); o **core
  compartilhado virou open-first** (editado em `src/providers/whatsapp/webhook/core.ts` e espelhado
  via `scripts/sync-whatsapp-shared.ts` — **redeploy do `whatsapp-webhook` obrigatório**).
- **`waha-webhook`**: `findCustomerByPhone`/`findLeadByPhone` fail-closed (o furo acima do lookup que
  o índice não bloqueia — erro virava "número desconhecido" → lead duplicado); os **resolvers de lead
  seguem o ponteiro de conversão** (`converted_to_customer_id` → âncora cliente, senão a conversão
  recriaria a divisão quando o telefone do cliente difere do lead); o silent-200 do insert de cliente
  @lid inbound virou 503; o **bump de unread saiu do reopen** (uma mensagem = um incremento, mesmo com
  redelivery após 503).
- **Migrations**: advisory lock por cliente + retry de 23505 no passo (c) do trigger + reancoragem da
  trilha `conversation_activity` (Histórico da ficha mostra a linha do tempo migrada); `LOCK TABLE ...
  SHARE ROW EXCLUSIVE` na migration do índice (fecha a janela cleanup→index contra INSERT concorrente).
- **App**: `update()` mapeia o 23505 de reabertura para mensagem pt-BR amigável; recuperação do
  `createOutbound` distingue erro transitório de "sem acesso"; `waha-connect` (merge @lid→real)
  arquiva a conversa aberta colidente antes de reapontar.

**Follow-ups deliberados (não bloqueantes):** ponteiro de conversão nos resolvers do pipeline legado
(`_shared/whatsapp/webhook/core.ts` `resolveContact`) e do importador; RPC atômico de reabertura
app-side (hoje o par assign+status não é atômico — o 23505 aborta o status mas o assign pode ter
aplicado); bump de unread server-side (`unread_count = unread_count + 1`).

## 8. Ordem de rollout (INVERTIDA de propósito — código antes das migrations)

O código antigo transforma falha de INSERT em 200 silencioso (mensagem descartada). Aplicar o índice
antes do deploy derrubaria o lado perdedor de cada corrida. Ordem correta:

1. **Merge do PR** → deploy Vercel (recuperação no `createOutbound` — inerte até o índice existir).
2. **Deploy das edges** `waha-webhook`, `whatsapp-webhook` e `waha-connect`
   (`npx supabase functions deploy <fn> --project-ref njizaasajkdqptlxddqn`) — fail-closed ativo;
   23505 ainda não ocorre. Os importadores (`whatsapp-import-history*`) só precisam de redeploy se
   forem usados após a migration.
3. **Aplicar migration `20260723165509`** (limpeza + índices) via MCP, com OK do dono.
4. **Aplicar migration `20260723165546`** (trigger de reancoragem) via MCP.
5. Smoke: enviar do celular para um contato com conversa aberta; resolver + eco (deve criar nova —
   comportamento intencional preservado); converter um lead com conversa e conferir a ficha do cliente.
