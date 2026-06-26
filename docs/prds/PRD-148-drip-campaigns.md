# PRD-148: Drip Campaigns (Réguas de Relacionamento)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `crm.drip_*` + Edge `drip-engine` + `src/features/marketing-drip/`_ |
| **Objetivo** | Motor de **réguas de relacionamento**: sequências de mensagens (steps com delay, canal e template) disparadas por eventos do catálogo (008) e processadas por um scheduler idempotente — boas-vindas a cliente novo, follow-up de orçamento parado, reativação de dormente. Três tabelas (`drip_campaigns`, `drip_steps`, `drip_enrollments`), engine em cron de 15min com **exit conditions** (objetivo atingido, opt-out, bounce) avaliadas antes de cada step, envio **sempre** pelo dispatch (141) com `category='marketing'` — herdando integralmente as guardas: consentimento (147), quiet hours→digest (146), supressões (141/143). UI mínima de gestão (`/app/marketing/drip`): lista, editor sequencial de steps, ativar/pausar, métricas (inscritos, concluídos, saídas por motivo, conversão). Duas campanhas seedadas **pausadas** como ponto de partida |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | P2 |
| **Épico** | Onda 8 — Notificações Reais (v2.4.0 "Reach") |
| **PRDs Relacionados** | **PRD-147 (bloqueador: marketing exige a trilha)**; PRD-141 (dispatch — porta única de envio); PRD-142/143 (templates de marketing — DELTAs declarados); PRD-146 (quiet hours governam); PRD-008 (catálogo de eventos como gatilhos); PRD-149 (carrinho abandonado = campanha especializada sobre este motor); PRD-102 (cron) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Engine como função pura de transição + Edge orquestradora; steps declarativos em dados |

### Critérios de Complexidade

> **Justificativa de Alta:** drip é uma **máquina de estados distribuída no tempo** — cada enrollment é um cursor andando por steps ao longo de dias, sob um cron que pode atrasar, reexecutar ou rodar em paralelo. Os modos de falha clássicos: step enviado duas vezes (cron sobreposto sem idempotência), mensagem enviada **depois** de o objetivo ter sido atingido ("compre!" chegando após a compra — o pior email possível), e campanha editada com enrollments em voo (step 3 removido com 40 pessoas paradas nele). O desenho inteiro — exit-check antes do envio, idempotência por (enrollment, step), versionamento de steps — existe para matar esses três.

---

## Contexto do Problema

A Turbo Diesel tem três vazamentos de receita que réguas resolvem e que hoje dependem de memória humana:

1. **Cliente novo sem segunda compra:** cadastrou, comprou uma vez, sumiu. Uma sequência de boas-vindas (D+1 apresentação, D+7 categorias relevantes, D+21 check-in) dobra a chance da recompra — ninguém faz manualmente para 60 cadastros/mês.
2. **Orçamento parado:** vendedor envia orçamento, cliente some. O follow-up de D+2 e D+5 é exatamente o que o vendedor esquece — e o evento `quote.sent` já existe no catálogo (008).
3. **Dormente da curva:** o reconciliador (008) já **detecta** `customer.dormant` — mas a detecção vira badge, não ação. A régua de reativação fecha o ciclo.

E o 149 (carrinho abandonado) precisa de um motor de sequência — construí-lo genérico aqui evita um motor descartável lá.

---

## Conceito da Solução

### Modelo

```sql
CREATE TABLE crm.drip_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES crm.stores(id),
  name text NOT NULL,
  description text,
  trigger_event text NOT NULL,              -- NotificationEventType (ex: 'customer.created', 'quote.sent', 'customer.dormant')
  trigger_condition jsonb,                  -- filtro declarativo opcional sobre o payload (ex: { minQuoteValue: 500 })
  exit_events text[] NOT NULL DEFAULT '{}', -- eventos que encerram (ex: ['order.created'])
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  allow_reenrollment boolean NOT NULL DEFAULT false,
  reenrollment_cooldown_days integer,       -- se permitido, intervalo mínimo
  created_by uuid NOT NULL REFERENCES crm.sellers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE crm.drip_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES crm.drip_campaigns(id) ON DELETE CASCADE,
  position integer NOT NULL,                -- 1..N
  delay_hours integer NOT NULL CHECK (delay_hours >= 0),   -- desde o step anterior (ou enrollment, no 1º)
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  template_key text NOT NULL,               -- registry 142 (email) | notificationHsmMap 143 (whatsapp marketing)
  enabled boolean NOT NULL DEFAULT true,
  UNIQUE (campaign_id, position)
);

CREATE TABLE crm.drip_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES crm.drip_campaigns(id),
  recipient_id uuid NOT NULL,
  recipient_type text NOT NULL DEFAULT 'customer',
  store_id uuid NOT NULL,
  trigger_payload jsonb NOT NULL,           -- snapshot do evento (variáveis dos templates)
  current_position integer NOT NULL DEFAULT 0,   -- último step ENVIADO (0 = nenhum)
  next_run_at timestamptz,                  -- NULL quando terminal
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','exited_goal','exited_optout','exited_bounce','exited_manual','paused')),
  exited_reason text,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (campaign_id, recipient_id, enrolled_at)           -- reenrollment = nova linha
);
CREATE INDEX ON crm.drip_enrollments (status, next_run_at) WHERE status = 'active';
-- RLS: Owner/Manager da store gerenciam; seller leitura do escopo
```

### Engine (cron */15min)

```
drip-engine:
1. ENROLLER — assina os trigger_events (consumidor do bus server-side / trigger nas notifications):
     campanha active + condição satisfeita + (sem enrollment ativo OU reenrollment elegível)
       → INSERT enrollment (next_run_at = enrolled_at + delay do step 1)

2. RUNNER — SELECT ... WHERE status='active' AND next_run_at <= now()
     FOR UPDATE SKIP LOCKED                      ← paralelismo seguro
   para cada enrollment:
     a. EXIT CHECK (sempre antes de enviar):
          exit_event ocorrido desde enrolled_at?  → exited_goal
          opt-out de marketing vigente (147)?     → exited_optout
          email bounced/complained E step é email?→ exited_bounce (ou pula p/ próximo canal viável)
     b. step = position + 1; inexistente/disabled → completed
     c. ENVIO via dispatch (141): category='marketing',
          dedupeKey = 'drip:'+enrollment.id+':'+step.position    ← idempotência absoluta
          (guardas do dispatch decidem: skipped_no_consent / quiet_hours→digest? 
           NÃO — marketing em quiet hours NÃO vai para digest: step é REAGENDADO
           para o fim da janela — DELTA fino sobre a guarda do 146, ver nota)
     d. avanço: current_position++, next_run_at += delay do próximo (ou NULL+completed)
```

> **Nota sobre quiet hours (DELTA 146 declarado):** o digest agrega *notificações informativas*; um step de drip não é informação pendente — é mensagem de campanha com timing próprio. Regra: dispatch detecta quiet hours em `category='marketing'` **com origem drip** → devolve `rescheduled_quiet_hours` e o engine empurra `next_run_at` para o fim da janela do destinatário. Nada vai para o digest; nada é perdido; o horário é respeitado.

### Edição com Enrollments em Voo

Steps são **versionados por posição estável**: editar texto/template/delay vale para quem ainda não chegou lá; **remover** um step o marca `enabled=false` (posição preservada — cursores pulam); **inserir no meio** usa posições decimais internas renormalizadas (UI esconde). Campanha `paused` congela `next_run_at` (runner ignora); reativar recalcula a partir de agora (sem rajada retroativa: steps "atrasados" são reagendados com delay mínimo de 1h entre si).

### Campanhas Seedadas (pausadas — Owner ativa)

| Campanha | Trigger | Steps |
|---|---|---|
| **Boas-vindas** | `customer.created` (exit: `order.created`) | D+1 email apresentação · D+7 email categorias · D+21 email check-in |
| **Follow-up de orçamento** | `quote.sent` ≥ R$ 300 (exit: `order.created`, `quote.rejected`) | D+2 email lembrete · D+5 WhatsApp HSM marketing (se opt-in) |

Templates de marketing correspondentes entram no registry do 142 (**DELTA +5**) e no mapa do 143 (**DELTA +1**, `metaCategory='marketing'` — aprovação Meta própria, custo maior, opt-in obrigatório já garantido pela guarda do 147).

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Ferramenta externa (RD/Mailchimp) | Quebra a fonte única (eventos, consentimento, supressão vivem aqui); custo recorrente; o motor genérico serve o 149 e o futuro |
| Builder visual de fluxos (canvas) | Sequência linear cobre 100% dos casos do MVP; canvas é semanas de UI para ramificações que ninguém pediu |
| Envio direto pelos canais (sem dispatch) | Perderia TODAS as guardas (147/146/supressões) — porta única é inegociável |
| Step perdido em quiet hours vai ao digest | Mensagem de campanha dentro de resumo informativo é ruído; reagendar preserva o timing e o silêncio |
| pg_cron por step (um job por envio) | Explosão de jobs; runner 15min + SKIP LOCKED é simples e suficiente |
| Deletar step fisicamente | Quebra cursores em voo; disable preserva |

---

## Escopo

### Incluído

- ✅ Migrations das 3 tabelas + RLS + índices
- ✅ Enroller: consumo dos trigger_events (server-side, via trigger nas notifications/eventos), condição declarativa (subset jsonb: igualdade + min/max numéricos), anti-duplicidade e reenrollment com cooldown
- ✅ Runner: cron 15min, `FOR UPDATE SKIP LOCKED`, exit-check-antes-do-envio (goal/optout/bounce), envio via dispatch com `dedupeKey` por (enrollment, step), avanço/conclusão
- ✅ **DELTA 146:** resposta `rescheduled_quiet_hours` para marketing de origem drip (reagenda; não-digest) — declarado lá e cá
- ✅ Pausa/retomada sem rajada (reagendamento espaçado); edição segura (disable, versionamento por posição)
- ✅ Saída manual: ação na ficha do cliente "Remover das réguas ativas" (`exited_manual` + audit) — atalho de atendimento
- ✅ **DELTAs de templates:** 142 +5 (welcome-1/2/3, quote-followup-1, generic-drip) categoria marketing com layout próprio (badge "oferta", descadastro proeminente); 143 +1 HSM marketing (`followup_orcamento`, pending_meta_approval)
- ✅ UI `/app/marketing/drip` (Owner/Manager): lista com status+métricas; editor sequencial (trigger, condição simples, exit events, steps com delay/canal/template/preview); ativar/pausar com confirmação; detalhe com funil por step e tabela de enrollments (filtros por status/motivo de saída)
- ✅ Métricas por campanha: enrolled, ativos, completed, exited por motivo, **conversão** (exited_goal ÷ enrolled), por step: enviados/skipped/reagendados
- ✅ Seed das 2 campanhas **pausadas** + templates correspondentes
- ✅ Audit: `drip_enrolled`, `drip_step_sent`, `drip_exited { reason }`, `drip_campaign_activated/paused`, `drip_step_rescheduled_quiet_hours`
- ✅ Testes: idempotência do runner (reexecução dupla = 1 envio), SKIP LOCKED concorrente, exit antes do envio (compra entre steps → goal, zero envio), optout no meio (147 mock), reagendamento por quiet hours, edição em voo (disable pulado), pausa sem rajada, condição declarativa, E2E mock da régua de boas-vindas completa
- ✅ Documentação `docs/dev/drip-engine.md`

### Excluído

- ❌ Ramificações condicionais entre steps (if/else) — linear no MVP; canvas é evolução
- ❌ Segmentos como trigger (entrada por consulta, não evento) — evolução; `customer.dormant` derivado cobre o caso dormente via evento
- ❌ A/B test de steps
- ❌ Carrinho abandonado (149 — campanha especializada sobre este motor)
- ❌ Editor de template na UI (templates são código — 142)
- ❌ SMS como canal de drip (custo×retorno não justifica; 144 segue restrito a crítico/contingência)

---

## Requisitos Funcionais

### Enrollment

- **RF-001:** Evento de trigger com campanha `active` → avalia `trigger_condition` (igualdade e `min*/max*` sobre o payload) → cria enrollment com snapshot do payload.
- **RF-002:** Anti-duplicidade: enrollment `active` existente na campanha bloqueia novo; `allow_reenrollment` + cooldown vencido libera nova linha.
- **RF-003:** `next_run_at` inicial = `enrolled_at + delay_hours` do step 1.

### Runner

- **RF-010:** Seleção com `FOR UPDATE SKIP LOCKED`; lote máx 200/execução (folga ampla para o volume).
- **RF-011:** Exit-check **antes** de qualquer envio, nesta ordem: exit_event desde `enrolled_at` → `exited_goal`; opt-out vigente (147 `getConsentState`) → `exited_optout`; canal do step inviável por supressão (email bounced p/ step email) → tenta haver step seguinte de outro canal? **Não** — `exited_bounce` (simplicidade; registrado como evolução).
- **RF-012:** Envio via dispatch (141): `category='marketing'`, `dedupeKey='drip:'+enrollmentId+':'+position` — replay do runner jamais duplica (idempotência fim-a-fim).
- **RF-013:** Resposta `skipped_no_consent` (147): trata como `exited_optout` (estado mudou entre check e envio — corrida coberta).
- **RF-014:** Resposta `rescheduled_quiet_hours`: `next_run_at = fim da janela do recipient` (146), `current_position` **não** avança; audit.
- **RF-015:** Step enviado → avanço + agenda próximo; sem próximo `enabled` → `completed`.

### Gestão

- **RF-020:** CRUD de campanha (Owner/Manager): trigger obrigatório, ≥1 step para ativar, exit_events recomendados (aviso se vazio).
- **RF-021:** Edição: delay/template valem para steps futuros dos enrollments em voo; remover = `enabled=false`; reordenar renormaliza posições preservando cursores.
- **RF-022:** Pausar congela; retomar reagenda atrasados com espaçamento ≥1h (anti-rajada).
- **RF-023:** "Remover das réguas" na ficha (012): lista enrollments ativos do customer, saída com motivo `exited_manual` + audit.

### Métricas

- **RF-030:** Cards por campanha (enrolled/ativos/completed/conversão) + funil por step (enviados, skipped, reagendados, saídas no intervalo) — queries diretas, sem ETL.

### Testes/Docs

- **RF-040:** Suites do escopo; E2E: customer.created → 3 emails nos tempos (clock mock) → order.created entre step 2 e 3 → `exited_goal`, step 3 **nunca** enviado.
- **RF-041:** `drip-engine.md`: máquina de estados, idempotência, edição em voo, decisão quiet-hours-reagenda.

---

## Requisitos Não-Funcionais

- **RNF-001 (Nunca após o gol):** exit-check antes de todo envio — "compre!" pós-compra é o bug proibido nº 1.
- **RNF-002 (Idempotência fim-a-fim):** (enrollment, position) único do runner ao provider.
- **RNF-003 (Porta única):** todo envio pelo dispatch — guardas 147/146/supressões sempre aplicadas.
- **RNF-004 (Edição segura):** nenhuma operação de gestão quebra enrollment em voo.
- **RNF-005 (Timing respeitoso):** quiet hours reagendam; retomada não rajada.

---

## Critérios de Aceitação

### RF-011 + RNF-001: Gol Encerra

```gherkin
DADO enrollment em Boas-vindas com step 3 agendado para amanhã
QUANDO o customer cria um pedido hoje (order.created ∈ exit_events)
E o runner processa amanhã
ENTÃO exit-check detecta → status exited_goal
  E o step 3 NUNCA é enviado
  E a conversão da campanha incrementa
```

### RF-012: Idempotência do Runner

```gherkin
DADO step 2 enviado às 10:00 (dedupeKey drip:E1:2)
QUANDO o cron reexecuta a janela às 10:03 (sobreposição)
ENTÃO SKIP LOCKED ou dedupe barram — zero segundo envio
```

### RF-014: Quiet Hours Reagenda

```gherkin
DADO recipient com silêncio 22:00–07:00 e step vencendo 23:10
QUANDO o runner processa
ENTÃO dispatch devolve rescheduled_quiet_hours
  E next_run_at = 07:00 do recipient; posição não avança
  E NADA entra no digest (mensagem de campanha ≠ pendência informativa)
```

### RF-021: Edição em Voo

```gherkin
DADO 40 enrollments com cursor no step 2 de 4
QUANDO Manager desabilita o step 3
ENTÃO os 40 pulam de 2 → 4 no próximo avanço
  E ninguém trava nem recebe o step removido
```

---

## Fases de Implementação

### Fase 1 — Schema + Enroller (1.5 dias)
Migrations, condição declarativa, anti-dup/reenrollment.

### Fase 2 — Runner (2 dias)
SKIP LOCKED, exit-checks, dispatch+dedupe, reagendamento (DELTA 146), avanço/conclusão.

### Fase 3 — Templates + Seeds (1 dia)
DELTAs 142 (+5 marketing) e 143 (+1 HSM); 2 campanhas pausadas.

### Fase 4 — UI + Métricas (2 dias)
Lista/editor/detalhe; pausa/retomada; saída manual na ficha; funil.

### Fase 5 — Testes + Docs (1 dia)
Concorrência, E2E com clock mock, drip-engine.md; `_DONE`.

---

## Dependências

- **Depende de:** **PRD-147 (gate de marketing)**, PRD-141/142/143 (envio+templates), PRD-146 (quiet hours — DELTA), PRD-008 (catálogo), PRD-102 (cron)
- **Bloqueia:** PRD-149 (motor), PRD-150
- **DELTAs declarados:** 146 (rescheduled p/ drip), 142 (+5 templates marketing), 143 (+1 HSM marketing)
- **Decisões Pendentes:** ativação das campanhas seed (Owner, pós-go-live); corpo do HSM marketing → submissão Meta; cooldown default de reenrollment (90d sugerido)

---

## Considerações de Segurança

- Apenas Owner/Manager criam/ativam (poder de envio em massa)
- Snapshot do payload no enrollment evita vazamento de dado futuro do customer em template antigo
- Todas as supressões/consentimentos aplicados pela porta única — campanha não tem bypass
- Ativação de campanha auditada com contagem estimada de elegíveis exibida no confirm

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.4.0-rc.8; CHANGELOG; renomear `PRD-148-drip-campaigns_DONE.md`; anotar DELTAs (146/142/143); lembrar submissão Meta do HSM marketing.

| Princípio | Descrição |
|-----------|-----------|
| **Exit antes de enviar** | O gol encerra a régua, sempre |
| **Porta única** | dispatch ou nada — guardas garantidas |
| **(enrollment, step) é a unidade** | Idempotência fim-a-fim |
| **Disable, nunca delete** | Cursores em voo são sagrados |
| **Reagendar, não digestar** | Campanha tem timing, não pendência |

| ❌ Evitar |
|-----------|
| Envio fora do dispatch |
| Step após exit_event |
| Delete físico de step |
| Rajada na retomada |
| Runner sem SKIP LOCKED |
| Marketing sem o 147 implementado |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |
| **Data** | - |
| **Versão** | - |
| **Por** | - |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 10/06/2026 | v1 | Criação inicial — Sub-lote 5c do Lote 5 (Onda 8) |

---

**AILA - Sistemas Inteligentes**
