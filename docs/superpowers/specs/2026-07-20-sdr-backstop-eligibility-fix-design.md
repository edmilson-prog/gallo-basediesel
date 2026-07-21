# SDR backstop — elegibilidade segura (correção do disparo em massa)

**Data:** 2026-07-20 · **Status:** aprovado pelo dono (sessão 2026-07-20, noite)
**Branch:** `worktree-sdr-backstop-eligibility-fix`

## Contexto — o incidente

Na primeira ativação real do piloto SDR (2026-07-20 ~22:33 BRT, fora do horário
comercial, instância "GALLO Site — WAHA (55) 9900-3314" única marcada), o
`sdr-backstop-tick` disparou **16 mensagens do SDR num único burst** (22:33:07–13),
incluindo conversas cuja última interação real era de meses atrás e conversas em
que um vendedor já tinha respondido por último (o SDR "se meteu" e se despediu —
caso "Humberto"). O dono desligou os toggles; os crons foram pausados via
`cron.alter_job`. As 16 mensagens já entregues **ficam como estão** (decisão do dono).

**Backlog que estava exposto:** 1.620 conversas elegíveis pela regra antiga na loja
piloto (246 paradas há +180 dias; a mais antiga de 30/01/2025). Só 16 dispararam
porque o gate por instância (Parte C) limitou às instâncias marcadas.

## Causa raiz (confirmada no código)

Em `supabase/functions/sdr-backstop-tick/index.ts`:

1. **Threshold 0 fora do horário comercial** — `thresholdMinutes = withinHours ? configured : 0`.
   Com 0, a guarda `elapsed < threshold` nunca pula nada: **toda** conversa em fila
   vira elegível instantaneamente.
2. **Sem corte de recência** — a query de candidatas (`status='aguardando'`,
   sem dono, `is_sdr_active=false`, `queued_at not null`) varre o backlog histórico
   inteiro. `queued_at` **não atualiza** enquanto a conversa permanece em fila
   (trigger `set_conversation_queued_at`, migration `20260703140000` — "set on
   queue entry, keep while queued"; o backfill original usou
   `coalesce(last_message_at, created_at)`, por isso há `queued_at` de 2025).
3. **Sem cap de batch** — um único tick tenta disparar a fila inteira
   (fetch fire-and-forget para `sdr-respond` por linha).
4. **Não olha quem falou por último** — conversa em que um vendedor (ou o próprio
   SDR) respondeu por último ainda é elegível.
5. (menor) **Default agressivo em dado faltante** — loja sem `businessHours`
   resolve `?? false` → fora do horário → threshold 0.

Achado correlato: o **`sdr-escalation-timeout-tick` não checa nenhum gate**
(loja/instância) — processa qualquer escalação `pending`/`assigned` de qualquer
época. Existem **2 escalações criadas no incidente** (status `assigned`, sem
resposta, sem broadcast) que dispararão broadcast interno assim que o cron for
re-armado.

## Decisões do dono (2026-07-20)

1. **Elegibilidade = atividade do cliente + marco de ativação** (opção recomendada):
   última mensagem da conversa é do cliente, posterior ao momento de ligar o
   toggle, com menos de 24h.
2. **Escalation tick ganha gates + as 2 escalações do incidente são neutralizadas**
   no rollout.
3. As 16 mensagens enviadas ficam como estão; nenhuma remediação junto aos clientes.

## Design

### 1. Elegibilidade nova do backstop

Uma conversa só é candidata se **todas** as regras valem:

| # | Regra | Origem |
|---|-------|--------|
| 1 | Loja com `sdr_settings.sdr_enabled = true` | existente |
| 2 | Instância com `whatsapp_accounts.sdr_enabled = true` | existente |
| 3 | Em fila: `status='aguardando'` ∧ `assigned_seller_id is null` ∧ `is_sdr_active=false` ∧ `queued_at not null` | existente |
| 4 | **Última mensagem da conversa tem `direction='in'`** (cliente falou por último) | nova |
| 5 | **Essa última msg é posterior a `greatest(sdr_settings.sdr_activated_at, whatsapp_accounts.sdr_activated_at)`** | nova |
| 6 | **Essa última msg tem menos de 24h** (proteção contra downtime de cron/instância) | nova |

**Timer de espera muda de base:** `elapsed = now − last_inbound_at` (não mais
`queued_at`) ≥ threshold. Semântica: "o cliente falou e ninguém respondeu há X
minutos". O `threshold=0` fora do horário comercial **permanece** — com as regras
4–6 volta a ser o comportamento desejado (resposta imediata à noite para conversa
nova), sem risco de backlog.

Nota de semântica do Postgres: `greatest()` ignora NULLs; se **ambos** os marcos
forem NULL (flag ligado sem carimbo — não deveria ocorrer pós-migration), a
comparação resulta NULL e a linha é **excluída**. Falha fecha, nunca abre.

### 2. Marcos de ativação (schema)

Migration única (`supabase/migrations/20260720*_sdr_backstop_eligibility.sql`) —
contém também a RPC da §3 e o índice de `messages`, se faltar:

- `sdr_settings.sdr_activated_at timestamptz` e
  `whatsapp_accounts.sdr_activated_at timestamptz` (nullable, sem default).
- **Uma** função de trigger compartilhada (os nomes de coluna/flag coincidem nas
  duas tabelas): BEFORE INSERT OR UPDATE — se `sdr_enabled` está virando `true`
  (INSERT com true, ou UPDATE de false→true), carimba `sdr_activated_at := now()`.
- Trigger nas duas tabelas. Carimbo por **trigger, não UI** — qualquer caminho de
  escrita (tela, SQL console, MCP) carimba correto. Religar após pausa renova o
  marco: backlog acumulado durante a pausa fica inelegível de novo.

### 3. RPC de candidatas (`sdr_backstop_candidates`)

Função SQL (`STABLE`, `security invoker`, EXECUTE **apenas** para `service_role` —
revogar de `authenticated`/`anon`; é worker-only). Um único round-trip com o filtro
relacional completo:

```sql
select c.id, c.store_id, c.whatsapp_account_id, lm.created_at as last_inbound_at
from public.conversations c
join public.sdr_settings s      on s.store_id = c.store_id and s.sdr_enabled
join public.whatsapp_accounts w on w.id = c.whatsapp_account_id and w.sdr_enabled
cross join lateral (
  select m.direction, m.created_at
  from public.messages m
  where m.conversation_id = c.id
  order by m.created_at desc
  limit 1
) lm
where c.status = 'aguardando'
  and c.assigned_seller_id is null
  and c.is_sdr_active = false
  and c.queued_at is not null
  and lm.direction = 'in'
  and lm.created_at > greatest(s.sdr_activated_at, w.sdr_activated_at)
  and lm.created_at > now() - interval '24 hours'
order by lm.created_at asc
```

O lateral em `messages` roda só sobre as linhas que sobraram dos filtros de fila +
gates (dezenas, não milhares). Verificar no plano se existe índice
`messages(conversation_id, created_at)` para o lateral; criar se faltar.
O índice parcial da fila (`conversations_sdr_backstop_queue_idx`, Parte B) segue
servindo o scan externo.

### 4. Tick reescrito (fino)

`sdr-backstop-tick/index.ts` passa a:

1. Chamar `sdr_backstop_candidates` (RPC única).
2. Buscar `stores.settings` das lojas candidatas e decidir o threshold por loja
   via `isWithinBusinessHours` (engine TS já existente) — **decisão extraída para
   engine puro testável** (`eligibility.ts` ao lado do tick, testado com Vitest
   como os demais engines do SDR): recebe candidatas + settings + `now` e devolve
   `{ toActivate, cappedCount }`.
3. **Default conservador:** loja sem settings/businessHours parseáveis resolve
   para o ramo "dentro do horário" (threshold em minutos configurado, nunca 0).
4. Aplicar `elapsed = now − last_inbound_at ≥ threshold`.
5. **Cap:** `MAX_ACTIVATIONS_PER_TICK = 10` (constante no código — guarda de
   segurança, não knob de UI), FIFO por `last_inbound_at` asc (já ordenado).
6. Claim idempotente + fire-and-forget para `sdr-respond` — **inalterados**.
7. Observabilidade: logar `{ eligible, activated, capped }` a cada tick com
   atividade; cap nunca corta em silêncio.

`sdr-respond`, `whatsapp-webhook` (`onSdrTurn`) e o pipeline de envio **não são
tocados** — o backstop tick é o único ativador de `is_sdr_active` em produção.

### 5. Gates no `sdr-escalation-timeout-tick`

Frentes A e B passam a filtrar candidatas pelos dois gates antes de processar
(mesmo idioma da Parte C no backstop): batch-fetch de `sdr_settings.sdr_enabled`
por loja e `whatsapp_accounts.sdr_enabled` por instância das conversas envolvidas;
escalação de loja/instância fora do piloto é pulada (com log). A correção de
`is_sdr_active` órfão da Frente A também fica atrás do gate — com o piloto
desligado o tick vira no-op integral.

### 6. Rollout (cada passo com OK do dono; nada automático)

1. Merge do PR → deploy das 2 Edge Functions (`sdr-backstop-tick`,
   `sdr-escalation-timeout-tick`).
2. Aplicar a migration (colunas + triggers de carimbo + RPC + índice se faltar)
   via MCP e **exportar para `supabase/migrations/` no mesmo PR** (regra do
   projeto).
3. Higiene de dados (SQL via MCP): neutralizar as 2 escalações do incidente
   (inspecionar as linhas vivas antes; expectativa: `status='abandoned'`) e
   resetar o 1 `is_sdr_active=true` preso.
4. Re-armar os 2 crons (`cron.alter_job(..., active := true)`) — seguro antes dos
   toggles (gates desligados = no-op).
5. **Dono religa** loja + instância "GALLO Site — WAHA (55) 9900-3314" em
   `/app/sdr` → Configurações. O trigger carimba o marco; só mensagens de cliente
   **posteriores a esse momento** contam.
6. Monitorar logs do primeiro tick pós-religada (esperado: `activated=0` até
   chegar conversa nova).

### 7. Testes

- Engine `eligibility.ts` do backstop: TDD/Vitest (casos: backlog antigo excluído,
  vendedor-falou-por-último excluído, marco de ativação, janela 24h, cap com
  `cappedCount`, default conservador de horário, threshold 0 fora do horário para
  conversa nova).
- Filtro de gates do escalation tick: extraído em função pura testada, ou coberto
  pelos testes do tick se a extração não compensar (decidir no plano).
- SQL da RPC: sondas manuais em prod no rollout (padrão do projeto), incluindo
  `explain` para confirmar uso de índice.
- Suíte existente (1977+) permanece verde; `bun run build` limpo.

## Fora de escopo

- Remediação das 16 mensagens enviadas (decisão do dono: ficam como estão).
- As ~1.620 conversas do backlog **não são tocadas** — ficam permanentemente
  inelegíveis pelo marco de ativação, sem mutação de dados.
- Mecanismo legado de broadcast (`useUrgentBroadcastTimer`, 30s client-side) —
  decisão da Parte D ("deixar como está") permanece.
- Ativação do SDR no caminho do webhook (deferido desde a Parte C).
- Version bump — segue o processo normal do projeto após merge.
