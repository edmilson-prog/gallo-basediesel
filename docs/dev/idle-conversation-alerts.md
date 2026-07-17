# Alertas de Conversas Ociosas (Sub-projeto A)

Avisa o atendente, em 3 níveis progressivos, quando uma conversa **atribuída** a ele está com o cliente aguardando resposta — e mostra um Briefing do dia no login explícito. Não cobre resgate de conversa por ausência do atendente (Sub-projeto B, deferido).

**Spec:** `docs/superpowers/specs/2026-07-16-idle-conversation-alerts-design.md`
**Plano:** `docs/superpowers/plans/2026-07-16-idle-conversation-alerts.md`
**Feature dir:** `src/features/idle-alerts/`

## Modelo

`conversations.awaiting_reply_since timestamptz` mantida por 2 triggers (migration `20260716190000_idle_conversation_alerts.sql`):

- `trg_messages_awaiting_reply` (AFTER INSERT em `messages`, SECURITY DEFINER): inbound (`direction='in'`) seta se ainda NULL; outbound (`direction='out'`) zera. Schema real verificado na migration (não assumido): `direction` é `'in'/'out'` (não `'inbound'/'outbound'`), texto é `text` (não `content`), timestamp canônico é `sent_at` (não `created_at`).
- `trg_conversations_awaiting_clear` (BEFORE UPDATE OF status): zera ao fechar (`resolvida`/`arquivada`).
- Índice parcial `(store_id, assigned_seller_id) WHERE awaiting_reply_since IS NOT NULL AND status IN (...)`. Backfill na própria migration (primeira inbound após a última outbound).
- `conversations.lead_id` é TEXT × `leads.id` uuid — join com `ld.id::text = b.lead_id` (padrão já usado em `search_conversations`).
- Settings por loja: `stores.settings->'idleAlerts'` = `{enabled:false, level1Hours:2, level2Hours:8, level3Hours:24, notifyManagerOnLevel3:true}`. Defaults **2/8/24 horas úteis** (≈ 2h · 1 dia · 3 dias de trabalho); `enabled:false` no nascimento — cada loja liga depois de avaliar o passivo do backfill.

## Engines espelhados (SQL ≡ JS)

- `idle_business_seconds(schedule, from, to)` (SQL) / `businessSecondsBetween` (`src/features/idle-alerts/engine/idleBusinessTime.ts`): soma só os intervalos dentro da agenda semanal do atendente (PRD-212, São Paulo fixo UTC−03:00). Agenda ausente **ou com todas as janelas `enabled:false`** ⇒ tempo **corrido** (decisão do dono 2026-07-16: um atendente de licença nunca deve silenciar os próprios alertas) — pinada em teste de paridade. `scheduleOverrides` ficam fora do cálculo nos dois lados (v1). Parsing defensivo: janela malformada (`weekday`/horário fora do padrão) é pulada, nunca derruba a função. Clamp de **90 dias** nos dois lados (`GREATEST(p_from, p_to - 90d)` / `CLAMP_DAYS` no TS).
- `computeIdleLevel`/`idle_level` — 0 (ok) · 1 Atenção (≥2h) · 2 Alerta (≥8h) · 3 Crítica (≥24h úteis).
- Testes de paridade usam as MESMAS fixtures nos dois lados (`idleBusinessTime.test.ts` e blocos `do $$` em `rls-regression.sql`).

## Reconciler

Regra nova `conversa.ociosa` dentro de `reconcile_derived_notifications()` (pg_cron, 1×/min), em **bloco `begin/exception` isolado** — uma falha aqui (ex. jsonb malformado) nunca derruba as 3 regras pré-existentes (`cliente.dormente`/`vendedor.sobrecarregado`/`conversa.semResposta`, preservadas verbatim). Agrega por atendente e emite: N2 (`warning`, `inApp+toast`) e N3 (`critical`, `inApp+toast`) para o próprio atendente; N3-gestor (`critical`, `inApp`) para `stores.manager_id`, sem duplicar se o infrator já for o gestor. Vocabulário novo em `src/providers/notifications/events.ts`/`routing/rules.ts`.

## RPC de leitura

`idle_conversations_summary()` — SECURITY DEFINER, `search_path=''`, gate de acesso **uma vez** (padrão `count_conversations`): resolve `current_seller_id()`/`current_store_id()` do JWT, retorna as pendências do próprio seller (contagens calculadas client-side sobre as entries), ordenadas pior-primeiro, `LIMIT 500`. `EXECUTE` restrito a `authenticated`.

## UI (`src/features/idle-alerts/`)

- **Chip** (`IdlePendingChip`, TopBar): total, cor pelo pior nível presente.
- **Sheet "Minhas pendências"** (`IdlePendingSheet`): resumo por nível + cards por conversa; tempo decorrido atualiza ao vivo via `useTimeTick` (reaproveitado de `src/features/conversations/hooks/`, sem duplicar).
- **Banner N3 fixo** (`IdleCriticalBanner`, `AppLayout`): `sticky top-16 z-10` — **abaixo** de `WhatsAppDisconnectedBanner` (`z-20`) por decisão: um outage de WhatsApp é causa provável do backlog crítico, e o link de reconexão precisa continuar alcançável; o chip e as notificações seguem cobrando em paralelo.
- **Briefing do dia** (`DailyBriefingGate`/`DailyBriefing`): overlay full-screen só no **login explícito** — flag `sessionStorage` `gallo-explicit-login`, setada em `auth.login.tsx` antes do navigate e consumida (one-shot, latch contra replay do StrictMode) no gate; nunca aparece em sessão restaurada. Fail-open: erro no summary não bloqueia o login.
- `useIdleSummary` — TanStack Query própria (`["idle-summary", sellerId]`), polling 60s, falha silenciosa (chip/painel somem, sem toast em loop) — **não** toca query keys/realtime do Atendimento (cache congelado).

## Configuração por loja

Seção "Alertas de ociosidade" em `ManagerDashboardPage` (`IdleAlertsSettingsSection`), ao lado do `AlertSettingsModal` gerencial existente. Gate **Owner-only** (`canEditSettings = userRole === "Owner"`) — desvio consciente do texto RF-10 ("Owner/Gestor" no spec), mantendo paridade com o modal vizinho; pendente validação do dono se Gestor também deve editar.

## Testes

Vitest TDD nos engines (`idleBusinessTime`, `idleLevel`, `groupByLevel`, `briefingGate`) + `supabase/tests/rls-regression.sql`: triggers (inbound seta/outbound zera), paridade SQL≡JS (mesmas fixtures do Vitest) e leak check **não-vácuo** da RPC — força `idleAlerts.enabled=true` na loja e planta um controle positivo (conversa do próprio owner) para garantir que o teste teria pego um vazamento real, além de confirmar que a conversa de outro seller (lucas) nunca aparece.

## Rollout (spec, 5 passos)

1. Migration (coluna + triggers + backfill + índice + funções + regra do reconciler + RPC) — **antes** do deploy do frontend, via MCP com OK explícito do dono, espelhada em `supabase/migrations/`.
2. Deploy do frontend com `enabled=false` em todas as lojas (sem Edge Functions neste sub-projeto — webhook intocado).
3. Avaliar o passivo revelado pelo backfill (consulta assistida); higiene se o dono quiser.
4. Dono liga `enabled` por loja.
5. Version bump quando o dono pedir.

## Fora de escopo

Sub-projeto B (resgate de conversa por ausência do atendente, oferta com aceite/recusa em cadeia, atribuição forçada) — requisitos capturados no spec, não implementado.
