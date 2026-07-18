# Resgate de Conversa com Responsável Ausente (Sub-projeto B)

Quando uma conversa **atribuída** a um atendente fica com o cliente esperando e o atendente
está **ausente** (fora da agenda de trabalho, ou temporariamente indisponível dentro dela), o
sistema transmite a oferta para todo mundo que tem acesso àquele número e está online —
primeiro a clicar em "Atender agora" assume. Se ninguém aceitar dentro do prazo, força uma
atribuição automática. Continuação direta do sub-projeto A (`docs/dev/idle-conversation-alerts.md`),
reaproveitando `conversations.awaiting_reply_since` sem duplicar coluna/trigger.

**Spec:** `docs/superpowers/specs/2026-07-17-conversation-rescue-design.md`
**Plano:** `docs/superpowers/plans/2026-07-17-conversation-rescue.md`
**Feature dir:** `src/features/conversation-rescue/`

> ⚠️ **Status: implementado e commitado, NÃO aplicado em produção.** A migration
> (`supabase/migrations/20260717170000_conversation_rescues.sql`), as duas migrations do Task 7
> (secret do worker + agendamento `pg_cron`) e os acréscimos ao `supabase/tests/rls-regression.sql`
> estão escritos e versionados, mas **a tabela `conversation_rescues` não existe no banco de
> produção, a Edge Function `conversation-rescue-tick` não está deployada, e o job do `pg_cron`
> não está agendado**. Este é um gate deliberado e ainda aberto, pendente de OK explícito do
> dono — mesmo padrão do sub-projeto A. Além disso, a feature nasce **desligada por padrão**
> (`enabled: false`) em `IConversationRescueSettings` para toda loja (via
> `buildDefaultSettings.ts`): mesmo depois do deploy, nada acontece até o dono ligar por loja em
> `Configurações → Operação → Resgate de conversas`.

## Fluxo

```
cliente manda mensagem → awaiting_reply_since setado (sub-projeto A, trigger já existente)
                              │
              conversation-rescue-tick (pg_cron, 1x/min):
                              │
     Fase 1 — cancelResolvedRescues: para cada resgate 'broadcasting' (todas as lojas), a
              conversa ainda qualifica? (mesmo dono, awaiting_reply_since setado, status não
              terminal)
                              │
        NÃO (ausente já respondeu / conversa fechou / reatribuída por outro caminho) ──>
        status='cancelled', cancelled_reason='conversation_no_longer_waiting', FIM (sem
        notificação — ver trigger abaixo)
                              │
     Fase 2 — broadcastNewRescues: responsável ausente?
                              │
        fora da agenda (isWithinWorkSchedule = false) ──> ausência "schedule", dispara já
                              │
        dentro da agenda, availability ≠ "online" ──> ausência "temporary", dispara só se
                                                        agora - awaiting_reply_since ≥
                                                        temporaryAbsenceGraceMinutes
                              │
                cria conversation_rescues (status='broadcasting')
                              │
           painel flutuante (RescueBroadcastClaim) mostra p/ elegíveis online
                              │
        alguém clica "Atender agora" → RPC claim_conversation_rescue (repete a checagem de
        liveness da Fase 1 antes do UPDATE — defesa em profundidade) → status='claimed', FIM
                              │
     Fase 3 — resolveTimeouts: broadcast mais velho que forceAssignTimeoutMinutes e ainda
              'broadcasting'?
                              │
        sorteia (pickFallbackSeller) entre fallbackSellerIds online; se nenhum, entre todo o
        pool elegível online; se ninguém, mantém 'broadcasting' (tenta de novo no próximo tick)
                              │
                status='forced', conversations.assigned_seller_id atualizado
```

As três fases rodam na mesma invocação da Edge Function, uma vez por minuto, nesta ordem — a
Fase 1 sempre antes das outras duas, para que uma linha stale já saia `cancelled` antes de
`broadcastNewRescues` decidir se cria uma nova e antes de `resolveTimeouts` decidir se força uma
atribuição em cima dela. Nenhuma delas toca o `whatsapp-webhook` real — a atribuição inicial de
conversa nova continua como está; este sub-projeto só resgata conversas **já atribuídas** que
estagnaram.

## Modelo de dados

Migration `supabase/migrations/20260717170000_conversation_rescues.sql`.

- **Tabela `public.conversation_rescues`** — uma linha por evento de ausência que precisou de
  cobertura: `conversation_id`, `store_id`, `whatsapp_account_id`, `absent_seller_id`,
  `absence_kind` (`'schedule' | 'temporary'`), `contact_name`, `last_inbound_preview`, `status`
  (`'broadcasting' | 'claimed' | 'forced' | 'cancelled'`), `broadcast_at`, `claimed_by_seller_id`
  / `claimed_at`, `forced_seller_id` / `forced_at`, `cancelled_reason`, `created_at`.
- **Índice único parcial** `conversation_rescues_active_idx (conversation_id) WHERE status =
  'broadcasting'` — só 1 resgate ativo por conversa. A Edge Function confia nesse índice para não
  duplicar broadcasts a cada tick (um `INSERT` concorrente que colidiria vira `unique_violation`
  `23505`, tratado como esperado, não como erro — ver "Edge Function" abaixo).
- **RLS**: `enable row level security` + única policy, `conversation_rescues_select`, SELECT para
  `authenticated` gated por `public.can_access_conversation(conversation_id)` — o mesmo portão de
  instância usado em toda a Inbox (modelo de 2 portões, `docs/dev/conversation-access-model.md`).
  **Sem** policy de INSERT/UPDATE/DELETE para `authenticated`: a criação dos broadcasts e o
  fallback forçado só acontecem via `service_role` (a Edge Function, que bypassa RLS); a única
  escrita disponível ao cliente é a RPC abaixo.
- **RPC `public.claim_conversation_rescue(p_rescue_id uuid)`** — `SECURITY DEFINER`,
  `search_path=''`. Resolve `current_seller_id()` do JWT, confere `can_access_conversation` do
  chamador (`42501` se não tiver acesso), e faz o `UPDATE` condicionado a
  `status = 'broadcasting'` (concorrência otimista — primeiro grava, ganha; o `UPDATE ... RETURNING`
  não encontra linha para o segundo clique e a função levanta `already claimed` com SQLSTATE
  `P0004`). No mesmo statement, atualiza `conversations.assigned_seller_id` para o novo
  responsável e grava auditoria (`conversation_rescue_claim`).
- **Trigger `conversation_rescues_notify_resolved`** (`AFTER UPDATE`, função
  `notify_conversation_rescue_resolved`, `SECURITY DEFINER`) — dispara quando `status` muda para
  `'claimed'` ou `'forced'` e insere uma notificação in-app pontual (`dedupe_key`
  `'conv-rescue-' || id`, evento `conversa.resgatada`, canal `inApp`) para `absent_seller_id`:
  "{cliente} — conversa assumida por {novo atendente}." / "Você estava ausente quando o cliente
  entrou em contato." Mesmo padrão direto-via-trigger de `notify_conversation_participant_added`
  (evento pontual, não passa pelo reconciler periódico do sub-projeto A). A função checa
  `if new.status not in ('claimed', 'forced') then return new`, então uma transição para
  `'cancelled'` sai **sem** inserir notificação nenhuma — confirmado relendo a função (não é só
  suposição).

### Cancelamento automático quando a conversa se resolve sozinha

Cobrindo a lacuna identificada na revisão final de branch: o spec original (2026-07-17) previa
que, se o responsável ausente voltar e **responder o cliente ele mesmo** antes de alguém clicar
"Atender agora" ou antes do fallback forçado disparar, o resgate deveria se **auto-cancelar** —
sem isso, o tick reatribuía uma conversa já resolvida e disparava uma notificação enganosa
("você estava ausente, Fulano assumiu"), e qualquer elegível online podia clicar "Atender agora"
numa conversa que já não precisava de resgate. Os campos `status='cancelled'`/`cancelled_reason`
já existiam na tabela e no tipo TS desde a migration original, mas nada os escrevia — os 12 tasks
do plano implementaram fielmente o que o plano descrevia, e o plano tinha derrubado esse
comportamento ao quebrar o spec em tasks.

Duas camadas, mesma condição de liveness (`assigned_seller_id` ainda é o ausente **e**
`awaiting_reply_since` ainda setado **e** `status` da conversa ainda não-terminal):

- **Varredura por tick** (`cancelResolvedRescues` em `conversation-rescue-tick`, Fase 1, antes de
  `broadcastNewRescues`/`resolveTimeouts`) — a cada execução (1x/min), varre **todo** resgate
  `status='broadcasting'` de **todas as lojas** (mesmo as com o toggle desligado nesse meio-tempo —
  um resgate pode ter começado a transmitir antes do dono desligar a feature) e cancela qualquer um
  cuja conversa não qualifica mais: o próprio ausente respondeu (trigger do sub-projeto A zerou
  `awaiting_reply_since`), a conversa foi fechada, ou foi reatribuída por outro caminho. Por rodar
  antes das outras duas fases no mesmo tick, uma linha cancelada aqui já não existe mais como
  `broadcasting` quando `resolveTimeouts` faz sua própria consulta — nenhuma mudança adicional foi
  necessária em `resolveTimeouts` nem em `broadcastNewRescues`.
- **Recheque no momento do claim** (`claim_conversation_rescue`, RPC) — defesa em profundidade
  contra a janela de poucos segundos entre um tick e outro: mesmo que o cancelamento ainda não
  tenha rodado, a RPC repete a mesma checagem de liveness logo depois do gate de
  `can_access_conversation` e antes do `UPDATE` de concorrência otimista. Se a conversa não
  qualifica mais, a RPC **rejeita** o claim levantando uma exceção (`P0005`, "rescue no longer
  valid") em vez de deixar o clique prosseguir para um `claim` que não devia existir — mas ela
  **não** persiste `status='cancelled'` na linha, e estruturalmente não pode: em PL/pgSQL um
  `RAISE EXCEPTION` sem `BEGIN...EXCEPTION...END` ao redor desfaz a transação inteira da chamada,
  incluindo qualquer `UPDATE` que tivesse rodado antes dele na mesma função — por isso a migration
  nem tenta esse `UPDATE` (seria trabalho morto, sempre desfeito). Quem efetivamente grava
  `status='cancelled'` na linha é sempre a varredura por tick acima, que roda sem `raise` e comita
  normalmente. Efeito líquido: um resgate obsoleto é rejeitado na hora se alguém tentar
  reivindicá-lo, mas a linha em si (e portanto sua visibilidade no painel `RescueBroadcastClaim`
  para OUTROS vendedores online) só some no ciclo de tick seguinte (≤ 1 min), não
  instantaneamente.

No caso do tick, a transição é para `'cancelled'` com `cancelled_reason =
'conversation_no_longer_waiting'`, e por não estar em `('claimed', 'forced')` o trigger
`conversation_rescues_notify_resolved` não dispara — nenhuma notificação é criada para um
cancelamento (o ausente já sabe que respondeu; não há "novidade" para avisar). No caso do recheque
da RPC não há transição de status alguma para o trigger observar — só a exceção `P0005` devolvida
a quem tentou o claim.

## Engines puros (`src/features/conversation-rescue/engine/`)

- **`determineAbsence(input): AbsenceKind | null`** — recebe `isWithinSchedule` **já calculado**
  (injeção de dependência: quem chama decide como computar a agenda — o client usaria
  `isWithinWorkSchedule` de `@/features/access/engine/workSchedule`, a Edge Function usa o mirror
  Deno). Fora da agenda ⇒ `'schedule'` imediatamente, sem carência. Dentro da agenda e
  `availability !== 'online'` (`'ausente' | 'ocupado' | 'offline'` tratados igual) ⇒ `'temporary'`
  só quando `now - awaiting_reply_since >= temporaryAbsenceGraceMinutes` (limite inclusivo — exatos
  15 min já conta). Testado em `determineAbsence.test.ts` (7 casos).
- **`pickFallbackSeller(candidateIds, seed): ID | null`** — sorteio **determinístico**: hash
  FNV-1a do `seed` módulo o tamanho da lista, nunca `Math.random()`. Mesmo `(candidatos, seed)`
  sempre escolhe o mesmo id — testável, mas com distribuição realista entre seeds diferentes.
  Testado em `pickFallbackSeller.test.ts` (5 casos).

## Espelhamento server-side (`scripts/sync-conversation-rescue-shared.ts`)

A Edge Function roda em Deno e não pode importar `src/` diretamente, então um script de sync
copia os arquivos-fonte para `supabase/functions/_shared/`, com banner "AUTO-GENERATED MIRROR —
DO NOT EDIT" e extensões `.ts` adicionadas aos imports relativos (Deno exige a extensão
explícita):

| Origem | Destino |
|---|---|
| `src/features/conversation-rescue/engine/*.ts` (exceto `*.test.ts`) | `supabase/functions/_shared/conversation-rescue/engine/*.ts` |
| `src/features/access/engine/workSchedule.ts` | `supabase/functions/_shared/access/workSchedule.ts` |
| `src/features/admin-settings/utils/accessRecipients.ts` | `supabase/functions/_shared/access/accessRecipients.ts` |

Rodar com `bun run scripts/sync-conversation-rescue-shared.ts` (imprime `synced 5 files →
supabase/functions/_shared/{conversation-rescue,access}/` — 3 engines + 2 arquivos avulsos).

> ⚠️ **Regra dura:** qualquer mudança em `src/features/conversation-rescue/engine/*`,
> `src/features/access/engine/workSchedule.ts` ou
> `src/features/admin-settings/utils/accessRecipients.ts` exige rodar o script de sync de novo **e
> redeployar** `conversation-rescue-tick` — senão a Edge Function continua rodando a lógica velha
> em produção enquanto o client já mudou. Mesma disciplina de `scripts/sync-sdr-shared.ts` /
> `scripts/sync-whatsapp-shared.ts`.

## Edge Function `conversation-rescue-tick`

`supabase/functions/conversation-rescue-tick/index.ts`. Agendada via `pg_cron` a cada 1 minuto
(mesmo padrão do `sdr-backstop-tick`): worker secret no header `x-worker-secret`, resolvido via
`createSecretResolver`/Vault e comparado com `verifyWorkerSecret`; cliente admin `service_role`
(bypassa RLS). Três fases por execução, nesta ordem:

1. **`cancelResolvedRescues`** — **não** filtra por loja habilitada (varre `status='broadcasting'`
   de qualquer loja, mesmo desligada nesse meio-tempo); ver subseção "Cancelamento automático
   quando a conversa se resolve sozinha" acima para a condição de liveness e a motivação. Roda
   antes das outras duas fases — nenhuma delas precisou de ajuste para respeitar o cancelamento,
   já que ambas só enxergam `status='broadcasting'` e a linha cancelada já saiu dessa lista antes
   de chegarem nela. **Kill-switch (revisão 2026-07-18):** broadcasts de lojas com o toggle
   desligado são cancelados com `cancelled_reason='store_disabled'` — sem isso, desligar a
   feature deixava ofertas válidas visíveis/reclamáveis para sempre (painel e RPC não consultam o
   toggle) e elas forçariam em massa no primeiro tick após religar.
2. **`broadcastNewRescues`** — itera as lojas com `settings->conversationRescue->>enabled =
   'true'`; busca conversas com `assigned_seller_id` e `awaiting_reply_since`
   preenchidos, `status` não-terminal, e **sem** resgate já `broadcasting` para aquela conversa.
   Aplica o **cooldown de re-broadcast** (60 min pós-resolução, por época de espera — ver
   `rescueCooldown.ts`; o fetch é ancorado em `or(claimed_at, forced_at, created_at ≥ cutoff)`,
   os MESMOS relógios do helper — ancorar só em `created_at` deixava escapar resgates que ficaram
   `broadcasting` mais tempo que a janela antes de resolver). Para cada candidata: carrega o
   seller responsável, roda `isWithinWorkSchedule` + `determineAbsence` (que embute
   `maxClientWaitHours`); se ausente, resolve o nome do contato (cliente ou lead) e o texto da
   última mensagem inbound, e insere a linha em `conversation_rescues`.
3. **`resolveTimeouts`** — itera as lojas com `settings->conversationRescue->>enabled = 'true'`;
   busca resgates `status='broadcasting'` com `broadcast_at` mais velho que
   `forceAssignTimeoutMinutes`. **Re-valida ANTES de forçar (revisão 2026-07-18):** re-checa a
   condição estrutural e se o ausente está genuinamente PRESENTE (online **e** dentro do turno) —
   nesses casos cancela com `cancelled_reason='no_longer_qualifies_at_force'` em vez de
   reatribuir (forçar é o passo irreversível). Deliberadamente **não** re-aplica graça nem
   `maxClientWaitHours` aqui: a linha era fresca quando criada, e um resgate que envelheceu além
   da janela com o pool vazio (fim de semana) precisa forçar no primeiro tick com gente online —
   cancelá-lo abandonaria o cliente, já que `broadcastNewRescues` nunca recria uma espera velha
   demais. Erros transientes de leitura nas re-checagens fazem `continue` (retry no próximo
   tick), nunca cancelamento. Se ainda qualifica, calcula o pool elegível
   (`resolveEligiblePool` — sellers ativos da loja com acesso ao `whatsapp_account_id` via
   `whatsapp_account_access_rules`/`resolveAccessRecipients`, com bypass para papéis `owner`/
   `manager`, excluindo o ausente, filtrados por `availability === 'online'` e dentro da própria
   agenda). Prioriza `fallbackSellerIds` (config da loja) que estejam nesse pool; se nenhum, usa o
   pool inteiro; se o pool estiver vazio, **não força nada** (a linha continua `broadcasting`,
   tentada de novo no próximo tick). Sorteia com `pickFallbackSeller(pool, `${rescueId}-${broadcastAt}`)`.

**Correção aplicada na revisão do Task 7** (a versão original tinha uma corrida de
duplo-assignment no caminho do fallback forçado):

- O `UPDATE` que vira `status='forced'` agora encadeia `.eq("status", "broadcasting").select("id")`
  e checa `updated.length === 0` antes de prosseguir — se outro tick concorrente já resolveu a
  mesma linha, este tick simplesmente pula (`continue`) em vez de reatribuir
  `conversations.assigned_seller_id` e duplicar a auditoria. Mesmo idioma do `sdr-backstop-tick`.
- **Logging de erro em todos os pontos de falha** (`ctx.log.error`), tanto em
  `broadcastNewRescues` quanto em `resolveTimeouts`: falha ao inserir o broadcast, falha ao
  atualizar `conversation_rescues`, falha ao atualizar `conversations.assigned_seller_id`, falha ao
  gravar `audit_logs`. A única exceção tratada como **esperada** (não logada como erro) é o
  `unique_violation` do Postgres (`error.code === "23505"`) no `INSERT` de
  `broadcastNewRescues` — acontece quando dois ticks correm ao mesmo tempo e ambos tentam
  transmitir a mesma conversa; o índice único (`conversation_rescues_active_idx`) rejeita o
  segundo, que é o comportamento correto, não uma falha genuína.

## `pg_cron`

Duas migrations além da tabela:

- `supabase/migrations/20260717180000_conversation_rescue_worker_secret.sql` — cria
  `CONVERSATION_RESCUE_WORKER_SECRET` no Vault (mesmo padrão do `SDR_WORKER_SECRET`), idempotente
  (`if not exists`).
- `supabase/migrations/20260717190000_conversation_rescue_cron_trigger.sql` — `cron.schedule`
  `'conversation-rescue-tick'` com expressão `'* * * * *'` (1x/min), chamando
  `net.http_post` para `https://<project>.supabase.co/functions/v1/conversation-rescue-tick` com o
  worker secret resolvido via `public.integration_secret_get(...)` no header `x-worker-secret`,
  timeout de 25s. **Ordem de aplicação:** depois da função deployada e depois da migration do
  secret — o comentário no arquivo é explícito sobre isso.

## Provider Pattern

Contrato `IConversationRescuesProvider` (`src/providers/data/contracts/conversationRescues.ts`):

```ts
interface IConversationRescuesProvider {
  list(): Promise<IConversationRescue[]>;   // só status='broadcasting'; RLS faz o resto
  claim(rescueId: ID): Promise<IConversationRescue>;
}
```

- **Mock** (`impl/mock/conversationRescues.ts`) — `list()` sempre retorna `[]` (não existe
  `pg_cron` real no modo Demonstração, então nenhum resgate nasce organicamente); `claim()`
  lança erro explícito em vez de no-op silencioso (inalcançável pela UI, já que o painel some sem
  entradas).
- **Supabase** (`impl/supabase/conversationRescues.ts`) — `list()` faz `select("*").eq("status",
  "broadcasting").order("broadcast_at")`; `claim()` chama a RPC `claim_conversation_rescue`.
- Ligado no `factory.ts` (`mockProviders.conversationRescues` /
  `supabaseProviders.conversationRescues`) e exportado no barrel (`useConversationRescuesProvider`,
  `IConversationRescuesProvider`) como qualquer outro provider — sem exceção às regras de
  fronteira do ESLint.

## UI (`src/features/conversation-rescue/`)

- **`RescueBroadcastClaim`** (mirror de `UrgentBroadcastClaim` do SDR urgente) — painel flutuante
  fixo (`fixed bottom-20 right-4`, monta em `AppLayout` ao lado de `UrgentBroadcastClaim`),
  mostrando cada resgate em transmissão que o usuário logado pode ver (a RLS já filtra por
  `can_access_conversation`): nome do contato, trecho da última mensagem, tempo desde o broadcast,
  botão "Atender agora". Ao clicar: chama `claim()`, navega para
  `/app/atendimento/$id` em caso de sucesso, toast de erro ("Outro atendente já assumiu esta
  conversa.") se perdeu a corrida.
- **`useRescueBroadcastQueue`** (mirror de `useUrgentBroadcastQueue`, mas mais simples) —
  polling de **15s**, sem Realtime, sem tocar cache/query-keys do Atendimento (camada congelada).
  Após um `claim()` bem-sucedido, chama `refresh()` imediatamente (sem esperar o próximo tick de
  15s).
- **`ConversationRescueSettingsPage`** / **`ConversationRescueSettingsSection`** — tela de
  configuração por loja, rota `/app/configuracoes/atendimento/resgate-conversas`, grupo
  **"Operação"** do `SettingsLayout` (ao lado de "Alertas de ociosidade"), gate **Owner-only**
  (`roles: ["Owner"]` no item do menu + `requireAuth` na rota). Campos: liga/desliga,
  `temporaryAbsenceGraceMinutes` e `forceAssignTimeoutMinutes` (inputs numéricos, clamp
  client-side 1–120 min), seletor multi-checkbox de `fallbackSellerIds` sobre os vendedores ativos
  da loja. Salvamento único via botão "Salvar" (não é form controlado auto-save).
- **`useConversationRescueSettings`** — hook de leitura/escrita sobre
  `IPlatformSettings.conversationRescue` via `useSettingsProvider()`, com `auditLog` no `update()`.

## Configuração por loja

`stores.settings->'conversationRescue'` (mesmo padrão jsonb do `idleAlerts`):

```ts
interface IConversationRescueSettings {
  enabled: boolean;                        // default false
  temporaryAbsenceGraceMinutes: number;     // default 15
  forceAssignTimeoutMinutes: number;        // default 5
  fallbackSellerIds: ID[];                  // default []
  maxClientWaitHours: number;               // default 24 (incidente 2026-07-18)
}
```

`DEFAULT_CONVERSATION_RESCUE_SETTINGS` vive em
`src/features/conversation-rescue/config/defaults.ts` e é consumido em dois pontos:

- `src/providers/data/engine/buildDefaultSettings.ts` — toda **loja nova** já nasce com
  `conversationRescue: clone(DEFAULT_CONVERSATION_RESCUE_SETTINGS)` (ajuste feito durante a
  revisão do Task 1, espelhando a mesma linha para `idleAlerts` — sem esse fix, lojas criadas
  depois do deploy ficariam sem o campo e cairiam no fallback do hook/tick, que já assume o
  default, mas de forma implícita).
- `useConversationRescueSettings` — fallback em runtime se `platform.conversationRescue` vier
  `undefined` (lojas existentes antes desta migration, ou settings malformadas).

Tela: `Configurações → Operação → Resgate de conversas` (Owner-only). **Toda loja nasce com
`enabled: false`** — precisa ser ligada uma a uma pelo dono depois de avaliar o cenário.

## Testes

- **Vitest TDD** nos engines: `determineAbsence.test.ts` (9 casos — os 6 originais + janela
  máxima: backlog `temporary`, backlog `schedule`, limite exato de 24h inclusivo),
  `rescueCooldown.test.ts` (8 casos — vazio, claim recente, cooldown vencido, `forcedAt` vence
  `createdAt`, piso `createdAt` p/ cancelados, entrada recente entre antigas, limite exato
  exclusivo, constante = 60), `pickFallbackSeller.test.ts` (5 casos — lista vazia, candidato
  único, determinismo por seed, distribuição entre seeds diferentes, id sempre pertence à lista).
- **`supabase/tests/rls-regression.sql`** — bloco "Offline-rescue (spec 2026-07-17)": planta um
  resgate `broadcasting` numa conversa atribuída ao Owner (inacessível para o seller "lucas"),
  depois assere: (1) SELECT de `conversation_rescues` nega a linha para quem não acessa a
  conversa; (2) `claim_conversation_rescue` nega o claim do mesmo jeito (`42501`); (3) depois de
  simular um claim bem-sucedido, uma segunda chamada de `claim_conversation_rescue` na mesma linha
  falha com `P0004` ("already claimed").
  **Correção aplicada na revisão do Task 11:** os dois blocos `exception` originais podiam nunca
  falhar de verdade — foram estreitados para checar o SQLSTATE exato esperado
  (`when insufficient_privilege` / `if sqlstate <> 'P0004' then raise`), então um regression real
  (RPC parar de negar o acesso, ou permitir claim duplo) agora derruba o teste em vez de passar em
  silêncio. **Caso novo (incidente 2026-07-18):** planta um segundo resgate com o Owner como
  ausente e assere que o próprio ausente não consegue reclamar (`P0006`).
- Gate de CI: `bun run build` + `bun run test`.

## Incidente 2026-07-18 (1º smoke em produção) e correções

O dono ligou o toggle da Matriz às ~19:51 UTC e em segundos a tela encheu de ofertas; às 20:02 o
tick forçou 8 atribuições para 4 vendedores online antes do disable ganhar a corrida (revertidas
com aprovação do dono — audit `conversation_rescue_incident_revert`). Cinco causas combinadas:

1. **Loop de re-broadcast** — o claim não limpa `awaiting_reply_since` (só uma resposta real
   limpa, trigger do sub-projeto A) e não havia cooldown: se quem assumiu não estava `online`, a
   MESMA conversa re-qualificava no tick seguinte. A carência de 15 min usa
   `awaiting_reply_since` como relógio — para esperas antigas ela está permanentemente vencida.
2. **Painel sem filtro de audiência** — a oferta aparecia para qualquer usuário que a RLS
   deixasse ver (Owner vê tudo), sem checar se o espectador estava online nem se era o próprio
   ausente. O dono (offline, ausente) viu e reclamou as próprias conversas.
3. **RPC aceitava self-claim** — alimentando o loop por API.
4. **Avalanche de backlog** — ligar o toggle varria o estoque inteiro de esperas antigas
   (herdadas do backfill do sub-projeto A), não só eventos novos.
5. **`availability` manual** — o dono navegando na plataforma contava como "ausente temporário"
   (limitação conhecida, documentada abaixo; presença real segue fora de escopo).

Correções (todas nesta base de código):

- **Cooldown de 60 min pós-resolução** — `engine/rescueCooldown.ts`
  (`RESCUE_REBROADCAST_COOLDOWN_MINUTES`, `isWithinRescueCooldown`, puro + testado + espelhado);
  `broadcastNewRescues` pula conversas com resgate resolvido (claimed/forced/cancelled) na
  janela. Para linhas `cancelled` o piso é `created_at` (não há coluna de timestamp de
  cancelamento) — aproximação aceitável porque broadcasts vivem minutos.
- **Janela máxima de espera** — `maxClientWaitHours` (default 24, parametrizável na tela) checado
  PRIMEIRO em `determineAbsence`, antes inclusive do ramo `schedule`: espera mais velha que a
  janela nunca gera resgate — é território dos alertas de ociosidade (sub-projeto A). Isso também
  imuniza o enable contra o backlog.
- **Filtro de audiência no painel** — `useRescueBroadcastQueue` só popula a fila se o espectador
  está `online` (via `sellersProvider.get(sellerId)` no mesmo poll de 15 s) e nunca inclui
  resgates onde ele é o próprio ausente. Painel com teto visual (3 cards + "Mostrar mais N",
  `max-h-[70vh]` com scroll).
- **Guarda anti-self-claim na RPC** — migration
  `20260718210000_conversation_rescue_claim_guards.sql` re-cria `claim_conversation_rescue` com
  rejeição `P0006` quando `claimer = absent_seller_id`, posicionada ANTES do recheque de
  vivacidade (P0005) — self-claim deve vencer staleness, e o teste RLS depende dessa ordem.

Segunda rodada (achados da revisão adversarial multi-lente do próprio fix, 2026-07-18):

- **Kill-switch de verdade** — `cancelResolvedRescues` cancela broadcasts de lojas desligadas
  (`store_disabled`); antes, desligar o toggle deixava ofertas válidas vivas para sempre.
- **Re-validação pré-força** — `resolveTimeouts` re-checa o estado atual antes de reatribuir e
  cancela (`no_longer_qualifies_at_force`) quando a conversa mudou ou o ausente está genuinamente
  presente (online + dentro do turno). Fecha o "vendedor voltou online no minuto 3 mas perdia a
  conversa no minuto 5"; combinado com o kill-switch, elimina as linhas zumbis do re-enable.
  Graça e janela **não** se re-aplicam na força (um resgate de fim de semana deve forçar na
  segunda, não ser cancelado ao cruzar 24h).
- **Caminhos de erro fail-safe no tick** — erro transiente no fetch de stores não vira "todas as
  lojas desligadas" (pularia o kill-switch e cancelaria a plataforma inteira como
  `store_disabled`); erro nas leituras de liveness/pré-força faz `continue` (retry no próximo
  tick) em vez de cancelar com razão falsa.
- **Fetch do cooldown re-ancorado** — `or(claimed_at/forced_at/created_at ≥ now−60min)` em vez de
  `created_at ≥ now−24h`: resgate resolvido tarde (fim de semana com pool vazio) não escapa mais
  do cooldown quando `maxClientWaitHours > 24`.
- **Cooldown por época de espera** — `isWithinRescueCooldown` ganhou `awaitingReplySince`:
  resgate resolvido ANTES da espera atual começar não suprime (mensagem nova do cliente = época
  nova, resgate imediato); no loop do incidente a espera sempre PREdata o claim, então o loop
  continua fechado.
- **Guarda de sequência no poll** — `useRescueBroadcastQueue` descarta respostas de polls antigos
  (um fetch lento não ressuscita mais o card recém-assumido).
- **Sonda de schema no teste RLS** — o caso P0006 se auto-pula enquanto a migration
  `20260718210000` não estiver aplicada no banco-alvo do CI (mesma convenção dos blocos irmãos),
  senão o PR nasceria com o gate vermelho por definição.

## Rollout

1. ✅ Migrations aplicadas em prod (2026-07-18, com OK do dono): tabela/RLS/RPC, worker secret e
   `pg_cron` (job `conversation-rescue-tick`, 1×/min, `active=true`).
2. ✅ Edge Function `conversation-rescue-tick` deployada (ACTIVE).
3. ⚠️ **Incidente no 1º smoke** (seção acima) — feature desligada; correções aguardando:
   aplicar `20260718210000_conversation_rescue_claim_guards.sql` + redeploy do tick (espelhos
   re-sincronizados) + deploy do frontend, cada gate com OK do dono.
4. ⏳ Religar `enabled` por loja **depois** das correções em produção, de preferência com
   `fallbackSellerIds` configurado.

## Fora de escopo (nesta entrega)

- **Presença "real"** (heartbeat client-side ativo) — usa só `sellers.availability` (manual +
  auto-offline por inatividade, PR #140) combinada com a agenda de trabalho (PRD-212). Não há
  novo mecanismo de presença.
- **Alterar o `whatsapp-webhook` real** — a atribuição inicial de conversa nova continua como
  está; este sub-projeto só resgata conversas **já atribuídas** que estagnaram.
- **Modo Demonstração com tick real** — o mock não simula o cenário via um botão de teste (não
  havia esse requisito no plano final); simplesmente não há resgates no modo mock.

## Limitações conhecidas

- **Sem presença real** — a detecção de ausência depende inteiramente de
  `sellers.availability` (campo manual, com auto-offline por inatividade) combinado com a agenda
  de trabalho. Um atendente que esquece de marcar "ausente" mas está parado sem responder só é
  pego pelo alerta de ociosidade do sub-projeto A (em horas), não por este sub-projeto (que reage
  em minutos, mas só se `availability` refletir a realidade).
- **Falha após a virada de status no fallback forçado** — se o `UPDATE` em
  `conversations.assigned_seller_id` falhar depois que a linha de `conversation_rescues` já virou
  `forced` (erro logado via `ctx.log.error`, mas não revertido), essa linha específica nunca mais
  é revisitada por `resolveTimeouts` (que só olha `status='broadcasting'`) — fica presa em
  `forced` com uma atribuição que não aconteceu de fato no lado de `conversations`. Como
  `conversations.assigned_seller_id` não mudou, a mesma conversa ainda cumpre os critérios de
  `broadcastNewRescues` no próximo tick (nenhum resgate `broadcasting` ativo) e tende a gerar uma
  **nova** linha de broadcast — a recuperação acontece via um registro novo, não pela correção do
  antigo.
- **Contadores `created`/`forced` podem superestimar** o que de fato aconteceu — ambos são
  incrementados assim que a própria linha de `conversation_rescues` é gravada/atualizada, mesmo
  que uma escrita **downstream** (a atualização em `conversations` ou o `INSERT` em `audit_logs`)
  falhe depois e seja apenas logada como erro, não propagada. O retorno `{ created, forced }` da
  função é, portanto, um limite superior otimista, não uma confirmação de ponta a ponta.
- **Sem notificação separada quando ninguém está online no fallback** — se, no momento de forçar
  a atribuição, nem a lista de reserva nem o pool elegível têm ninguém online, o resgate
  simplesmente continua `broadcasting` (tenta de novo no próximo tick) e **ninguém é avisado** por
  este sub-projeto especificamente. O único backstop nesse extremo é o alerta de ociosidade do
  sub-projeto A, que eventualmente escala em horas — decisão deliberada (spec 2026-07-17, "Fora de
  escopo"), para não duplicar um segundo canal de notificação por cima do que já existe.

## Referências

- `docs/superpowers/specs/2026-07-16-idle-conversation-alerts-design.md` — sub-projeto A,
  fundações reaproveitadas (`awaiting_reply_since`, evento `conversa.ociosa`)
- `docs/dev/idle-conversation-alerts.md` — doc as-built do sub-projeto A
- `docs/dev/conversation-access-model.md` — modelo de acesso (2 portões), `can_access_conversation`
- `supabase/functions/sdr-backstop-tick/` — padrão de tick via `pg_cron`
- `src/features/sdr-escalation/` — padrão de transmissão + claim first-wins
  (`UrgentBroadcastClaim.tsx`, `useUrgentBroadcastQueue.ts`)
- `src/features/access/engine/workSchedule.ts` — engine de agenda (PRD-212)
