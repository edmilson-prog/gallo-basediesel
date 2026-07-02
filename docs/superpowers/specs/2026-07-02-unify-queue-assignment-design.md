# Unificação "Sem atribuição" → "Em fila" + eco do celular — Design

> **Data:** 2026-07-02
> **Origem:** brainstorming com o dono sobre o filtro de Atribuição da Inbox.
> **Status:** aprovado em conversa; este documento registra as decisões.
> **Branch/worktree:** `feat/unify-queue-assignment` (worktree isolada, decisão do dono).

## Contexto e problema

O filtro "Atribuição" da Inbox oferece **"Sem atribuição"** e **"Em fila"** como opções
separadas, mas hoje elas descrevem populações que deveriam ser uma só:

- Token `unassigned` = `assigned_seller_id IS NULL` (qualquer status).
- Token `queue` = `assigned_seller_id IS NULL AND is_sdr_active = false AND status = 'aguardando'`
  — um **subconjunto** de unassigned. Fonte da verdade client:
  `src/features/inbox-alerts/engine/isQueuedConversation.ts`; server:
  `src/providers/data/impl/supabase/assignmentFilter.ts` + RPCs `search_conversations`
  / `search_conversation_messages`.

Números de produção (2026-07-02):

| População sem atribuição | Qtde | Visível em |
|---|---|---|
| `status='aguardando'` | 742 | "Em fila" e "Sem atribuição" |
| `status='em_andamento'` | 1.144 | só "Sem atribuição" |
| arquivadas | 96 | só "Sem atribuição" |
| **Com dono** e `status='aguardando'` | 41 | (inconsistência inversa) |

A divergência não é acidente — há três produtores deliberados de "sem dono mas fora
da fila", todos mapeados:

1. **Import de histórico** (Evolution REST e Go convergem em `landNormalizedChat`,
   `src/providers/whatsapp/import/core.ts:391-392`): cria `null` + `em_andamento`.
   A própria UI do import promete "caem na fila" (`ImportHistoryDialog.tsx:173,258`) —
   hoje é impreciso.
2. **"Devolver para a fila"** (`useReturnToQueue` → `unassign()`,
   `src/providers/data/impl/supabase/conversations.ts:402-417`): só anula o dono,
   nunca regride o status.
3. **Eco do celular** (`webhook/core.ts:531-546`): conversa nova criada por mensagem
   enviada do aparelho nasce `null` + `em_andamento`.

## Modelo de status (decisão do dono, registro literal)

- **Aguardando** = em fila; está no pool para ser atendido.
- **Em atendimento** = já foi atribuída a alguém; o lead está em atendimento.
- **Aguardando cliente** = aguardando uma ação do cliente.
- **Resolvida** = o cliente foi atendido e a conversa foi resolvida.
- **Arquivada** = eixo separado, manual (inalterado).

## Invariante central

> **Conversa aberta sem dono (e sem SDR ativo) tem status `aguardando` ("Em fila").
> Conversa com dono nunca fica `aguardando`.**

Corolários: `em_andamento`/`aguardando_cliente` pressupõem dono (ou SDR ativo);
`aguardando` pressupõe ausência de dono. Arquivadas ficam fora da invariante.
O ramo SDR (`is_sdr_active = true`, sem dono, `em_andamento`) permanece como exceção
deliberada — o bot está atendendo e a conversa não deve aparecer como fila.

## Escopo

### 1. Migração de dados (produção, uma vez)

```sql
-- sem dono, aberta, sem SDR → em fila
update conversations set status = 'aguardando'
where assigned_seller_id is null and is_sdr_active = false
  and status in ('em_andamento', 'aguardando_cliente');   -- ~1.144 linhas hoje

-- com dono mas 'aguardando' → em atendimento
update conversations set status = 'em_andamento'
where assigned_seller_id is not null and status = 'aguardando';  -- ~41 linhas hoje
```

- Arquivadas e resolvidas **não** são tocadas.
- Idempotente; espelhada em `supabase/migrations/` no mesmo PR (regra do repo);
  aplicada via MCP **somente com OK do dono**; executada **por último** no rollout
  (depois dos redeploys, para não deixar resíduo novo).

### 2. Acoplamento status ⇄ atribuição (daqui pra frente)

| Ação | Efeito novo |
|---|---|
| Devolver para a fila (`unassign`) | além de anular o dono, **status → `aguardando`** (supabase + mock) |
| Assumir (`useSelfAssign`), atribuir vendedor, transferir (`transfer_conversation`), distribuição/rodízio | se status era `aguardando`, **status → `em_andamento`** |
| Controle manual de status: escolher "Em atendimento" ou "Aguardando cliente" numa conversa **sem dono** | **auto-atribui ao ator** (com toast informativo) |
| Escolher "Aguardando" numa conversa **com dono** (controle manual) | devolve à fila: **anula o dono** (simétrico; com toast) |

Fundamentos já registrados em specs anteriores (coerência verificada):
- `2026-06-23-assumir-antes-de-responder-design.md`: auto-atribuição **silenciosa ao
  enviar** segue **vetada** — o banner "Assumir e responder" fica intacto. A regra nova
  não é silenciosa: é consequência direta e visível de uma ação deliberada de status.
- `2026-06-14-conversation-status-flow-design.md` §4: "atendente humano responde ⇒
  `aguardando` → `em_andamento`" já é automático em produção (`statusFlow.ts`,
  pipeline de envio) — intocado.
- Distribuição (`distribute.ts`) e rodízio (`applyRotationOverride.ts`) já produzem
  estados alinhados (vencedor ⇒ dono + `em_andamento`; fila ⇒ `null` + `aguardando`) — intocados.
- Escalação SDR (`useSdrEscalation.ts:150-156`) já alinha — intocada.

O engine das transições novas vive junto de `statusFlow.ts` (par simétrico, puro,
TDD), consumido pelos pontos de mutação. `transfer_conversation` (SQL) ganha a
transição no corpo (CREATE OR REPLACE, sem mudança de assinatura).

### 3. Import de histórico cria "Em fila"

- `landNormalizedChat`: `status: "em_andamento"` → `"aguardando"`
  (`src/providers/whatsapp/import/core.ts:392` + literal do contrato `IImportDb` na L98).
- Cobre os DOIS provedores (Evolution REST e Go HistorySync) num ponto único.
- Requer: `scripts/sync-whatsapp-shared.ts` + **redeploy** de `whatsapp-import-history`
  e `whatsapp-import-history-go`.
- Textos do `ImportHistoryDialog` passam a ser verdadeiros; atualizar o doc
  `docs/superpowers/plans/2026-06-27-whatsapp-go-history-ingestion.md` (decisão L16 muda).
- **Beep de fila não inunda**: o monitor (`useInboxActivityMonitor.ts:252-271`) exige
  `isRecentEvent(last_message_at)` + throttle `MIN_BEEP_INTERVAL_MS` — histórico antigo
  não dispara som (verificado no código).

### 4. Eco do celular (mensagem enviada pelo aparelho)

Evidência de produção (2026-07-02): no **Evolution clássico** o eco `fromMe` chega e
funciona (~97% dos app-sends dedupados via `processed_events`); no **Evolution Go**
(número "Vendas", o operacional) **zero ecos** — o evo-go emite envio próprio como
evento **`SendMessage`** (payload idêntico ao `Message`, `Info.IsFromMe: true`), e o
core o desvia para captura crua (`webhook/core.ts:397` captura tudo que não é
`Message`/`Receipt`). Por isso mensagem enviada do celular não aparece na plataforma.

Mudanças:

- **4a. Status do eco**: conversa nova criada por eco nasce `aguardando` (era
  `em_andamento`) — `webhook/core.ts:545` + espelho. Cai em "Em fila" para alguém
  assumir no app. O eco **não** mexe no status de conversa existente (não sabemos qual
  vendedor enviou; a conversa sem dono permanece em fila até alguém assumir — deliberado).
- **4b. Processar `SendMessage` do Go como eco**: o roteamento deixa `SendMessage`
  seguir para o parser (`webhook/core.ts:397`), e o parser `evolution-go/parser.ts`
  aceita o kind `SendMessage` (mesma shape; `IsFromMe` decide eco). A dedupe por
  `provider_message_id` já protege caso o evo-go também emita `SendMessage` para envios
  via API (evidência: não emite — 2 eventos vs 9.322 app-sends em 7 dias).
- **4c. Mídia do eco** (incluída por decisão do dono): eco com imagem/áudio/vídeo/
  documento passa a **baixar e armazenar** a mídia no mesmo bucket/path pattern das
  mensagens inbound (passo 8 do webhook) — Go via `downloadInboundMedia` (contrato do
  PR #203), clássico via `getBase64FromMediaMessage`. `insertOutboundEchoMessage`
  ganha os campos de mídia. **Nenhuma mudança de policy de storage**: o path carrega o
  `convId`, a policy gated-once existente cobre (camada congelada intocada).
- Requer **redeploy** de `whatsapp-webhook`.

### 5. Filtro e UI

- **Remover a opção "Sem atribuição"** do dropdown (`InboxFilters.tsx:327-333`),
  a string `assignmentOptions.unassigned` (`i18n/pt-BR.ts:80`) e a chave `unassigned`
  de `IAssignmentLabelStrings` (`assignmentLabel.ts`).
- **Normalizar token legado**: `parseAssignmentTokens` (`useInboxFilters.ts:70-86`)
  mapeia `unassigned` → `queue` (com dedup). Ponto único que cura URL ativa,
  favoritos/links compartilhados e o restore do
  `localStorage["gallo-inbox-filters"]` — sem normalização, o token stale cairia no
  branch de sellerId e o filtro degradaria silenciosamente para "Todas" (supabase) ou
  lista vazia (mock).
- **Contrato**: campo `unassigned` sai de `assignmentAny`
  (`contracts/conversations.ts:45`, arrasta mock + supabase + hook em lockstep via
  compilador). O scalar `params.unassigned` permanece (sem caller atual, semântica
  independente).
- **Predicado de `queue` fica INTACTO em todas as camadas** (engine
  `isQueuedConversation`, term `.or()` do `assignmentFilter.ts`, RPCs SQL). Com a
  invariante valendo, as populações convergem — **zero mudança de SQL nas RPCs de
  busca** (`p_unassigned` passa a ir sempre `false`; limpeza de assinatura fica para
  depois, fora deste escopo).
- Badge "Em fila", beep "cliente novo na fila" e badge do TopBar: sem mudança de
  código nem de semântica — passam a bater com o filtro.

## Fora de escopo / não tocado

- **Modelo de acesso 2 portões** (`can_access_conversation`) e RPCs gated-once de
  leitura; **signing de mídia** do lote #137 — camada congelada (feedback do dono).
- Realtime, query keys e cache do atendimento — congelados; nada aqui os toca.
- KPI **Backlog** (`kpiMath.ts:96`) e **notificações derivadas** "conversa sem
  resposta" (`derivedConditions.ts` + reconciler pg_cron): métricas de **status** com
  semântica própria (incluem `aguardando` com dono zero pós-migração; continuam corretas).
- Gate "assumir antes de responder" (`assignmentGate.ts` — por dono cru): intocado.
- Filas homônimas: fila de contatos pendentes (`contact-review`), fila de rodízio
  (PRD-213) e fila de escalações SDR — objetos distintos, nenhuma mudança.
- `autoReopenResolvedOnInbound` (Plano B do fluxo de status): segue pendente; quando
  for retomado, a reabertura deve respeitar a invariante (anotado lá no futuro plano).
- `NewConversationDialog`/`createOutbound`: sempre nasce com dono + `em_andamento` — imune.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Token `unassigned` stale em URL/localStorage | normalização no parse (ponto único), com testes |
| Beep em massa no import | guarda `isRecentEvent` + throttle já existentes (verificados) |
| `SendMessage` do Go para envios via API (duplicaria) | dedupe por `provider_message_id` no caminho do eco (já existe) |
| Regressão no webhook (caminho crítico) | núcleo puro com testes (`webhook/core.test.ts`); espelho via script de sync; rollout com smoke |
| Migração de dados vs código velho no ar | migração roda **por último**, é idempotente e pode ser reexecutada |
| Mudar `transfer_conversation` | body-only (CREATE OR REPLACE), sem mudança de assinatura/grants |

## Testes

- Engines puros (Vitest, TDD): par simétrico de transições (assign/unassign),
  parser Go aceitando `SendMessage` (eco texto + mídia + dedupe), normalização
  `unassigned`→`queue` no parse, `matchesAssignmentAny` sem o braço unassigned,
  `isQueuedConversation` inalterado (testes existentes seguem verdes).
- Core do webhook: eco Go cria conversa `aguardando`; eco com mídia armazena; eco de
  app-send continua dedupado.
- Import core: literal `aguardando` no contrato e no landing.
- Suíte de filtros: `useInboxFilters.test.ts`, `assignmentLabel.test.ts`,
  `assignmentFilter.test.ts` reescritos para o token único.
- Smoke manual (dono): filtro com URL antiga salva; importar histórico → cai em fila;
  mandar mensagem do celular (Vendas/Go) → aparece na plataforma (texto e mídia);
  devolver à fila → some de "minhas" e aparece em "Em fila"; assumir → status vira
  "Em atendimento" sozinho.

## Ordem de rollout

1. Código + testes na worktree; PR (nunca mergear sem OK).
2. Merge aprovado → `sync-whatsapp-shared` já no PR; **redeploy** de
   `whatsapp-webhook`, `whatsapp-import-history`, `whatsapp-import-history-go`.
3. **Migração de dados** via MCP com OK do dono (espelhada no Git no mesmo PR).
4. Smoke com o dono; version bump (MINOR + codinome) após validação.
