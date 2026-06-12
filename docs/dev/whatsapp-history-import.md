# Inbox real do WhatsApp — importação de histórico e espelho de saídas (Evolution)

> Esta onda entrega três partes complementares: (1) arquivamento das conversas
> fictícias de seed em produção, (2) espelho de mensagens enviadas pelo celular
> (`outbound-echo`) no webhook, e (3) importação do histórico armazenado pela
> instância Evolution. Juntas, elas fazem com que o Inbox de produção reflita a
> conta WhatsApp real desde o primeiro dia de uso.

---

## 1. Arquivamento do seed (operação de dados — 2026-06-12)

Antes de começar a receber mensagens reais, as conversas fictícias geradas pelo
seed da Fase 2 precisavam sair do caminho do Inbox de produção.

**Critério de seleção:** conversas sem nenhuma mensagem com `provider_message_id`
preenchido — são, por definição, dados do seed/mock, nunca tocados pelo canal
real.

**O que foi feito:**
- `tags` receberam a entrada `demo-seed` (auditabilidade).
- `status` foi alterado para `arquivada`.
- `unread_count` foi zerado.

Esta não é uma migration de schema — é uma **correção pontual de dados** aplicada
diretamente em produção em 2026-06-12.

**Reversibilidade:** as conversas continuam no banco, filtráveis por
*Status → Arquivadas*. Removendo a tag `demo-seed` e revertendo o status é
possível recuperá-las a qualquer momento.

**Modo Demonstração não foi afetado:** ao alternar para `VITE_DATA_SOURCE=mock`,
o app usa o dataset fictício completo intacto.

---

## 2. Espelho de mensagens enviadas pelo celular (`outbound-echo`)

### Contexto

Quando um atendente envia uma mensagem diretamente pelo celular (e não pelo
app), a Evolution dispara um evento `messages.upsert` com `data.key.fromMe=true`.
O webhook captura esse evento e espelha a mensagem no Inbox, mantendo o
histórico completo mesmo para contatos gerenciados fora da plataforma.

### Parser (`src/providers/whatsapp/evolution/parser.ts`)

`parseEvolutionInbound` diferencia o caminho em cima de `data.key.fromMe`:

- **`fromMe=false`** → retorna `IInboundMessage` (type `"message"`) — fluxo
  padrão de mensagem recebida.
- **`fromMe=true`** → retorna `IOutboundEcho` (type `"outbound-echo"`) com
  `toPhone`, `contentType`, `text`, `mediaCaption` e `providerMessageId`.

**Guardas de JID** — lançam exceção (ignoradas upstream pelo webhook core):

| Padrão | Motivo |
| --- | --- |
| `@g.us` | Grupo — sem cliente 1:1 |
| `@broadcast` / `@newsletter` | Lista de transmissão / canal |
| `@lid` | JID de privacidade do WhatsApp — sem telefone resolvível |

### Webhook core (`src/providers/whatsapp/webhook/core.ts`)

O ramo `outbound-echo` em `processWebhookEvent` (passo 3.5):

1. **Anti-eco:** consulta `findOutboundMessageByProviderMessageId`. Se o
   `providerMessageId` já existe na tabela (mensagem enviada pelo app, que
   também ecoa), marca como `duplicate` e retorna — nada é duplicado.
2. **Resolução de conta:** `findEvolutionAccount` pelo `instance` do payload.
3. **Resolução de cliente:** `findCustomerByPhone` pelos dígitos de `toPhone`;
   se não encontrado, cria um cliente pendente (`pending_review`) atribuído ao
   `resolveDefaultSellerId` da loja.
4. **Resolução de conversa:** `findOpenConversation`; se não há conversa aberta,
   cria uma com `status: "em_andamento"` (o eco indica que nós iniciamos o
   contato).
5. **Persistência:** `insertOutboundEchoMessage` — grava com `direction: out`,
   `author_type: seller`, `author_id: null` (não há como identificar qual
   atendente estava no celular), `status: sent`.
6. **Bump sem incremento de não-lidas:** `touchConversation` avança
   `last_message_at` sem tocar `unread_count` (diferença do `bumpConversation`
   do fluxo inbound).
7. **Auditoria:** `webhook_received` com `direction: "out"` e `toPhoneMasked`
   (últimos 4 dígitos — minimização de PII).

**Resultado:** `outcome: "echo-created"`.

### Idempotência

- Status events recebem uma `eventKey` por status (`whatsapp:<provider>:<pmid>:<status>`).
- Mensagens e ecos usam a chave nua (`whatsapp:<provider>:<pmid>`).
- O índice único `messages_provider_message_id_key` (ver §4) fecha a corrida
  entre webhook e import.

---

## 3. Importação de histórico

### Visão geral

A Edge Function `whatsapp-import-history` permite ao Owner trazer para o Inbox
o histórico armazenado pela instância Evolution antes da conexão com o app.
Opera em lotes, é idempotente e pode ser retomada após falha.

### Contrato HTTP

```
POST /functions/v1/whatsapp-import-history
Authorization: Bearer <token do owner>
Content-Type: application/json

{ "accountId": "<uuid>", "cursor": 0 }
```

Resposta (`200 OK`):

```json
{
  "done": false,
  "nextCursor": 10,
  "stats": {
    "chatsProcessed": 9,
    "chatsSkippedGroup": 1,
    "chatsSkippedBroadcast": 0,
    "chatsSkippedLid": 4,
    "chatsSkippedOther": 0,
    "chatsFailed": 0,
    "customersCreated": 3,
    "conversationsCreated": 7,
    "messagesImported": 142,
    "messagesSkipped": 8
  }
}
```

O cliente faz loop passando `nextCursor` como `cursor` no próximo POST até
`done: true`.

### Pré-condições

- Conta Evolution com `provider_config.baseUrl` e `provider_config.instanceName`
  configurados.
- Secret `{credentials_ref}_API_KEY` presente no Vault (ou env fallback via
  `_shared/secrets.ts`).
- Chamador autenticado com papel `owner` na loja da conta.
- Fonte de dados `supabase` (o botão na UI é ocultado em modo Demonstração).

### Núcleo runtime-agnostic (`src/providers/whatsapp/import/core.ts`)

Espelhado em `supabase/functions/_shared/whatsapp/import/core.ts` pelo script
de sync (ver §5).

**Interfaces injetadas:**

- `IImportSource` — leituras no servidor Evolution (`listChats`, `listMessages`).
- `IImportDb` — persistência via service_role Supabase.

**Helpers Evolution** (`src/providers/whatsapp/evolution/instance.ts`):

- `findChats` → `POST /chat/findChats/{instance}` — retorna todos os chats
  armazenados. Aceita três shapes de resposta do servidor (array plano, `{chats}`,
  `{records}`).
- `findMessages` → `POST /chat/findMessages/{instance}` — retorna uma página de
  mensagens. Parâmetros: `page` e `offset` (= tamanho da página, 100 registros
  por padrão). Retorna `{ records, pages? }`.

**Algoritmo por lote (`processImportBatch`):**

1. Lista todos os JIDs de chat do servidor e ordena (cursor estável).
2. Faz slice `[cursor, cursor + batchSize]` (default 10 chats por lote).
3. Para cada chat individual (`@s.whatsapp.net`): chama `importChat`. JIDs não
   individuais são **classificados por tipo** (`classifyChatJid`) e contados
   separadamente — nunca amontoados como "grupos":

   | Sufixo | Contador | Rótulo na UI |
   | --- | --- | --- |
   | `@g.us` | `chatsSkippedGroup` | Grupos ignorados |
   | `@broadcast` / `@newsletter` | `chatsSkippedBroadcast` | Listas e canais ignorados |
   | `@lid` | `chatsSkippedLid` | Contatos com número oculto |
   | qualquer outro | `chatsSkippedOther` | Outros ignorados |

   O `@lid` é uma conversa 1:1 **real** cujo número o WhatsApp esconde
   (privacidade) — separá-lo de "grupos" evita o engano de reportar centenas de
   "grupos" que na verdade são contatos individuais não importáveis.
4. Retorna `{ done, nextCursor, stats }`.

**Algoritmo por chat (`importChat`):**

1. Página todas as mensagens (até 50 páginas × 100 registros = 5 000 mensagens
   por chat). Detecta servidores não paginantes (página idêntica à anterior é
   descartada).
2. Normaliza cada registro via `normalizeRecord` — descarta entradas sem
   `key.id`, timestamps ausentes ou no futuro (ms/µs epochs rejeitados para não
   pinar o Inbox), e `contentType: "unknown"` sem texto extraível.
3. Deduplica em memória por `providerMessageId` (Map), depois consulta o banco
   via `filterKnownProviderMessageIds` (chunks de 200 para respeitar o limite
   de URL do PostgREST).
4. Se não há mensagens novas, retorna — **nunca cria conversa ou cliente vazio**.
5. Resolve cliente pelo telefone (mesmo algoritmo do webhook core); cria
   pendente se não encontrar.
6. Resolve conversa aberta; cria uma com `status: "em_andamento"` e `created_at`
   da mensagem mais antiga.
7. Persiste em bulk via `insertImportedMessages` (chunks de 500 com upsert
   `ON CONFLICT DO NOTHING`).
8. Avança `last_message_at` da conversa apenas para frente
   (`advanceConversationActivity`).

**Resiliência:** cada chat é envolvido em `try/catch` — uma falha pontual
incrementa `chatsFailed`, o cursor avança e a reimportação alcança o chat
problemático novamente.

### Mídia histórica

Mídia **não é baixada** durante a importação (spec §3). Registros com `mediaType`
preenchido recebem `media_download_status: "failed"` — ficam elegíveis para
retry manual futuro. Texto e legenda são preservados normalmente.

### Clientes novos

Números sem cadastro entram como clientes `b2c` com `status: "ativo"` e tag
`pending_review` para revisão posterior. O `seller_id` é o gerente da loja
(`manager_id`) ou, em fallback, o vendedor ativo mais antigo.

### UI (`ImportConversationsDialog`)

Localização: **Configurações → WhatsApp**, botão "Importar conversas" — visível
apenas para Owner, em conta Evolution com status `connected`, fora do modo
Demonstração.

O diálogo (`src/features/admin-settings/components/ImportConversationsDialog.tsx`)
conduz três fases:

| Fase | Descrição |
| --- | --- |
| `confirm` | Resumo das regras + botão "Importar agora" |
| `running` | Progresso ao vivo (lote N, contadores acumulados) via `runHistoryImport` |
| `done` | Resumo final; aviso específico se `chatsFailed > 0` |
| `error` | Mensagem localizada via `importErrorMessage`; botão "Tentar de novo" retoma |

O cliente (`src/features/admin-settings/api/whatsappImport.ts`) acumula stats
lote a lote e passa `onProgress` para atualização em tempo real. Um cap de 2 000
iterações protege contra servidores que nunca reportam `done`.

---

## 4. Índice único `messages_provider_message_id_key`

**Migration:** `supabase/migrations/20260612082548_messages_unique_provider_message_id.sql`

```sql
create unique index messages_provider_message_id_key
  on public.messages (provider_message_id);
```

Este índice tem duas funções:

1. **Árbitro de dedup** — fecha a corrida entre a importação (upsert
   `ON CONFLICT DO NOTHING`) e o webhook ao vivo (que pode receber a mesma
   mensagem enquanto a importação está rodando).
2. **Garantia de consistência** — um `providerMessageId` repetido jamais cria
   uma segunda linha, independentemente do caminho de inserção.

**NULLs são distintos no Postgres** — linhas sem `provider_message_id` (seed,
mock, mensagens pré-Fase 2) não colidem entre si e não são afetadas pelo índice.

---

## 5. Regra de manutenção do espelho

A camada `src/providers/whatsapp/` é espelhada em
`supabase/functions/_shared/whatsapp/` pelo script de sincronização:

```bash
bun run scripts/sync-whatsapp-shared.ts
```

**Toda alteração em `src/providers/whatsapp/` exige:**

1. Rodar o sync acima.
2. Redeployar as Edge Functions afetadas (`whatsapp-webhook`,
   `whatsapp-import-history` e qualquer outra que use o `_shared/`).

Arquivos relevantes espelhados por esta onda:
- `_shared/whatsapp/import/core.ts` (importação)
- `_shared/whatsapp/evolution/instance.ts` (findChats / findMessages)
- `_shared/whatsapp/evolution/parser.ts` (IOutboundEcho, guardas de JID)

---

## 6. Follow-ups conhecidos (decisões / limitações, não bugs)

**(a) Primeira resposta outbound não move conversa `aguardando → em_andamento`**

Um eco de saída (celular) ou um envio pelo app que seja a primeira mensagem de
uma conversa já existente com status `aguardando` não altera o status nem zera
`unread_count`. Paridade com o comportamento do envio pelo app (PRD-115 §F4).
Trata-se de uma decisão de produto pendente: qual ação do atendente deve fechar
a janela de espera do cliente?

**(b) Corrida de conversas duplicadas em alta carga**

Se o webhook receber uma mensagem e a importação criar a mesma conversa
simultaneamente (janela de ~ms), dois registros de conversa podem surgir para o
mesmo par cliente + conta. O `findOpenConversation` usa `.limit(1)` e ordena
por `created_at` DESC, então a conversa mais recente é usada em seguida — mas
as mensagens podem ficar distribuídas entre as duas. **Recomendação:** executar
a importação fora do horário de pico (logo após conectar a conta, antes de
divulgar o número).

**(c) Mídia de eco e histórico não baixada**

Mensagens `outbound-echo` com `mediaType` e mensagens históricas com mídia
ficam com `media_download_status: "failed"`. O texto / legenda é preservado.
Um job de retry de mídia pode ser implementado futuramente consultando
`messages.media_download_status = 'failed'` com `provider_message_id` preenchido.
