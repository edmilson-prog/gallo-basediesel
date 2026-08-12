# NPS — Pesquisa de Satisfação · Design

> **Fonte da verdade:** `docs/prds/PRD-148B-nps-pesquisa-satisfacao.md`
> **Data:** 12/08/2026 · **Branch:** `feat/nps-pesquisa-satisfacao`
> **Status:** aprovado pelo dono em 12/08/2026 (decisões de canal e público)

Este documento é o **delta entre o PRD-148B e a realidade do repositório**. O PRD
foi redigido em 10/06/2026 assumindo uma Onda 8 que nunca foi implementada; a
metodologia dele continua válida e é preservada integralmente. O que muda é a
espinha de envio e a escolha de gatilho — ambas por evidência de produção,
levantada em 12/08/2026 contra o banco real.

---

## 1. Por que este documento existe

O PRD-148B se declara *"consumidor dos canais da Onda 8"* e promete *"zero
infraestrutura nova de envio"*. Nenhuma das três dependências existe:

| Dependência do PRD | Estado real |
|---|---|
| `notification-dispatch` (PRD-141) | Edge Function **não existe** |
| `emailChannel` | stub que lança `NotImplementedError` |
| `whatsappChannel` (bus de notificações) | stub que lança `NotImplementedError` |
| `_shared/notification-hsm-map.ts` (PRD-143) | arquivo **não existe** |
| `platform_settings` | tabela **não existe** no banco |
| schema `crm.` | o projeto usa `public.` |
| Resend | `invite-seller-email` é scaffold inerte sem `RESEND_API_KEY` |

E os gatilhos que o PRD escolhe estão invertidos em relação aos dados:

| PRD-148B | Produção em 12/08/2026 |
|---|---|
| `order_delivered` **ligado**, `delayHours: 24` | **0 pedidos** no banco — nasceria morto |
| `conversation_resolved` **desligado** | status é `resolvida` (pt-BR): **348 nos últimos 30 dias** |
| `customer_id NOT NULL` | das 348, apenas **55** têm cliente cadastrado; **293** são leads |
| HSM Meta + janela de 24h | motor real é **WAHA** (3 contas conectadas) — sem HSM, sem janela |
| fallback e-mail | **694 de 3.176** clientes têm e-mail (22%) |

**Achado que orienta todo o desenho:** nenhuma conversa resolvida é órfã — toda
uma tem `customer_id` **ou** `lead_id`. E `customers` e `leads` têm ambos a
coluna `phone_digits`, que serve de chave estável de cooldown atravessando os
dois mundos.

---

## 2. Decisões

| # | Decisão | Alternativa descartada |
|---|---|---|
| D1 | Envio pelo **pipeline WhatsApp real** (`processSendRequest` / `wahaSendAdapter`), na thread da própria conversa | construir o `notification-dispatch` antes — dobraria o escopo e arrastaria decisões do 141/142/143 |
| D2 | Público = **cliente e contato do pool** (`customer_id` nullable) | só cliente cadastrado — renderia ~11-16 respostas/mês, deixando o Cockpit quase sempre sem número |
| D3 | Gatilho primário = **conversa resolvida**; `order_delivered` modelado e dormente | seguir o PRD ao pé da letra e nascer sem volume |
| D4 | **E-mail fora do MVP** | esperar o Resend — bloquearia a entrega por infra de outro PRD |
| D5 | Schema `public`, config em tabela própria `nps_settings` | `crm.` / `platform_settings` — nenhum dos dois existe |
| D6 | **Backstop anti-massa** (janela retroativa + teto diário) — adição ao PRD | confiar só em cooldown e sampling, como o PRD faz |

**Princípio que substitui o "consumidor, não infraestrutura":** a conversa de
WhatsApp já existe quando é resolvida, então a pesquisa vai como **mensagem na
própria thread**. O envio fica atrás de uma interface fina `npsSurveySender`, de
modo que trocar pelo dispatch 141 seja um swap de implementação, não um refactor.

---

## 3. Schema

### 3.1 `public.nps_surveys`

```sql
create table public.nps_surveys (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),

  -- Âncora: a conversa é obrigatória; cliente e lead são alternativos.
  conversation_id uuid references public.conversations(id) on delete set null,
  customer_id uuid references public.customers(id),
  lead_id text,                       -- conversations.lead_id é TEXT neste banco
  phone_digits text not null,         -- chave de cooldown, estável entre lead e cliente
  recipient_name text,                -- snapshot: primeiro nome no envio

  trigger text not null
    check (trigger in ('conversation_resolved','order_delivered','manual')),
  order_id uuid references public.orders(id),   -- dormente até haver pedidos

  token text unique not null,         -- >= 32 chars URL-safe, opaco
  channel text check (channel in ('whatsapp','email')),
  status text not null default 'pending'
    check (status in ('pending','sent','responded','expired','suppressed','failed')),

  score smallint check (score between 0 and 10),
  comment text,

  sent_at timestamptz,
  responded_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index on public.nps_surveys (store_id, status);
create index on public.nps_surveys (phone_digits, created_at desc);   -- cooldown
create index on public.nps_surveys (responded_at) where status = 'responded';

-- Anti-duplicata estrutural: uma pesquisa por conversa.
create unique index nps_surveys_conversation_uniq
  on public.nps_surveys (conversation_id) where conversation_id is not null;
```

**Sem coluna `classification`** — promotor/neutro/detrator é sempre derivado do
score (regra explícita do PRD).

### 3.2 RLS

- **Owner** — leitura cross-store.
- **Gestor** — leitura da própria loja.
- **Vendedor** — leitura apenas de pesquisas de clientes/leads da própria
  carteira. Sem acesso à página analítica (ver §7).
- **Financeiro** — sem acesso.
- **INSERT/UPDATE** — exclusivos de `service_role` (scheduler e submit).

⚠️ Lição de `project_rls_ci_cross_leak_instance_gate`: helper booleano em policy
roda uma vez por linha. As policies usam função **set-returning** ou junção
direta, nunca helper escalar por linha.

### 3.3 `public.nps_settings` (store-scoped, colunas planas)

Espelha o padrão de `sdr_settings` — o `platform_settings` do PRD não existe.

| Coluna | Default | Papel |
|---|---|---|
| `store_id` (PK) | — | escopo |
| `enabled` | `false` | master switch — nasce desligado |
| `trigger_conversation_enabled` | `true` | gatilho primário |
| `trigger_conversation_delay_hours` | `2` | espera após `closed_at` |
| `trigger_order_enabled` | `false` | dormente (0 pedidos) |
| `trigger_order_delay_hours` | `24` | dormente |
| `cooldown_days` | `30` | por `phone_digits`, cross-trigger |
| `token_expiry_days` | `7` | validade do link |
| `window_days` | `90` | janela móvel do score |
| `sampling_rate` | `1.0` | fração dos elegíveis |
| `send_window_start_hour` | `9` | pesquisa respeita horário |
| `send_window_end_hour` | `20` | idem |
| `min_responses_for_score` | `5` | abaixo disso, "Coletando dados" |
| `max_backfill_days` | `3` | **backstop**: ignora backlog antigo |
| `daily_cap` | `50` | **backstop**: teto por loja/dia |
| `whatsapp_account_id` | `null` | instância de envio (fallback: a da conversa) |
| `updated_at` / `updated_by` | — | auditoria |

---

## 4. Anti-fadiga e backstop

O PRD trata cooldown e sampling como regras de primeira classe. Mantidos — e
reforçados, porque ligar o switch com **682 conversas resolvidas no histórico**
dispararia em massa. Já houve um incidente desse tipo com o SDR
(`project_sdr_backstop_mass_dispatch_incident`).

Ordem de avaliação, **antes** de criar qualquer survey:

1. `nps_settings.enabled` — senão, nada acontece;
2. **janela retroativa** — `closed_at >= now() - max_backfill_days`. O backlog
   histórico é invisível por construção, não por sorte;
3. **delay** — `closed_at <= now() - trigger_conversation_delay_hours`;
4. **cooldown** — nenhum survey para o mesmo `phone_digits` em `cooldown_days`;
5. **sem survey ativo** — `pending`/`sent` para o mesmo telefone; e o índice
   único por `conversation_id` como rede estrutural;
6. **opt-out** — `contacts.opt_out = true` para aquele telefone veta;
7. **sampling determinístico** — hash estável de `conversation_id`, nunca
   `random()`: reexecutar o scheduler não re-sorteia;
8. **guarda de ruído** — conversa sem nenhuma mensagem humana (só automação)
   não gera pesquisa;
9. **teto diário** — no máximo `daily_cap` surveys por loja por dia;
10. **janela de envio** — fora de `send_window`, o elegível aguarda o próximo
    ciclo (o PRD é explícito: pesquisa não é urgente).

---

## 5. Motor

Lógica pura, testada com Vitest, sem dependência de rede ou banco. O Vitest
cobre `src/**` **e** `supabase/functions/**`, então cada metade mora ao lado de
quem a consome — mesmo arranjo do `sdr-backstop-tick`, que mantém seu
`eligibility.ts` dentro da Edge Function:

```ts
// src/features/nps/engine/computeNps.ts — consumido pelo front
computeNps(responses: INpsResponse[], opts: { minResponses: number }): INpsResult
// -> { state: 'ok' | 'collecting', score, n, responseRate,
//      promoters, passives, detractors }

// supabase/functions/nps-scheduler/eligibility.ts — consumido pelo scheduler
evaluateEligibility(candidate: INpsCandidate, settings: INpsSettings, ctx): IEligibilityVerdict
// -> { eligible: true } | { eligible: false, reason: 'cooldown' | 'backfill' | ... }
```

Casos que os testes precisam cobrir: bordas de classe (6/7 e 8/9), janela móvel,
N mínimo, cooldown, sampling determinístico (mesma entrada ⇒ mesma decisão),
janela retroativa, teto diário, opt-out.

---

## 6. Coleta

### 6.1 `nps-scheduler` (Edge, pg_cron horário)

Segue o padrão consolidado da casa: `cron.schedule` + `pg_net` POST com
`x-worker-secret` do Vault, `verify_jwt` off. Por ciclo:

1. seleciona elegíveis (§4) por loja;
2. `INSERT` do survey com token opaco e `expires_at`;
3. envia pelo `npsSurveySender` (§6.2) e grava `channel`, `status='sent'`, `sent_at`;
4. expira: `sent` com `expires_at` vencido → `expired`;
5. audita cada decisão.

**Idempotência:** duas execuções consecutivas deixam o mesmo estado. Garantida
pelo índice único por `conversation_id` mais o sampling determinístico.

### 6.2 `npsSurveySender` — a interface fina

```ts
interface INpsSurveySender {
  send(survey: INpsSurveyDispatch): Promise<{ channel: 'whatsapp'; status: 'sent' | 'failed' }>
}
```

Implementação MVP: envia pelo mesmo caminho do `scheduled-send-worker` —
`wahaSendAdapter` para contas WAHA, `processSendRequest` para as demais. Quando a
Onda 8 existir, um segundo implementador roteia pelo dispatch 141 sem tocar no
scheduler.

**Mensagem** (texto livre; sem HSM porque WAHA não usa template):

> Oi, {primeiroNome}! Aqui é da GALLO Base Diesel. Seu atendimento foi
> concluído — de 0 a 10, qual a chance de você nos recomendar para um colega?
> É rapidinho: https://crm.gallobasediesel.com.br/pesquisa/{token}

O tom final passa pelo dono antes de ligar o switch (o PRD já pedia isso).

**Risco declarado:** enviar numa conversa `resolvida` pode reabri-la ou fazer o
eco criar conversa nova (ver `project_conversation_split_echo_after_close` e
`project_attendance_close_history`). Precisa ser verificado na implementação; se
o eco criar conversa nova, a mensagem do NPS é marcada para não reabrir. Uma
resposta do cliente pelo WhatsApp reabrindo a conversa é comportamento
desejável e fica como está.

### 6.3 Landing `/pesquisa/$token` + `nps-submit`

Rota pública de nível raiz (fora dos guards de `/app`, `/loja`, `/pwa`,
`/portal`), mobile-first, tokens semânticos de tema, WCAG 2.1 AA.

- `GET` de contexto devolve `{ recipientFirstName, contextLabel, state }` com
  `state ∈ valid | expired | responded | invalid`. Erros **não distinguem**
  "não existe" de "expirou" — o token não enumera.
- Escala 0–10 em alvos de toque ≥ 48px, gradiente semântico; comentário
  opcional (≤ 1000 chars); confirmação explícita.
- `POST` com rate limit 10/min/IP; segundo POST do mesmo token → **409**.
- `score <= 6` → `INSERT` em `notifications` (`dedupe_key` por survey) roteado a
  Gestor da loja + Owner, canais inApp e toast.
- Agradecimento condicional: detrator recebe a variação "nosso time vai te procurar".
- `noindex` + `Referrer-Policy: no-referrer` — o token não vaza por referrer.

---

## 7. Leitura

**Página `/app/nps`** — filtros (janela 30/90/180/365, loja para Owner, gatilho,
e **cliente cadastrado × contato**, que é consequência da decisão D2); KPIs
(score, N, taxa de resposta, Δ vs janela anterior); evolução mensal de 12 meses;
distribuição empilhada promotores/neutros/detratores; tabela de respostas
paginada com busca no comentário; seção Detratores com CTA "Abrir conversa".

**Permissões** — Owner cross-store; Gestor por loja; Vendedor e Financeiro
bloqueados. Mantém a postura anti compare-and-shame do PRD-051: **nenhum ranking
de NPS por vendedor.**

**Cockpit (PRD-040)** — o card KPI #12 troca "Em breve" por `useNpsMetrics()`:
score, sparkline e o estado "Coletando dados (N/5)"; clique navega para
`/app/nps`. Mudança cirúrgica no card, sem refactor do grid.

**Ficha do cliente (PRD-012)** — badge "NPS {score} · {classe}" quando há
resposta nos últimos 12 meses.

**RBAC** — a migration precisa **semear** `nps` (grupo Atendimento) e
`settings_nps` (grupo Configuração) em `rbac_resources` e conceder aos papéis
base. Sem o seed, o menu desaparece para todos, inclusive o Owner
(`project_rbac_resource_needs_db_seed`).

**Provider Pattern** — `useNpsMetrics(filters)` e `useNpsSurveys(filters)` via
`@/providers/data`, com implementação Mock (Faker, distribuição ~60/20/20) e
Supabase. Features nunca tocam `@/mocks` direto.

---

## 8. Honestidade estatística

Invariante do PRD, preservada: **o score nunca aparece sem N**. Abaixo de
`min_responses_for_score`, todas as superfícies — Cockpit incluído — mostram
"Coletando dados (N/5)" no lugar do número. Um "NPS 100" de duas respostas é
desinformação executiva.

---

## 9. Auditoria

`nps_config_changed`, `nps_survey_created`, `nps_survey_sent`,
`nps_survey_suppressed` (com `reason`), `nps_survey_expired`,
`nps_response_received`, `nps_detractor_alerted`.

---

## 10. Fases

| Fase | Entrega |
|---|---|
| **F1** | Migration (`nps_surveys`, `nps_settings`, RLS, seed RBAC) + tipos + `computeNps` e `evaluateEligibility` com testes |
| **F2** | Edge `nps-scheduler` + `npsSurveySender` + cron + auditoria |
| **F3** | Landing `/pesquisa/$token` + Edge `nps-submit` + alerta de detrator |
| **F4** | Providers e hooks + página `/app/nps` + card do Cockpit + badge da ficha |
| **F5** | Tela `/app/configuracoes/nps` + testes de integração + `docs/dev/nps.md` |

Cada migration aplicada por MCP é exportada para `supabase/migrations/` no mesmo
PR. **Mergear o PR não aplica a migration** — a aplicação em produção é manual e
exige OK explícito do dono, assim como o deploy das Edge Functions.

---

## 11. Fora de escopo

Herdado do PRD: resposta inline no WhatsApp (parser de dígitos), NPS relacional
em massa, workflow formal de tratamento de detrator, análise de sentimento por
LLM, CSAT/CES, benchmark externo, ranking por vendedor, SMS.

Acrescentado por este design: **canal e-mail** (D4) e **submissão de template
HSM à Meta** (D1) — ambos voltam à mesa quando a Onda 8 for implementada.

---

## 12. Riscos

| Risco | Mitigação |
|---|---|
| Ligar o switch dispara para o backlog histórico | `max_backfill_days` + `daily_cap` (§4) |
| Envio em conversa resolvida reabre a thread ou o eco cria conversa nova | verificar na F2; marcar a mensagem para não reabrir |
| Amostra pequena produz score enganoso | `min_responses_for_score` em todas as superfícies (§8) |
| Token vaza por referrer ou indexação | `noindex` + `no-referrer` + expiração + uso único |
| NPS mistura cliente e prospect | filtro dedicado na página analítica (§7) |
| 9º dígito faz o mesmo telefone virar duas chaves | `phone_digits`; sem inserir o 9 às cegas (`project_br_phone_ninth_digit_reconciliation`) |

---

**AILA — Sistemas Inteligentes**
