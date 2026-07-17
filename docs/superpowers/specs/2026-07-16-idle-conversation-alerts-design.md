# Alertas de conversas ociosas — Design (Sub-projeto A)

- **Data:** 2026-07-16
- **Status:** aprovado pelo dono (brainstorming completo, mockups validados no visual companion)
- **Escopo:** Sub-projeto **A** de 2. O épico "conversas ociosas & ausência" foi decomposto em:
  - **A (este spec):** avisos por níveis para o atendente com conversas atribuídas aguardando resposta + Briefing do dia no login.
  - **B (futuro, spec própria):** resgate de conversa cujo responsável está ausente — oferta a outro atendente online mediante aceite; recusa passa ao próximo; recusa geral força atribuição aleatória. Requisitos capturados na seção "Sub-projeto B" ao final.

## Problema

Conversas do WhatsApp ficam atribuídas a um atendente e "morrem" sem resposta: o cliente escreve, ninguém é cobrado, e como a conversa está atribuída, nenhum colega enxerga a pendência. Hoje o webhook apenas faz bump (`last_message_at`/`unread_count`) em conversa atribuída — não muda status, não notifica. O alerta derivado existente (`conversa.semResposta`) cobre apenas a fila (pool) e avisa o gestor, não o atendente.

## Decisões do dono (registro)

| Tema | Decisão |
|---|---|
| Fatiamento | 2 sub-projetos; A primeiro |
| Gatilho de ociosidade | Última mensagem da conversa é do **cliente** e o atendente não respondeu (não conta "cliente sumiu") |
| Níveis | **3** — conceito aprovado "2h · 1 dia · 3 dias", traduzido para o relógio de horas úteis: Atenção **2h úteis** · Alerta **8h úteis** (≈1 dia de trabalho) · Crítica **24h úteis** (≈3 dias de trabalho); defaults configuráveis por loja |
| Forma por nível | Escalada progressiva: N1 passivo (badge+painel) → N2 notificação+toast → N3 banner fixo + escalação ao gestor |
| Relógio | **Horas úteis do atendente** (agenda PRD-212; sem agenda cadastrada = tempo corrido) |
| Radar | **Todos** com conversa atribuída, inclusive Owner/Gestor |
| Briefing do dia | Tela intersticial full-screen, **somente no login explícito** e somente se houver pendências (login explícito é frequente: idle timeout de sessão de 30min está ligado) |
| Painel de pendências | **Sheet lateral** (padrão shadcn), aberto pelo chip ⏳ do TopBar |
| Notificações | **Agregadas por nível** (nunca 1 por conversa) |
| Arquitetura | Server-side via reconciler pg_cron existente (abordagem 1) |
| Rollout | `enabled` nasce **desligado** por loja; dono liga após avaliar o passivo do backfill |

## Requisitos funcionais

- **RF-01** — Conversa atribuída e não-terminal cuja última mensagem é inbound acumula "tempo de espera do cliente" a partir da **primeira** mensagem inbound sem resposta (inbounds subsequentes não re-setam o relógio).
- **RF-02** — Responder (outbound) ou encerrar (`resolvida`/`arquivada`) zera a pendência; o desaparecimento dos avisos é automático (≤1 min, ciclo do reconciler).
- **RF-03** — O tempo conta em **horas úteis** da agenda do atendente responsável (engine PRD-212, offset fixo −03:00); sem agenda ⇒ corrido.
- **RF-04** — Níveis: 0 (ok) · 1 Atenção (≥ `level1Hours`, default **2**) · 2 Alerta (≥ `level2Hours`, default **8**) · 3 Crítica (≥ `level3Hours`, default **24**). Unidade: **horas úteis**. Os defaults equivalem ao conceito aprovado "2h / 1 dia / 3 dias" num expediente típico de ~8h; para atendente sem agenda (relógio corrido) os mesmos valores são mais apertados — aceito por ser caso de borda (staff).
- **RF-05** — N1: chip ⏳ no TopBar com contador total (cor pelo pior nível presente: neutro/âmbar/vermelho); clique abre o Sheet "Minhas pendências". Sem notificação.
- **RF-06** — N2: notificação derivada in-app agregada — "Você tem N conversas aguardando resposta há mais de um dia de trabalho" — com toast na criação. `dedupeKey` (as-built, convenção da plataforma) = `derived:conversa-ociosa-n2-{sellerId}:{recipientId}` (toast: entrega client-side pendente — ver Limitações em `docs/dev/idle-conversation-alerts.md`).
- **RF-07** — N3: banner fixo no topo do app (padrão `OutsideHoursBanner`, severidade crítica), sem botão fechar, visível enquanto existir crítica; + notificação derivada ao gestor da loja (`stores.manager_id`): "«Vendedor» tem N conversas críticas aguardando resposta" (`dedupeKey` por vendedor). Se o infrator for o próprio gestor, não duplicar. Toggle `notifyManagerOnLevel3`.
- **RF-08** — Briefing do dia: overlay full-screen após login explícito com pendências — números por nível + lista das mais urgentes (cliente + tempo de espera) + CTAs "Revisar as N conversas" e "Pular". Exibido no máximo 1× por login (flag de sessão consumido).
- **RF-09** — Sheet "Minhas pendências": resumo por nível no topo (3 cards), cards de conversa com nome do cliente, última fala e tempo de espera, ação "Abrir conversa"; rodapé "Revisar em sequência" (abre a mais crítica primeiro).
- **RF-10** — Configuração por loja (Owner/Gestor): `enabled` (default **false**), `level1Hours`/`level2Hours`/`level3Hours`, `notifyManagerOnLevel3` — junto aos alertas gerenciais existentes. (as-built: gate Owner-only, espelhando o `AlertSettingsModal` vizinho — validação do dono pendente.)
- **RF-11** — Com `enabled=false` na loja: nenhum aviso (nem chip, nem notificações, nem briefing).

## Arquitetura

### Modelo de dados

- **`conversations.awaiting_reply_since timestamptz NULL`** — mantida por **trigger**:
  - AFTER INSERT em `messages`: inbound e campo NULL ⇒ seta com o timestamp da mensagem; outbound (mensagem real do atendente, não nota interna — notas vivem em `conversation_notes`) ⇒ zera.
  - UPDATE de `conversations.status` para terminal (`resolvida`/`arquivada`) ⇒ zera.
  - Idempotente e barato (1 UPDATE condicional por mensagem).
- **Índice parcial**: `(store_id, assigned_seller_id) WHERE awaiting_reply_since IS NOT NULL AND status IN ('aguardando','em_andamento','aguardando_cliente')` — reconciler e RPC varrem só o subconjunto pendente.
- **Backfill** na migration: para conversas abertas, `awaiting_reply_since` = primeira inbound posterior à última outbound (NULL se a última mensagem é do atendente).
- **Settings**: `stores.settings->'idleAlerts'` = `{ enabled: false, level1Hours: 2, level2Hours: 8, level3Hours: 24, notifyManagerOnLevel3: true }` (mesmo padrão jsonb do `managerDashboard`; unidades em horas úteis).

### Cálculo de nível (SQL ≡ JS)

- Função SQL `idle_business_seconds(from timestamptz, to timestamptz, work_schedule jsonb) returns bigint` — soma apenas os intervalos dentro da agenda semanal do atendente (fuso fixo −03:00, espelhando `src/features/access/engine/workSchedule.ts`); `work_schedule NULL` ⇒ diferença corrida.
- `idle_level(seconds, settings)` ⇒ 0–3.
- **Espelho TS** em `src/features/idle-alerts/engine/` (`idleBusinessTime.ts`, `idleLevel.ts`) com testes de paridade sobre as mesmas fixtures (padrão validado nos KPIs do Atendimento).
- Exceções de agenda (`scheduleOverrides`) ficam **fora** do cálculo na v1 (só a grade semanal) — simplificação deliberada, igual nos dois lados do espelho.

### Reconciler (servidor)

- Nova regra `conversa.ociosa` dentro de `reconcile_derived_notifications()` (pg_cron já roda 1×/min), em **bloco exception-safe próprio** (falha não derruba as regras existentes):
  - Varre o índice parcial, calcula nível por conversa, agrega por atendente.
  - Emite/atualiza/recolhe as notificações derivadas de N2 (atendente), N3 (atendente; texto próprio) e N3-gestor conforme RF-06/07, respeitando `enabled` por loja.
- Evento novo `conversa.ociosa` registrado no vocabulário (`src/providers/notifications/events.ts`) e nas regras de roteamento/canais (in-app + toast).

### RPC de leitura

- **`idle_conversations_summary()`** — SECURITY DEFINER, gate de acesso **uma vez** (padrão `count_conversations`): retorna, para o seller autenticado, contagens por nível + lista das conversas ociosas (id, nome do cliente, trecho da última fala, `awaiting_reply_since`, nível, segundos úteis), ordenada da mais grave, `LIMIT 500`.
- Consumo no client: hook `useIdleSummary` (TanStack Query, polling 60s, `staleTime` curto), invalidado quando o próprio usuário envia mensagem. **Não toca** nas query keys/realtime do Atendimento (camada congelada por decisão do dono). (as-built: a invalidação imediata pós-envio ficou de fora — tocaria hooks congelados do Atendimento; o polling de 60s cobre, dentro do ≤1min do RF-02.)

### UI (feature nova `src/features/idle-alerts/`)

```
src/features/idle-alerts/
├── components/  IdlePendingChip (TopBar), IdlePendingSheet, IdleCriticalBanner, DailyBriefing, DailyBriefingGate
├── hooks/       useIdleSummary, useExplicitLoginFlag
├── engine/      idleBusinessTime.ts, idleLevel.ts, groupByLevel.ts, briefingGate.ts (TDD)
└── index.ts
```

- Chip + Sheet: mockup "B — Sheet lateral" aprovado no companion (resumo por nível, cards com última fala, "Revisar em sequência").
- Banner N3: montado no `AppLayout` junto aos banners existentes.
- Briefing: mockup "B — Briefing do dia" aprovado; `auth.login.tsx` grava flag em `sessionStorage` após `signIn` OK; `DailyBriefingGate` no `AppLayout` consome o flag e exibe o overlay se o summary tiver pendências.
- Tela de configuração: seção "Alertas de ociosidade" junto aos alertas gerenciais existentes, gate Owner/Gestor.
- Provider Pattern: método novo `getIdleSummary()` no contrato `IConversationsProvider` — impl supabase chama a RPC; impl mock calcula deterministicamente sobre o mockStore (paridade com o engine TS). Acesso pela UI só via barrel `@/providers/data`.

## Erros e degradação

- RPC falhou ⇒ chip/painel somem silenciosamente; erro para Sentry/console; sem toast em loop.
- Reconciler: regra nova isolada em bloco próprio com captura de exceção.
- Settings ausentes/malformados ⇒ defaults.
- Briefing nunca bloqueia o login em caso de erro do summary (fail-open: segue para o app).

## Testes

- Vitest TDD nos engines (`idleBusinessTime`, `idleLevel`, `groupByLevel`, `briefingGate`).
- Paridade SQL≡JS com fixtures compartilhadas.
- `supabase/tests/rls-regression.sql`: RPC nega pendências de outro seller; trigger seta/zera nos cenários inbound/outbound/encerramento.
- Gate de CI: `bun run build` + `bun run test` (tsc por delta).

## Rollout

1. Migration (coluna + trigger + backfill + índice + funções + regra do reconciler + RPC) — **antes** do deploy do frontend, via MCP com OK do dono, espelhada em `supabase/migrations/` no mesmo PR.
2. Deploy do frontend com `enabled=false` em todas as lojas.
3. Avaliar o passivo acordado pelo backfill (consulta assistida); higiene se o dono quiser.
4. Dono liga `enabled` por loja.
5. Sem deploy de Edge Functions neste sub-projeto (webhook intocado).

## Fora de escopo (Sub-projeto B — requisitos capturados)

- Cliente chama e o responsável está **ausente**: distinguir ausência temporária (minutos/horas) de ausência dia-a-dia (fora da agenda / não logou).
- Oferecer a conversa a outro atendente **online** aleatório mediante **aceite**; recusa ⇒ próximo; todos recusam ⇒ **atribuição forçada** aleatória entre os online.
- Dependências técnicas conhecidas: presença server-readable (hoje só existe presença Realtime efêmera client-side + `sellers.availability` manual/auto-offline), provável Edge worker (`pg_cron` + `pg_net`, padrão `sdr-backstop-tick`), e o análogo mais próximo já existente é o SDR urgent-broadcast (claim first-wins client-driven).
- O sub-projeto A entrega fundações reaproveitáveis: `awaiting_reply_since`, `idle_business_seconds`, evento `conversa.ociosa` e o resumo por RPC.

## Referências

- `supabase/migrations/20260609232819_notif_44_server_side_derived_reconciler.sql` — reconciler a estender
- `src/providers/notifications/` — vocabulário, roteamento, canais, dedupe
- `src/features/access/engine/workSchedule.ts` — engine de agenda a espelhar
- `src/features/inbox-alerts/` — monitor realtime existente (NÃO alterar)
- `docs/dev/conversation-access-model.md` — modelo de acesso (2 portões)
- Mockups aprovados: companion `.superpowers/brainstorm/11648-1784246805/content/{login-notice,pendencias-panel}.html` (gitignored; descrições incorporadas acima)
