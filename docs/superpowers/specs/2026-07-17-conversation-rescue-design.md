# Resgate de conversa com responsável ausente — Sub-projeto B (design)

> Continuação do sub-projeto A (`docs/superpowers/specs/2026-07-16-idle-conversation-alerts-design.md`,
> seção "Fora de escopo — Sub-projeto B"). Reaproveita as fundações entregues lá:
> `conversations.awaiting_reply_since`, o evento `conversa.ociosa` e o RPC de resumo.

## Contexto e objetivo

O sub-projeto A avisa o atendente/gestor quando uma conversa atribuída fica ociosa, mas por
horas. Este sub-projeto cobre um cenário mais agudo: o cliente manda mensagem **agora** e o
responsável está **ausente** — de férias, saiu no meio do expediente, ou simplesmente fora do
horário de trabalho. Em vez de deixar a mensagem esperando horas até o alerta de ociosidade
disparar, o sistema oferece a conversa a outro atendente disponível, e força uma atribuição se
ninguém assumir.

## Decisões

| # | Decisão | Escolha |
|---|---|---|
| D1 | Detecção de ausência | Combinação: agenda de trabalho (PRD-212) decide ausência "de um dia pro outro"; `sellers.availability` decide ausência "temporária" dentro da agenda |
| D2 | Folga antes de disparar (ausência temporária) | Configurável por loja, **padrão 15min** — reaproveita o relógio do `awaiting_reply_since`, não um novo timestamp de "desde quando ausente" |
| D3 | Gatilho | Varredura via `pg_cron` a cada 1min (mesmo padrão do `sdr-backstop-tick`), **não** toca o `whatsapp-webhook` |
| D4 | Pool elegível | Só quem já tem acesso àquele número (`whatsapp_account_access_rules`), online, dentro da própria agenda |
| D5 | Modelo de oferta | Transmissão simultânea, primeiro a clicar "Atender agora" assume (reaproveita o padrão `UrgentBroadcastClaim`/`useUrgentBroadcastQueue` do SDR urgente) — **não** é sequencial com recusa explícita |
| D6 | Sem ninguém aceitar | Força atribuição automática (não só notifica Owner/Gestor) |
| D7 | Prazo até forçar | Configurável por loja, **padrão 5min** |
| D8 | Escolha no fallback forçado | Sorteia entre a lista de reserva (`fallbackSellerIds`) que estiverem online; se nenhum da lista estiver online, sorteia entre todos os elegíveis online; se ninguém elegível estiver online, mantém em transmissão e notifica Owner/Gestor (não força sobre ninguém) |
| D9 | Alcance da troca | Só `conversations.assigned_seller_id` — a carteira (`customers.seller_id`) não muda |
| D10 | Notificação ao ausente | Ao voltar, recebe notificação in-app de que a conversa foi assumida por outro atendente |

## Fluxo

```
cliente manda mensagem → awaiting_reply_since setado (sub-projeto A)
                              │
                    tick (1x/min) avalia:
                              │
          responsável ausente? ──não──> nada acontece (segue o fluxo normal do sub-projeto A)
                              │sim
          ausência "dia pro outro" (fora da agenda)?
                              │                              │
                             sim                             não (dentro da agenda,
                              │                                   availability≠online)
                dispara agora                    cliente esperando ≥ temporaryAbsenceGraceMinutes?
                              │                                   │sim
                              └──────────────┬────────────────────┘
                                             ▼
                          cria conversation_rescues (status=broadcasting)
                                             │
                          painel flutuante mostra p/ elegíveis online
                                             │
                    alguém clica "Atender agora" ──sim──> claim (RPC), status=claimed, FIM
                                             │não, dentro de forceAssignTimeoutMinutes
                                             ▼
                    ninguém clicou até o prazo:
                       - alguém do fallback online? → sorteia entre eles, status=forced
                       - senão, alguém elegível online? → sorteia entre todos, status=forced
                       - senão → continua broadcasting, notifica Owner/Gestor
                                             │
                    responsável original responde antes de tudo isso? → cancela (awaiting_reply_since zera)
```

## Detecção & gatilho

- Nova Edge Function `conversation-rescue-tick`, agendada via `pg_cron` a cada 1 minuto — mesmo
  padrão do `sdr-backstop-tick` (worker secret, `servePost`, cliente admin service-role).
- Varre `conversations` com `awaiting_reply_since IS NOT NULL`, `status` não-terminal,
  `assigned_seller_id IS NOT NULL`, `stores.settings->'conversationRescue'->>'enabled' = true`, e
  **sem** `conversation_rescues` ativo (`status = 'broadcasting'`) para aquela conversa.
- Para cada uma, busca o seller responsável e roda a mesma decisão em TypeScript (Deno, sem
  necessidade de mirror SQL — diferente do sub-projeto A, aqui a lógica roda uma única vez,
  dentro da própria Edge Function):
  - `isWithinWorkSchedule(seller.workSchedule, now)` — mesma engine pura do PRD-212
    (`src/features/access/engine/workSchedule.ts`), copiada para
    `supabase/functions/_shared/access/workSchedule.ts` (mesmo padrão de espelhamento usado em
    `_shared/sdr-escalation/` e `_shared/whatsapp/`).
  - Fora da agenda ⇒ ausência "dia pro outro" ⇒ dispara.
  - Dentro da agenda e `seller.availability !== 'online'` ⇒ ausência "temporária" ⇒ dispara só se
    `now - awaiting_reply_since >= temporaryAbsenceGraceMinutes`.
  - Dentro da agenda e `availability === 'online'` ⇒ não ausente, nada acontece (é o
    sub-projeto A que cobre esse caso, em horas).
- Se disparar: calcula o pool elegível (ver abaixo), insere `conversation_rescues`
  (`status='broadcasting'`, `broadcast_at=now`), sem notificação separada — o painel flutuante já
  lê a tabela.
- No mesmo tick (ou native follow-up), varre `conversation_rescues` com `status='broadcasting'` e
  `broadcast_at` mais velho que `forceAssignTimeoutMinutes` ⇒ aplica o fallback forçado (D8).

## Elegibilidade & oferta

- Pool elegível = sellers com regra de acesso àquele `whatsapp_account_id`
  (`whatsapp_account_access_rules`, mesma lógica pura de `resolveAccessRecipients` —
  reimplementada em TS puro dentro da Edge Function, já que ela roda em Deno e não pode importar
  `src/` diretamente) **menos** o próprio ausente, filtrados por `availability === 'online'` e
  `isWithinWorkSchedule(seller, now) === true`.
- UI nova em `src/features/conversation-rescue/`:
  - `RescueBroadcastClaim` (componente, mirror de `UrgentBroadcastClaim`) — painel flutuante
    mostrando cada resgate em transmissão que o usuário logado pode ver (RLS já filtra por
    `can_access_conversation`), com nome do cliente, trecho da última mensagem e botão
    "Atender agora".
  - `useRescueBroadcastQueue` (hook, mirror de `useUrgentBroadcastQueue`) — polling simples
    (15s + evento local `window` pra refresh imediato ao clicar), **sem Realtime, sem tocar
    cache/query-keys do Atendimento** (camada congelada).
  - `claim()` chama a RPC `claim_conversation_rescue(rescue_id)`.
- RPC `claim_conversation_rescue` — `SECURITY DEFINER`, checa `can_access_conversation` pro
  chamador, atualiza `conversation_rescues` (`status='claimed'`, `claimed_by_seller_id`,
  `claimed_at`) só se ainda `status='broadcasting'` (concorrência otimista — primeiro grava,
  demais recebem erro "outro atendente já assumiu"), e no mesmo statement atualiza
  `conversations.assigned_seller_id` para o novo responsável. Grava auditoria
  (`conversation_rescue_claim`).

## Fallback forçado

- O próprio tick (ou uma segunda função, `conversation-rescue-force-tick`, a definir na fase de
  plano conforme organização do código) aplica quando `broadcast_at` estourou
  `forceAssignTimeoutMinutes`:
  1. Sorteia entre `fallbackSellerIds` (config da loja) que estiverem `online` agora.
  2. Se nenhum, sorteia entre todo o pool elegível (mesmo cálculo da transmissão) que estiver
     `online`.
  3. Se ninguém, mantém `status='broadcasting'` (tenta de novo no próximo tick) e emite uma
     notificação (mesmo padrão do timeout do SDR urgente) para Owner/Gestor — "nenhum atendente
     disponível para assumir a conversa de {cliente}, distribua manualmente".
- Sorteio determinístico o suficiente para teste (seed pelo id da conversa + hora do tick — sem
  `Math.random()` non-determinístico "puro"; padrão já usado no engine de rodízio PRD-213).
- Atualiza `conversation_rescues` (`status='forced'`, `forced_seller_id`, `forced_at`) e
  `conversations.assigned_seller_id`, grava auditoria (`conversation_rescue_forced`).

## Dados

```sql
create table public.conversation_rescues (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id),
  store_id uuid not null references public.stores(id),
  whatsapp_account_id uuid references public.whatsapp_accounts(id),
  absent_seller_id uuid not null references public.sellers(id),
  absence_kind text not null check (absence_kind in ('schedule', 'temporary')),
  status text not null default 'broadcasting'
    check (status in ('broadcasting', 'claimed', 'forced', 'cancelled')),
  broadcast_at timestamptz not null default now(),
  claimed_by_seller_id uuid references public.sellers(id),
  claimed_at timestamptz,
  forced_seller_id uuid references public.sellers(id),
  forced_at timestamptz,
  cancelled_reason text,
  created_at timestamptz not null default now()
);

-- só 1 resgate ativo por conversa
create unique index conversation_rescues_active_idx
  on public.conversation_rescues (conversation_id)
  where status = 'broadcasting';
```

- **RLS**: SELECT gated por `can_access_conversation(conversation_id)` (reaproveita o helper
  `SECURITY DEFINER` do modelo de 2 portões — nenhuma lógica de acesso nova pro cliente). INSERT
  só `service_role` (a Edge Function). UPDATE só via as duas RPCs `SECURITY DEFINER`
  (`claim_conversation_rescue`, e a interna usada pelo force-tick) — sem policy de UPDATE direto
  pra `authenticated`.
- **Settings**: `stores.settings->'conversationRescue'` =
  `{ enabled: false, temporaryAbsenceGraceMinutes: 15, forceAssignTimeoutMinutes: 5, fallbackSellerIds: [] }`
  (mesmo padrão jsonb do `idleAlerts`) — **desligado por padrão** em todas as lojas.
- **Provider Pattern**: novo provider `conversationRescues` (38º) — contrato mínimo
  `list(): Promise<IConversationRescue[]>` (filtra `status='broadcasting'`, RLS faz o resto) +
  `claim(rescueId): Promise<IConversationRescue>` (chama a RPC). Impl mock calcula
  deterministicamente sobre o `mockStore` (mesmos engines TS reaproveitados no client, para o
  modo Demonstração poder simular o cenário — sem tick real, mas com um botão/ação de teste,
  a definir no plano).

## UI de configuração

- Página nova `IdleAlertsRescuePage`-equivalente (nome definitivo no plano) em
  `src/features/admin-settings/pages/`, rota `/app/configuracoes/atendimento/resgate-conversas`,
  grupo "Operação" do `SettingsLayout` (ao lado de "Alertas de ociosidade"), gate Owner-only.
- Campos: liga/desliga, `temporaryAbsenceGraceMinutes`, `forceAssignTimeoutMinutes`, seletor
  multi-seleção de `fallbackSellerIds` (lista de vendedores ativos da loja).

## Notificações

- Ao resolver (claim ou forced), grava notificação in-app direta para `absent_seller_id` — evento
  novo `conversa.resgatada` no vocabulário (`src/providers/notifications/events.ts`). Diferente do
  `conversa.ociosa` do sub-projeto A, este é um evento pontual (não precisa do reconciler
  periódico) — inserido diretamente pela RPC de claim / pelo force-tick no momento em que
  acontece.
- Texto: "Sua conversa com {cliente} foi assumida por {atendente} enquanto você estava ausente."

## Erros e degradação

- Tick falha ⇒ log/Sentry, próxima execução (1min depois) tenta de novo — nenhuma conversa fica
  travada por mais que alguns minutos.
- RPC de claim falha por concorrência (outro já assumiu) ⇒ erro amigável no client, painel
  atualiza e remove a entrada.
- Force-tick sem ninguém elegível online ⇒ não força sobre ninguém (D8, item 3) — evita atribuir
  a alguém offline que também não vai responder.
- Settings ausentes/malformadas ⇒ defaults (`enabled: false`).

## Testes

- Vitest TDD nos engines novos (`determineAbsence`, `pickFallbackSeller` — determinístico via
  seed, sem `Math.random()` puro).
- `supabase/tests/rls-regression.sql`: SELECT de `conversation_rescues` nega quem não tem acesso
  à instância; RPC de claim nega o segundo clique após o primeiro; force-tick não atribui sem
  elegível online.
- Gate de CI: `bun run build` + `bun run test`.

## Rollout

1. Migration (tabela + índice + RLS + RPCs) — via MCP com OK do dono, espelhada em
   `supabase/migrations/` no mesmo PR.
2. Deploy da Edge Function `conversation-rescue-tick` + registro no `pg_cron` (1x/min).
3. Deploy do frontend com `enabled=false` em todas as lojas.
4. Dono liga `enabled` por loja e configura `fallbackSellerIds` (ex.: Owner/Gestor como reserva).

## Fora de escopo (nesta entrega)

- Presença "real" (heartbeat client-side ativo) — usa só `sellers.availability` (manual +
  auto-offline por inatividade, PR #140) combinado com a agenda. Não há novo mecanismo de
  presença.
- Alterar o `whatsapp-webhook` real — a atribuição inicial de conversa nova continua como está;
  este sub-projeto só resgata conversas **já atribuídas** que estagnaram.
- Modo Demonstração com tick real (o mock simula o resultado, não roda `pg_cron`).

## Referências

- `docs/superpowers/specs/2026-07-16-idle-conversation-alerts-design.md` — sub-projeto A,
  fundações reaproveitadas
- `supabase/functions/sdr-backstop-tick/` — padrão de tick via `pg_cron`
- `src/features/sdr-escalation/` — padrão de transmissão + claim first-wins
  (`choose-seller.ts`, `escalate.ts`, `UrgentBroadcastClaim.tsx`, `useUrgentBroadcastQueue.ts`)
- `src/features/access/engine/workSchedule.ts` — engine de agenda (PRD-212) a reaproveitar
- `src/features/admin-settings/utils/accessRecipients.ts` — lógica de resolução de acesso por
  instância a espelhar
- `supabase/migrations/20260620120000_access_model_two_gates.sql` — `can_access_conversation`
- `docs/dev/conversation-access-model.md` — modelo de acesso (2 portões)
