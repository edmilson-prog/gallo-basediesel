# PRD-148B: NPS — Pesquisa de Satisfação (Net Promoter Score)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `src/features/nps/` + `supabase/functions/nps-*` + `_shared/notification-hsm-map.ts` (extensão)_ |
| **Objetivo** | Pagar a dívida dos **dois cards "NPS — Em breve (Fase 2)"** já prometidos na Fase 1 (PRD-040 Cockpit, **implementado em produção**; PRD-051 Atendimento Análise). Entrega o ciclo completo: **disparo automático** de pesquisa pós-evento (pedido entregue / atendimento resolvido) via scheduler idempotente, **envio** reusando integralmente o pipeline da Onda 8 (dispatch 141 + email 142 + WhatsApp HSM 143), **coleta** por landing pública mobile-first com token de uso único, **cálculo** NPS em janela móvel (% promotores − % detratores), **página analítica** `/app/nps`, alerta de detrator ao Gestor e ativação dos hooks que substituem os placeholders. Zero infraestrutura nova de envio — o NPS é um *consumidor* dos canais da onda |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | P2 — não bloqueia go-live, mas quita promessa visível em tela já implementada (Cockpit v0.27.0) |
| **Épico** | Onda 8 — Notificações Reais (v2.4.0 "Reach") |
| **PRDs Relacionados** | PRD-141 (dispatch + deliveries — **host do envio**); PRD-142 (template email `nps_pesquisa`); PRD-143 (HSM map — ganha entrada `nps.surveyRequested`); PRD-008 F1 (catálogo de eventos — DELTA +3 eventos); PRD-147 (opt-out granular — co-existência declarada); PRD-040 F1 (card KPI #12 — **placeholder quitado**); PRD-051 F1 (card aba Visão Geral — **placeholder quitado**); PRD-012 F1 (ficha cliente — badge NPS, DELTA aditivo); PRD-032 F1 (gatilho `delivered`); PRD-010/011 F1 (gatilho conversa resolvida); PRD-105 (pg_cron); PRD-102 (Edge infra); PRD-103 (RLS); PRD-110 (alertas) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Feature-based `src/features/nps/`; Edge Functions `nps-scheduler` e `nps-submit`; Provider Pattern (Mock + Supabase) para os hooks de leitura |

### Critérios de Complexidade

> **Justificativa de Alta:** o envio é trivial (canal fino sobre 141/142/143), mas o PRD carrega três riscos próprios. (1) **Superfície pública anônima:** a landing `/pesquisa/:token` e a Edge `nps-submit` são acessíveis sem auth — token opaco de uso único, rate limit, expiração e idempotência são requisitos de segurança, não de conveniência. (2) **Anti-fadiga é o produto:** pesquisa demais queima a base — o NPS de quem responde irritado mede a irritação com a pesquisa, não com a empresa. Cooldown por cliente, janela de envio em horário comercial e amostragem são regras de primeira classe. (3) **Honestidade estatística:** com a base da Turbo Diesel, janelas curtas têm N pequeno — o cálculo precisa expor o N e a taxa de resposta junto do score, ou o Cockpit exibirá um "NPS 100" de duas respostas como se fosse verdade.

---

## Contexto do Problema

A auditoria de 10/06/2026 identificou um gap de roadmap do mesmo padrão do caso Despesas/Caixa: **placeholders prometendo uma funcionalidade que nenhum PRD da Fase 2 implementa.**

| Origem | Promessa em tela | Status |
|--------|------------------|--------|
| PRD-040 (Cockpit) | KPI #12 — card "NPS (Em breve — Fase 2)" | ✅ **Em produção** (v0.27.0 "Cockpit") |
| PRD-051 (Atendimento Análise) | Aba Visão Geral — "1 card NPS placeholder Fase 2" | ⏳ Pendente, redigido |
| Conversa de design do CRM (25/05) | "Indicador de NPS / saúde da relação — quando tivermos NPS futuro" (recomendações da ficha) | Registro conceitual |

Nenhuma das Ondas 4–14 cobria o NPS real. Além da dívida técnica, há a dor de negócio: a Turbo Diesel **não tem nenhum termômetro estruturado de satisfação**. O cliente que recebe a peça errada, ou que esperou demais, reclama no WhatsApp do vendedor — e a informação morre ali. O Owner descobre o detrator quando ele já virou churn (PRD-046 mede o sintoma, não a causa). O NPS transacional fecha esse ciclo: peça entregue → pergunta → nota → detrator vira alerta acionável **antes** de virar cliente perdido.

---

## Conceito da Solução

### Metodologia

NPS clássico transacional (tNPS): pergunta única **"De 0 a 10, qual a chance de você recomendar a GALLO para um colega ou amigo?"** + comentário opcional. Classificação derivada (nunca coluna): **0–6 detrator · 7–8 neutro · 9–10 promotor**. Score: `round(%promotores − %detratores)` sobre janela móvel configurável (default 90 dias), sempre acompanhado de **N respostas** e **taxa de resposta**.

### Fluxo Fim-a-Fim

```
┌─ Gatilhos (eventos já existentes) ─────────────────────────────────┐
│ order.fulfillment → 'delivered'   (PRD-032)                        │
│ conversation → 'resolved'         (PRD-010/011)                    │
└──────────────────────────┬─────────────────────────────────────────┘
                           │ (nada inline — gatilho só marca o fato)
                           ▼
┌─ Edge Function nps-scheduler (pg_cron, horário em horário) ────────┐
│ 1. Seleciona elegíveis: delivered/resolved há ≥ delayHours,        │
│    sem survey, fora de cooldown, dentro de samplingRate            │
│ 2. INSERT crm.nps_surveys (token opaco, expires_at)                │
│ 3. Emite nps.surveyRequested → notification-dispatch (141)         │
│    └─ canal: whatsapp_first (HSM 'nps_pesquisa' via 143)           │
│       fallback email (template 142) se sem telefone/invalid        │
│ 4. Janela de envio: só dispara entre sendWindow (def. 09–20h)      │
└──────────────────────────┬─────────────────────────────────────────┘
                           ▼
        Cliente toca o botão → /pesquisa/:token (landing pública)
                           │ escolhe 0–10 (+ comentário opcional)
                           ▼
┌─ Edge Function nps-submit (pública, rate-limited) ─────────────────┐
│ valida token (existe, não expirado, não respondido)                │
│ grava score+comment, responded_at; status='responded'              │
│ score ≤ 6 → emite nps.detractorResponded → Gestor (inApp/toast)    │
└──────────────────────────┬─────────────────────────────────────────┘
                           ▼
        useNpsMetrics → /app/nps + card Cockpit (040) + card 051
```

**Invariante de reuso (espírito da onda):** este PRD **não envia nada diretamente**. Todo disparo passa pelo `notification-dispatch` (141), que decide canal, registra delivery, respeita supressões (`email_status` / `whatsapp_status`) e herda idempotência. O NPS adiciona apenas: o *quando* (scheduler), o *para quem* (elegibilidade) e o *o quê* (template).

### Schema — Tabela Única

Survey e resposta são 1:1 — uma tabela, colunas de resposta nullable:

```sql
CREATE TABLE crm.nps_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES crm.stores(id),
  customer_id uuid NOT NULL REFERENCES crm.customers(id),

  trigger text NOT NULL CHECK (trigger IN ('order_delivered','conversation_resolved','manual')),
  order_id uuid REFERENCES crm.orders(id),
  conversation_id uuid REFERENCES crm.conversations(id),

  token text UNIQUE NOT NULL,                -- opaco, ≥ 32 chars URL-safe; revogável por expiração
  channel text CHECK (channel IN ('whatsapp','email')),   -- preenchido no envio (snapshot do canal vencedor)
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','responded','expired','suppressed','failed')),

  score smallint CHECK (score BETWEEN 0 AND 10),
  comment text,

  sent_at timestamptz,
  responded_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON crm.nps_surveys (store_id, status);
CREATE INDEX ON crm.nps_surveys (customer_id, created_at DESC);   -- cooldown lookup
CREATE INDEX ON crm.nps_surveys (responded_at) WHERE status = 'responded';  -- janela de cálculo
-- RLS (estende PRD-103): Owner cross-store; Manager por store;
-- Seller: SELECT apenas surveys de clientes da própria carteira (customer.seller_id);
-- INSERT/UPDATE exclusivos de service_role (scheduler e submit)
```

### Configuração — `nps_config` (platform_settings, Zod com defaults)

```typescript
const npsConfigSchema = z.object({
  enabled: z.boolean().default(false),                    // master switch — nasce OFF
  triggers: z.object({
    orderDelivered:        z.object({ enabled: z.boolean().default(true),  delayHours: z.number().default(24) }),
    conversationResolved:  z.object({ enabled: z.boolean().default(false), delayHours: z.number().default(2)  }),
  }),
  cooldownDays: z.number().default(30),         // máx. 1 pesquisa por cliente no período, cross-trigger
  tokenExpiryDays: z.number().default(7),
  npsWindowDays: z.number().default(90),        // janela móvel do score
  samplingRate: z.number().min(0).max(1).default(1),      // 1 = 100% dos elegíveis
  channelStrategy: z.enum(['whatsapp_first_email_fallback','email_only']).default('whatsapp_first_email_fallback'),
  sendWindow: z.object({ startHour: z.number().default(9), endHour: z.number().default(20) }),
  minResponsesForScore: z.number().default(5),  // abaixo disso, UI exibe "Coletando dados (N/5)" em vez do número
})
```

Editável em `/app/configuracoes/nps` (Owner). **Pesquisa respeita quiet hours por desenho** — diferente do transacional do 143 (que as ignora), NPS não é urgente: fora do `sendWindow`, o scheduler segura para a próxima execução elegível.

### Envio — Extensões nos Contratos da Onda

**HSM map (143) — entrada nova:**

```typescript
'nps.surveyRequested': {
  templateKey: 'nps_pesquisa',                 // crm.message_templates (116), categoria UTILITY
  metaCategory: 'utility',                     // vinculada à transação — base legal + aprovação + custo corretos
  params: (p: NpsSurveyPayload) => [ p.customerFirstName, p.contextLabel ],  // {{1}} nome, {{2}} "pedido #PD-0042"
  ctaUrlSuffix: (p) => p.token,                // botão CTA URL: https://<dominio>/pesquisa/{{1}}
  sessionText: (p) => `Oi ${p.customerFirstName}! Seu ${p.contextLabel} foi concluído. De 0 a 10, qual a chance de nos recomendar? Responda aqui: ${p.surveyUrl}`,
},
```

> **Nota técnica Meta:** o link vai como **botão CTA URL com sufixo dinâmico** (`https://<dominio>/pesquisa/{{1}}`) — padrão aprovável em utility; URL completa em variável de corpo é motivo recorrente de rejeição. O suporte a `ctaUrlSuffix` é **DELTA aditivo declarado no contrato do mapa do 143** (os 4 templates do go-live não usam botão; este é o primeiro).

**Template email (142):** `nps_pesquisa` — assunto curto, pergunta única, escala 0–10 como grade de links/botões (cada número = `/pesquisa/:token?score=N`, pré-selecionando a nota na landing — um clique a menos), footer padrão com descadastro.

**Categoria de roteamento (008):** evento `nps.surveyRequested` entra na categoria **commercial** (não marketing, não transactional-crítico) — respeitando a matriz de preferências; o opt-out granular de pesquisas chega com o 147 (co-existência: até lá, vale a matriz do 008 + supressões do 141/143).

### Landing Pública `/pesquisa/:token`

Rota pública no nível raiz do router (fora dos guards dos 4 sub-apps), mobile-first, tema GALLO (dark + Diesel):

- Contexto leve: "Como foi sua experiência com o **{contextLabel}**?" (sem PII além do primeiro nome)
- Escala 0–10 em botões grandes (touch-target ≥ 48px), gradiente semântico (0 vermelho → 10 verde)
- Após o toque: comentário opcional + enviar → tela de agradecimento (detrator: "Sentimos muito — nosso time vai te procurar")
- Estados: token inválido / expirado / já respondido (mensagens distintas, sem vazar existência de dados)
- `?score=N` (vindo do email) pré-seleciona a nota; envio ainda exige confirmação
- `<meta name="robots" content="noindex">` + `Referrer-Policy: no-referrer` (token na URL não vaza via referrer)

Submissão via Edge `nps-submit` (service_role grava no `crm` — consistente com "cross-schema só via Edge"): rate limit por IP (10/min), validação completa do token, **idempotência** (segundo POST do mesmo token → 409 + página "já respondido").

### Página Analítica `/app/nps`

- **Header:** filtros (janela: 30/90/180/365 dias; loja para Owner; gatilho)
- **KPIs:** Score NPS (gauge −100..+100, cor semântica) + N respostas + taxa de resposta + Δ vs janela anterior. Abaixo de `minResponsesForScore`: estado "Coletando dados (N/5)" no lugar do número
- **Gráfico 1:** evolução mensal do NPS (LineChart, 12 meses)
- **Gráfico 2:** distribuição promotores/neutros/detratores (barras empilhadas por mês)
- **Tabela de respostas:** cliente, nota (badge colorido por classe), comentário, gatilho, contexto (pedido/conversa com link), data, vendedor da carteira; filtros por classe e busca textual no comentário
- **Seção Detratores:** lista filtrada score ≤ 6 com CTA "Abrir conversa" (navega ao inbox PRD-010 com o cliente)
- **Permissões:** Owner cross-store; Gestor por loja; **Vendedor sem acesso** (mesma postura anti compare-and-shame do PRD-051); Financeiro sem acesso

### Quitação dos Placeholders (DELTAs declarados)

| PRD | DELTA |
|-----|-------|
| **PRD-040** (✅ produção) | Card KPI #12 troca "Em breve" por `useNpsMetrics()` — score + sparkline + estado "coletando"; drill-down → `/app/nps`. **DELTA em tela implementada** — mudança cirúrgica no card, zero refactor do grid |
| **PRD-051** (⏳ pendente) | RF-012: card NPS deixa de ser placeholder e consome `useNpsMetrics()`; nota de migração no PRD ao implementá-lo |
| **PRD-012** (✅ produção) | Badge "NPS {score} · {classe}" no header da ficha quando o cliente tem resposta ≤ 12 meses + entrada na timeline; **DELTA aditivo** |
| **PRD-008** | Catálogo +3 eventos: `nps.surveyRequested` (customer, commercial), `nps.detractorResponded` (Gestor/Owner, operational, warning, inApp+toast), `nps.responseReceived` (interno, audit-only) |
| **PRD-143** | Contrato do HSM map ganha `ctaUrlSuffix` opcional; seed do template `nps_pesquisa` (pending_meta_approval) |

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Resposta inline no WhatsApp (cliente digita a nota) | Exige parser no webhook 114; nota colide com conversa humana no inbox; ambiguidade "8" = nota ou quantidade? Evolução pós-MVP registrada |
| Quick replies 0–10 no HSM | Meta limita 3 botões quick reply; lista interativa não existe em template HSM — só em sessão |
| CSAT 1–5 estrelas | Os placeholders e cards já prometem **NPS**; metodologia padrão de mercado, comparável externamente |
| Ferramenta externa (Track.co, Typeform) | Custo recorrente, dados fora da plataforma, sem integração com ficha/Cockpit/inbox — contraria a tese do produto |
| Disparo inline no hook de fulfillment | Scheduler idempotente é o padrão da casa (124/126/139): re-executável, janela retroativa, anti-duplicação natural, respeita sendWindow |
| Tabelas separadas survey/response | Relação 1:1 — join desnecessário |
| NPS relacional periódico (campanha trimestral à base toda) | Marketing em massa — pertence ao território do 148 (Drip) + 147 (opt-in); registrado como evolução |
| Score sem N mínimo | "NPS 100" com 2 respostas no Cockpit é desinformação executiva |

---

## Escopo

### Incluído

- ✅ Migration `crm.nps_surveys` + RLS (Owner/Manager/Seller-carteira leitura; mutações service_role)
- ✅ `nps_config` (Zod + defaults) em platform_settings + tela `/app/configuracoes/nps` (Owner)
- ✅ Edge `nps-scheduler` (pg_cron horário): elegibilidade (delay, cooldown, sampling, sem duplicata), criação do survey, emissão `nps.surveyRequested`, respeito ao sendWindow; idempotente e re-executável
- ✅ Entrada `nps.surveyRequested` no HSM map (143) com `ctaUrlSuffix` (DELTA de contrato) + seed do template `nps_pesquisa` utility (pending_meta_approval) + sessionText
- ✅ Template email `nps_pesquisa` (142) com grade 0–10 linkando `?score=N`
- ✅ Estratégia de canal `whatsapp_first_email_fallback` (sem telefone ou `whatsapp_status='invalid'` → email; ambos indisponíveis → status `suppressed` + audit)
- ✅ Landing pública `/pesquisa/:token` (rota raiz fora dos guards) mobile-first, estados completos, noindex + no-referrer
- ✅ Edge `nps-submit` pública: rate limit IP, validação, idempotência, gravação, emissão `nps.detractorResponded` quando score ≤ 6
- ✅ Notificação de detrator ao Gestor/Owner via fundação 008 (inApp + toast)
- ✅ Job de expiração (no próprio scheduler): `sent` com `expires_at` vencido → `expired`
- ✅ Hooks `useNpsMetrics(filters)` e `useNpsSurveys(filters)` via Provider Pattern (Mock com Faker para demo + Supabase real)
- ✅ Página `/app/nps` completa (KPIs com N mínimo, 2 gráficos, tabela, seção detratores, permissões)
- ✅ Quitação dos placeholders: card PRD-040 ativado (drill-down → `/app/nps`); DELTA registrado para o PRD-051; badge + timeline na ficha (PRD-012)
- ✅ Audit: `nps_survey_created`, `nps_survey_sent`, `nps_response_received`, `nps_detractor_alerted`, `nps_survey_expired`, `nps_survey_suppressed`
- ✅ Testes: elegibilidade (cooldown/sampling/delay/duplicata), idempotência do scheduler 2×, token (inválido/expirado/repetido), cálculo (classes, janela, N mínimo), fallback de canal, E2E mock delivered → HSM → submit → card
- ✅ Documentação `docs/dev/nps.md` (metodologia, anti-fadiga, fluxo, corpo do template para submissão Meta, guia do Gestor para detratores)

### Excluído

- ❌ Resposta inline no WhatsApp (parser de dígitos) — evolução registrada
- ❌ NPS relacional periódico / campanha em massa — território 147+148
- ❌ Workflow formal de tratamento de detrator (fila acknowledged/contacted/resolved) — MVP entrega alerta + CTA; fila é evolução
- ❌ Análise de sentimento dos comentários via LLM — Onda 9 (PRD-151+) consome `nps_surveys.comment` como insumo
- ❌ CSAT/CES e outras métricas de experiência
- ❌ Benchmark externo de mercado
- ❌ NPS por vendedor como ranking comparativo (compare-and-shame — postura do PRD-051 mantida)
- ❌ SMS como canal de pesquisa (144 isolado)

---

## Requisitos Funcionais

### Schema + Configuração

- **RF-001:** Migration `crm.nps_surveys` conforme DDL, com os 3 índices e RLS descrita.
- **RF-002:** `nps_config` validado por Zod com defaults; master switch `enabled` nasce **false** (nada dispara antes da config consciente do Owner).
- **RF-003:** Tela `/app/configuracoes/nps` (GuardedRoute Owner): toggles por gatilho, delays, cooldown, expiração, janela, sampling, estratégia de canal, sendWindow; mudanças auditadas (`nps_config_changed`).

### Scheduler de Disparo

- **RF-010:** Edge `nps-scheduler` via pg_cron (horário em horário) com lock de execução única.
- **RF-011:** Elegibilidade `order_delivered`: pedidos com fulfillment `delivered` há ≥ `delayHours`, cliente sem survey nos últimos `cooldownDays`, sem survey `pending|sent` ativa, dentro de `samplingRate` (hash determinístico do survey-candidato — re-execução não re-sorteia).
- **RF-012:** Elegibilidade `conversation_resolved` análoga (quando habilitado), com guarda extra: conversa criada por `system_notification` sem interação humana **não** gera pesquisa.
- **RF-013:** Para cada elegível: INSERT do survey (token ≥ 32 chars URL-safe, `expires_at = now() + tokenExpiryDays`) + emissão de `nps.surveyRequested` ao dispatch (141) com payload `{ surveyId, token, customerFirstName, contextLabel, surveyUrl }`.
- **RF-014:** Fora do `sendWindow`, o ciclo não emite (elegíveis aguardam a próxima execução dentro da janela) — audit `nps_send_window_deferred` agregado.
- **RF-015:** Surveys `sent` com `expires_at` vencido → `expired` no mesmo ciclo.
- **RF-016:** Idempotência total: execução 2× consecutivas = mesmo estado (constraint de duplicata + dedupe por gatilho/contexto).

### Envio (extensões de contrato)

- **RF-020:** Entrada `nps.surveyRequested` no `notificationHsmMap` com `metaCategory: 'utility'`, params tipados e `ctaUrlSuffix` — **DELTA de contrato no 143** (campo opcional; os 4 templates existentes não mudam).
- **RF-021:** Seed do template `nps_pesquisa` no 116 (status `pending_meta_approval`) com corpo proposto no Anexo de `docs/dev/nps.md`.
- **RF-022:** Template email `nps_pesquisa` no catálogo do 142 com grade 0–10 → `?score=N`.
- **RF-023:** Estratégia `whatsapp_first_email_fallback`: telefone válido → whatsapp; ausente/`invalid` → email; `email_status` bounced/complained e sem whatsapp → `suppressed` + audit. Canal vencedor gravado em `nps_surveys.channel`; envio aceito pelo dispatch → status `sent` + `sent_at`.
- **RF-024:** Falha definitiva de entrega (delivery `failed` sem retry restante) → survey `failed` (não conta na taxa de resposta).

### Landing + Submit

- **RF-030:** Rota pública `/pesquisa/$token` no nível raiz do router (fora de `/app|/loja|/pwa|/portal`), tema GALLO, mobile-first, WCAG 2.1 AA.
- **RF-031:** GET de contexto via `nps-submit?token=` (modo leitura): retorna `{ contextLabel, customerFirstName, state }` — `state ∈ valid|expired|responded|invalid`; cada estado tem tela própria sem vazar dados.
- **RF-032:** Escala 0–10 (touch ≥ 48px, gradiente semântico); `?score=N` pré-seleciona; comentário opcional (≤ 1000 chars); submissão única.
- **RF-033:** POST `nps-submit`: rate limit 10/min/IP; valida token/expiração/duplicidade; grava `score`, `comment`, `responded_at`, `status='responded'`; segundo POST → 409.
- **RF-034:** `score ≤ 6` → emite `nps.detractorResponded` (payload: cliente, nota, comentário, contexto) roteado a Gestor da loja + Owner (inApp + toast).
- **RF-035:** Agradecimento condicional: detrator recebe variação "nosso time vai te procurar".
- **RF-036:** `noindex` + `Referrer-Policy: no-referrer` na landing.

### Cálculo + Página /app/nps

- **RF-040:** `computeNps(responses, window)` — função pura: classes derivadas, score = round(%prom − %detr), retorna `{ score, n, responseRate, promoters, passives, detractors }`; abaixo de `minResponsesForScore` retorna `state: 'collecting'`.
- **RF-041:** Hooks `useNpsMetrics(filters)` / `useNpsSurveys(filters)` via Provider Pattern (factory `VITE_DATA_SOURCE`); Mock gera surveys/respostas Faker plausíveis (distribuição realista ~60/20/20).
- **RF-042:** `NpsAnalyticsPage` em `src/features/nps/pages/`, rota `/app/nps`: KPIs, gauge, evolução 12 meses (LineChart), distribuição empilhada mensal, filtros com URL sync.
- **RF-043:** Tabela de respostas paginada (30/pg) com filtros por classe/gatilho/busca em comentário; linha → contexto (pedido PRD-032 / conversa PRD-010).
- **RF-044:** Seção Detratores: lista score ≤ 6 da janela + CTA "Abrir conversa" (inbox com customer pré-filtrado).
- **RF-045:** Permissões: Owner cross-store; Gestor loja; Vendedor e Financeiro bloqueados (`GuardedRoute`).

### Quitação dos Placeholders + Eventos

- **RF-050:** Card KPI #12 do Cockpit (PRD-040, produção) passa a renderizar `useNpsMetrics()`: score + sparkline + estado "Coletando dados (N/5)"; click → `/app/nps`. Mudança cirúrgica documentada como DELTA no `_DONE` do 040.
- **RF-051:** DELTA registrado no PRD-051 (pendente): ao implementar, o card NPS consome o hook real — nota de migração adicionada ao documento.
- **RF-052:** Ficha do cliente (PRD-012): badge "NPS {score} · {classe}" quando há resposta ≤ 12 meses + entrada na timeline de eventos; DELTA aditivo no `_DONE` do 012.
- **RF-053:** Catálogo do 008 ganha os 3 eventos (Anexo A atualizado via DELTA no `_DONE`): `nps.surveyRequested` (customer/commercial), `nps.detractorResponded` (interno/operational/warning), `nps.responseReceived` (audit-only).

### Testes + Documentação

- **RF-060:** Unit: `computeNps` (classes, bordas 6/7 e 8/9, janela, N mínimo), elegibilidade (cooldown, sampling determinístico, delay, duplicata, guarda system_notification).
- **RF-061:** Integração: scheduler 2× idempotente; token inválido/expirado/repetido; fallback de canal; expiração; detrator → notificação.
- **RF-062:** E2E mock: pedido delivered → scheduler → HSM enviado (mock 115) → landing → submit 9 → métrica reflete → card Cockpit exibe.
- **RF-063:** `docs/dev/nps.md`: metodologia, anti-fadiga, fluxo, corpo do template Meta (Anexo de submissão), guia do Gestor para detratores.

---

## Requisitos Não-Funcionais

- **RNF-001 (Anti-fadiga por desenho):** cooldown e sampling avaliados **antes** de qualquer criação de survey; impossível duplicar pesquisa ao mesmo cliente na janela por re-execução do scheduler.
- **RNF-002 (Superfície pública mínima):** `nps-submit` expõe apenas o necessário por token; nenhum endpoint lista surveys; erros não distinguem "não existe" de "expirou" para tokens inválidos.
- **RNF-003 (Honestidade estatística):** score nunca exibido sem N; abaixo do mínimo, estado "coletando" em todas as superfícies (Cockpit incluso).
- **RNF-004 (Reuso absoluto):** zero envio fora do dispatch 141 — mesmo lint `no-restricted-imports` do 143.
- **RNF-005 (Latência da landing):** GET de contexto + render < 1,5s p95 em 4G (cliente está no celular, no pátio).
- **RNF-006 (Isolamento):** falha do NPS jamais afeta fulfillment, conversas ou pagamentos (herda 008 RF-013).

---

## Critérios de Aceitação

### RF-011/016: Elegibilidade e Idempotência

```gherkin
DADO pedido #PD-0042 com fulfillment 'delivered' há 26h
  E cliente sem pesquisa nos últimos 30 dias
QUANDO nps-scheduler executa às 14h (dentro do sendWindow)
ENTÃO survey criado (token único, expira em 7 dias)
  E nps.surveyRequested emitido ao dispatch
  E re-execução imediata NÃO cria segundo survey

DADO o mesmo cliente com survey respondido há 12 dias
QUANDO novo pedido dele é entregue
ENTÃO nenhum survey criado (cooldown 30d)
  E audit nps_survey_suppressed com reason='cooldown'
```

### RF-023: Estratégia de Canal

```gherkin
DADO cliente com whatsapp válido e janela 24h fechada
QUANDO o envio processa
ENTÃO HSM 'nps_pesquisa' com botão CTA URL /pesquisa/<token>
  E survey.channel='whatsapp', status='sent'

DADO cliente sem telefone, email_status='valid'
ENTÃO email com grade 0–10 enviado; channel='email'

DADO cliente sem telefone e email 'complained'
ENTÃO survey status='suppressed' + audit; ZERO chamadas a provider
```

### RF-033/034: Submissão e Detrator

```gherkin
DADO landing aberta com token válido
QUANDO cliente toca 3 e comenta "peça veio errada, perdi dois dias"
ENTÃO score=3 gravado, status='responded'
  E nps.detractorResponded notifica Gestor da loja (inApp + toast)
  E tela de agradecimento exibe variação de detrator
  E segundo POST do mesmo token → 409

DADO token com expires_at vencido
QUANDO a landing carrega
ENTÃO tela "Pesquisa expirada" sem expor dados do cliente
```

### RF-040/050: Score Honesto no Cockpit

```gherkin
DADO 3 respostas na janela de 90 dias (minResponses=5)
QUANDO Owner abre /app/cockpit
ENTÃO card NPS exibe "Coletando dados (3/5)" — nunca um número

DADO 20 respostas: 12 promotores, 4 neutros, 4 detratores
ENTÃO card exibe NPS 40 (+sparkline) e /app/nps detalha N=20 e taxa de resposta
```

---

## Fases de Implementação

### Fase 1 — Schema + Config + Motor (1,5 dias)
- Migration + RLS; `nps_config` Zod + tela de configuração
- `computeNps` puro + testes unitários (bordas de classe, N mínimo)

### Fase 2 — Scheduler + Envio (2 dias)
- Edge `nps-scheduler` (elegibilidade, sampling determinístico, sendWindow, expiração, idempotência)
- DELTA do HSM map (`ctaUrlSuffix`) + seed template Meta + template email 142 + estratégia de canal

### Fase 3 — Landing + Submit (1,5 dias)
- Rota pública `/pesquisa/$token` (estados completos, a11y, noindex/no-referrer)
- Edge `nps-submit` (rate limit, idempotência, gravação, evento de detrator)

### Fase 4 — Página Analítica + Quitação (2 dias)
- Providers Mock/Supabase + hooks; `/app/nps` completa
- Ativação do card 040 (DELTA em produção), DELTA registrado no 051, badge ficha 012, catálogo 008

### Fase 5 — Testes + Docs (1 dia)
- Bateria de integração + E2E mock fim-a-fim
- `docs/dev/nps.md` + Anexo de submissão Meta + `_DONE`

---

## Dependências

### PRDs Anteriores

| PRD | Descrição | Status |
|-----|-----------|--------|
| PRD-141 | Dispatch + deliveries (host do envio) | ⏳ Redigido |
| PRD-142 (Fase 1) | Catálogo de templates email | ⏳ Redigido |
| PRD-143 | WhatsAppChannel + HSM map (recebe DELTA) | ⏳ Redigido |
| PRD-008 F1 | Fundação de notificações (catálogo/eventos) | ⏳ Pendente |
| PRD-032 F1 | Pedido — transição `delivered` (gatilho) | ✅ Concluído |
| PRD-010/011 F1 | Conversas — status resolvido (gatilho) | ✅ Concluído |
| PRD-040 F1 | Cockpit — card a quitar | ✅ **Produção** |
| PRD-012 F1 | Ficha do cliente — badge (DELTA aditivo) | ✅ Concluído |
| PRD-105 | pg_cron / scheduler infra | ✅ Concluído |
| PRD-102/103 | Edge infra + RLS | ✅ Concluído |

### Serviços Externos

| Serviço | Tipo | Status |
|---------|------|--------|
| Meta — template `nps_pesquisa` (utility, botão CTA URL) | Aprovação HSM | **Submeter já** (Anexo) — dias de fila; mock não bloqueia dev |
| Resend | Reuso do 141 | Conforme 141 |

### Decisões Pendentes

- [ ] **Domínio da landing** `/pesquisa/:token` — apex vs subdomínio: conversa com a decisão em aberto do PRD-008 "Compass" (roteamento host-aware). Funciona em qualquer cenário; definir a URL canônica antes da submissão Meta (o botão CTA fixa o domínio no template)
- [ ] **Gatilho conversa resolvida** — nasce `enabled: false`; Owner decide ativar após observar volume do gatilho de pedido
- [ ] **Texto final do template** — corpo proposto no Anexo; validar tom com Frederico antes da submissão

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Onda 8 — Notificações Reais (v2.4.0 Reach)"**.

| Ordem | PRD | Título | Status | Relação |
|-------|-----|--------|--------|---------|
| 1 | PRD-141 | Email Transacional (Resend) | ⏳ | Host do dispatch/deliveries |
| 2 | PRD-142 | Templates Email | ⏳ | Catálogo (co-dep. do 141) |
| 3 | PRD-143 | WhatsApp HSM Transacional | ⏳ | Canal + HSM map (recebe DELTA) |
| 4–8 | PRD-144…148 | SMS, Push, Center, Preferências, Drip | ⏳ | Sequência da onda |
| **9** | **PRD-148B** | **NPS — Pesquisa de Satisfação** | **🔄 ATUAL** | Consumidor dos canais 141/142/143 |
| 10 | PRD-149 | Carrinho Abandonado | ⏳ | — |
| 11 | PRD-150 | Migração de Stubs Notificações | ⏳ | Verifica quitação dos placeholders |

> **Nota:** o 148B não depende do 148 (Drip) — depende apenas de 141/142/143. Pode ser implementado em paralelo aos 144–148 se a priorização do cliente pedir.

---

## Considerações de Segurança

### Dados Sensíveis

| Dado | Classificação | Proteção |
|------|---------------|----------|
| Token de pesquisa | Credencial de uso único | ≥ 32 chars URL-safe, unique, expiração, idempotência; noindex + no-referrer na landing |
| Comentário do cliente | PII potencial (texto livre) | RLS por papel/carteira; nunca exposto na landing; LGPD: coletado com finalidade declarada na própria tela |
| Score por cliente | Comercial sensível | Mesmas policies; vendedor só vê carteira própria (badge), sem ranking comparativo |

### Autenticação e Autorização

Landing e `nps-submit` são anônimas **por token** (posse = autorização para aquele survey, e nada mais). Toda mutação no `crm` via service_role nas Edge Functions. Página `/app/nps` atrás de `GuardedRoute` Owner/Gestor.

### Auditoria

`nps_config_changed`, `nps_survey_created/sent/suppressed/expired`, `nps_response_received`, `nps_detractor_alerted` — trilha completa do ciclo no audit log imutável (PRD-103).

---

## Convenções

| Elemento | Convenção |
|----------|-----------|
| Páginas | `NpsAnalyticsPage`, `NpsSurveyPublicPage`, `NpsSettingsPage` |
| Engine | `computeNps`, `evaluateEligibility` |
| Hooks | `useNpsMetrics`, `useNpsSurveys` |
| Edge Functions | `nps-scheduler`, `nps-submit` |
| Pasta | `src/features/nps/` |
| Tabela | `crm.nps_surveys` |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Você é o Claude Code CLI. Este PRD foi criado pelo Agente Arquiteto (plataforma web).

> **💬 Antes de implementar:** esclareça qualquer ambiguidade — em especial a URL canônica da landing (decisão Compass) antes de submeter o template Meta.

> ⚠️ **APÓS:** Bump **v2.4.0-rc.9**; CHANGELOG; renomear `PRD-148B-nps-pesquisa-satisfacao_DONE.md`; anotar DELTAs nos `_DONE` de 008, 012, 040 e 143; registrar nota de migração no PRD-051; lembrar o Owner da **submissão Meta do template** (gate de produção, não de dev) e de ligar o master switch só após validar o texto.

| Princípio | Descrição |
|-----------|-----------|
| **Consumidor, não infraestrutura** | Zero envio fora do dispatch 141; o NPS só decide quando/quem/o quê |
| **Anti-fadiga primeiro** | Cooldown e sampling antes de criar qualquer survey |
| **Score honesto** | Nunca exibir número sem N mínimo — em nenhuma superfície |
| **Token é credencial** | Uso único, expira, não enumera, não vaza por referrer |
| **Detrator é evento, não relatório** | Nota ≤ 6 chega ao Gestor em segundos, não no fechamento do mês |

| ❌ Evitar |
|-----------|
| Enviar pesquisa fora do sendWindow "porque o evento chegou agora" |
| Segundo caminho de envio fora do 141 |
| Exibir NPS sem N (Cockpit incluso) |
| Coluna `classification` no banco (é derivada do score) |
| Ranking de NPS por vendedor |
| Ligar `enabled` por default na migration |
| URL completa em variável de corpo do HSM (rejeição Meta) |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ✅ IMPLEMENTADO — **inerte até o dono ligar** |
| **Data de Implementação** | 12/08/2026 |
| **Versão do App** | bump pendente (ver ressalvas) |
| **Implementado por** | Claude Code CLI |
| **Observações** | Ver ressalvas abaixo. Código completo e testado; migrations **não aplicadas**, Edge Functions **não deployadas**, master switch `false`. |

### Ressalvas — divergências deliberadas do PRD

Redesenho registrado em `docs/superpowers/specs/2026-08-12-nps-pesquisa-satisfacao-design.md`.
O PRD pressupunha a Onda 8 (PRD-141/142/143), que **nunca foi implementada**:
`notification-dispatch` não existe e os canais de e-mail e WhatsApp do bus de
notificações são stubs que lançam `NotImplementedError`.

| PRD manda | Entregue | Motivo |
|---|---|---|
| Envio pelo dispatch 141, via HSM | Texto na própria thread, atrás de `INpsSurveySender` | Motor de produção é WAHA: sem janela de 24h, sem template Meta |
| Canal e-mail (142) | **Fora do MVP** | Resend inerte; 22% dos clientes têm e-mail |
| Template `nps_pesquisa` na Meta | **Não submetido** | Não se aplica a WAHA |
| `order_delivered` ligado | Modelado, dormente | `orders` vazia em produção |
| Conversa resolvida desligada | **Gatilho primário** | 348 resolvidas em 30 dias — único com volume |
| `customer_id NOT NULL` | Nullable + `phone_digits` | 293 das 348 são leads, não clientes |
| `crm.nps_surveys` | `public.nps_surveys` | Schema `crm` não existe |
| `platform_settings` | Tabela `nps_settings` | `platform_settings` não existe |

**Acrescentado ao PRD:** duas travas anti-disparo em massa (`max_backfill_days`,
`daily_cap`). Sem elas, ligar a chave dispararia para as 682 conversas
resolvidas do histórico de uma vez.

**Pendente do dono:** aplicar as 3 migrations, cadastrar `NPS_WORKER_SECRET`,
deployar as duas Edge Functions (`nps-submit` exige `--no-verify-jwt`), aplicar
o cron, revisar o texto da pesquisa, ligar o switch, e bump de versão. Passo a
passo em `docs/dev/nps.md`.

### DELTA 12/08/2026 — o design passou a ser o `ui_kits/nps`

O painel foi reimplementado a partir do UI Kit oficial do projeto Claude Design
(`ui_kits/nps/index.html`, direção **A · Denso**), que não existia no meu radar
na primeira entrega. Vieram do kit: faixas nomeadas (Crítica / Aperfeiçoamento /
Qualidade / Excelência), **meta interna 60** com linha tracejada na tendência,
régua −100→100, distribuição empilhada, corte por loja e corte por atendente.
A tela também mudou de menu: **Atendimento → Gestão**.

⚠️ **Reversão explícita de escopo — NPS por atendente.** Este PRD excluía
"NPS por vendedor como ranking comparativo (compare-and-shame — postura do
PRD-051 mantida)". O kit traz a tabela por atendente ordenada por score, e o
dono optou por ela em 12/08/2026, ciente do conflito. A tabela é visível apenas
a quem tem o recurso `nps` (Owner e Gestor); Vendedor segue sem acesso. O
README do próprio kit já listava isso como ponto "a confirmar com o cliente".

**Ainda do kit e NÃO implementado** (exigem schema novo, ficam para depois):
aba **Recuperação de detratores** (fila Novo / Em contato / Resolvido com SLA —
que este PRD também excluía), **motivos por chips** na pesquisa e no painel
(hoje só há comentário livre), aba **Envio** e aba **Embutidos** (widget no
Início do atendente e bloco na ficha).

**Deferido para a Onda 8:** canal e-mail com grade 0–10, submissão do HSM e
roteamento pelo dispatch 141.

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 10/06/2026 | v1 | Criação inicial — PRD inserido na Onda 8 via sub-numeração B, quitando o gap NPS identificado em auditoria de 10/06/2026 (placeholders dos PRDs 040/051 sem PRD de implementação na Fase 2) |

---

**AILA - Sistemas Inteligentes**
