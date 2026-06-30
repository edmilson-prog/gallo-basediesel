# Manifesto de Bootstrap — GALLO BASE DIESEL

> **Procedimento:** `docs/integracoes/BOOTSTRAP-BANCO-EXISTENTE.md` (v1.1)
> **Banco:** Supabase `njizaasajkdqptlxddqn` (PRODUÇÃO) — schema de aplicação `public`
> **Modo:** Bootstrap (varredura única do banco existente)
> **Iniciado em:** 2026-06-17
> **Fonte da camada mecânica:** introspecção read-only do banco vivo (catálogos do Postgres)

Este é o **contrato de completude** e o **estado de progresso** do bootstrap. Completude = toda
linha alcança no mínimo o status `gerado`. Qualquer agente zero-contexto retoma daqui: lê este
arquivo, acha a primeira linha fora do status-alvo e continua.

## Legenda

**Status:** `pendente` → `gerado` (esqueleto mecânico pronto) → `enriquecido` (contexto inferido)
→ `validado` (humano confirmou).

**Tier:** `nucleo` (enriquecimento completo + validação) · `suporte` (enriquecimento leve) ·
`estrutural` (só esqueleto — junção/log/técnica) · `suspeita-morta` (só esqueleto + pergunta ao humano).

**Marcador de origem do contexto:** `✅ verificado` · `🔍 inferido (com fonte)` · `❓ pendente`.

---

## Resumo da enumeração (Fase 0)

| Categoria | Quantidade | Observação |
|-----------|-----------:|------------|
| Tabelas `public` | 54 | Schema da aplicação — foco do bootstrap |
| Materialized views `public` | 3 | BI (`mv_*`), lidas via RPC `SECURITY DEFINER` |
| Functions `public` | 35 | RPCs, helpers de RLS, funções de trigger, jobs de cron, auth hook |
| Triggers `public` | 3 | — |
| Enums/tipos nativos `public` | 0 | **Sem enums nativos** — o app usa `TEXT` + `CHECK` (padrão do projeto) |
| RLS policies `public` | 184 | Padrão `store`+`seller`+`is_staff`; conversas via `can_access_conversation()` |
| Edge Functions (repo) | 18 | 17 implantadas + 1 pendente de deploy (`whatsapp-check-number`) |
| Schemas de sistema | 8 | `auth`, `storage`, `realtime`, `cron`, `net`, `vault`, `supabase_migrations` — gerenciados pelo Supabase |

---

## Tabelas — schema `public` (54)

| objeto | tier | domínio | colunas | RLS | policies | status | ficha | observação |
|--------|------|---------|--------:|:---:|---------:|--------|-------|------------|
| ai_settings | suporte | ai | 8 | on | 2 | gerado | tables/TABLE-ai_settings.md | escrita/leitura owner-only via `current_app_role()` |
| ai_usage_events | estrutural | ai | 14 | on | 1 | gerado | tables/TABLE-ai_usage_events.md | log de consumo de LLM (sufixo `_events`); leitura owner-only |
| asset_combos | suporte | media | 7 | on | 4 | gerado | tables/TABLE-asset_combos.md | combo de ativos; verificar uso (Fase 3) |
| asset_favorites | estrutural | media | 3 | on | 4 | gerado | tables/TABLE-asset_favorites.md | junção seller↔asset (favorito) |
| asset_library_items | suporte | media | 19 | on | 4 | gerado | tables/TABLE-asset_library_items.md | biblioteca de ativos (PRD-027) |
| asset_send_log | estrutural | media | 4 | on | 4 | gerado | tables/TABLE-asset_send_log.md | log de envio de ativo |
| audit_logs | estrutural | access | 9 | on | 4 | gerado | tables/TABLE-audit_logs.md | trilha de auditoria imutável (sem UPDATE/DELETE); `actor_id`→sellers |
| carteira_transfers | suporte | leads | 13 | on | 4 | gerado | tables/TABLE-carteira_transfers.md | transferência de carteira (cliente/lead entre vendedores) |
| cash_flow_entries | suporte | finance | 11 | on | 4 | gerado | tables/TABLE-cash_flow_entries.md | lançamentos de fluxo de caixa |
| commissions | suporte | commercial | 31 | on | 4 | gerado | tables/TABLE-commissions.md | comissões (31 colunas — modelo rico) |
| conversation_notes | suporte | conversations | 9 | on | 4 | gerado | tables/TABLE-conversation_notes.md | nota interna dentro do chat; trigger de @menção |
| conversation_participants | estrutural | conversations | 4 | on | 2 | gerado | tables/TABLE-conversation_participants.md | junção conversa↔seller (co-responsáveis, multi-instância) |
| conversations | **nucleo** | conversations | 15 | on | 4 | enriquecido | tables/TABLE-conversations.md | núcleo de atendimento (in-degree 11); RLS via `can_access_conversation()` |
| customer_notes | suporte | crm | 5 | on | 4 | gerado | tables/TABLE-customer_notes.md | nota da ficha do cliente |
| customer_segments | suporte | crm | 8 | on | 4 | gerado | tables/TABLE-customer_segments.md | segmentos de cliente |
| customers | **nucleo** | crm | 33 | on | 4 | enriquecido | tables/TABLE-customers.md | núcleo CRM (in-degree 10); B2B/B2C (`type` MAIÚSCULO) |
| departments | suporte | access | 5 | on | 2 | gerado | tables/TABLE-departments.md | departamentos (PRD-211); scope `team` |
| distribution_traces | suporte | leads | 10 | on | 4 | gerado | tables/TABLE-distribution_traces.md | rastro de distribuição/rodízio (PRD-013/213) |
| expenses | suporte | finance | 19 | on | 4 | gerado | tables/TABLE-expenses.md | despesas (séries/recorrência) |
| goals | suporte | finance | 18 | on | 4 | gerado | tables/TABLE-goals.md | metas |
| integration_logs | estrutural | integrations | 11 | on | 1 | gerado | tables/TABLE-integration_logs.md | log de integrações (WhatsApp/Vault); leitura owner-only |
| leads | **nucleo** | leads | 18 | on | 4 | enriquecido | tables/TABLE-leads.md | núcleo de funil (in-degree 4); `seller_handles_lead` |
| media_assets | suporte | media | 25 | on | 4 | gerado | tables/TABLE-media_assets.md | gestão de mídia (PRD-026, "Vault") |
| message_templates | suporte | conversations | 20 | on | 4 | gerado | tables/TABLE-message_templates.md | templates HSM (PRD-116) |
| messages | **nucleo** | conversations | 19 | on | 4 | enriquecido | tables/TABLE-messages.md | mensagens do chat; RLS via `can_access_conversation()` |
| model_kit_items | estrutural | catalog | 6 | on | 4 | gerado | tables/TABLE-model_kit_items.md | junção kit↔peça |
| model_kits | suporte | catalog | 10 | on | 4 | gerado | tables/TABLE-model_kits.md | kits por modelo de veículo; verificar uso (Fase 3) |
| notification_preferences | suporte | notifications | 5 | on | 4 | gerado | tables/TABLE-notification_preferences.md | preferências por seller |
| notifications | suporte | notifications | 22 | on | 4 | gerado | tables/TABLE-notifications.md | central de notificações (derivadas via pg_cron) |
| order_items | suporte | commercial | 14 | on | 4 | gerado | tables/TABLE-order_items.md | itens do pedido (filho de orders) |
| orders | **nucleo** | commercial | 37 | on | 4 | enriquecido | tables/TABLE-orders.md | núcleo de pedidos (in-degree 3, 37 colunas) |
| parts | **nucleo** | catalog | 43 | on | 5 | enriquecido | tables/TABLE-parts.md | catálogo de peças (43 colunas); +1 policy anon (vitrine `active=true`) |
| processed_events | estrutural | integrations | 3 | on | 0 | gerado | tables/TABLE-processed_events.md | idempotência de webhook; **sem policy** (verificar acesso) |
| product_indicators | suporte | catalog | 16 | on | 4 | gerado | tables/TABLE-product_indicators.md | indicadores de produto; verificar uso (Fase 3) |
| profiles | estrutural | access | 7 | on | 2 | gerado | tables/TABLE-profiles.md | espelho de `auth.users`; select self/staff |
| quick_replies | suporte | media | 10 | on | 4 | gerado | tables/TABLE-quick_replies.md | respostas rápidas (PRD-027) |
| quote_items | suporte | commercial | 9 | on | 4 | gerado | tables/TABLE-quote_items.md | itens do orçamento (filho de quotes) |
| quotes | **nucleo** | commercial | 30 | on | 4 | enriquecido | tables/TABLE-quotes.md | núcleo de orçamentos (in-degree 2, 30 colunas) |
| rbac_resources | suporte | access | 4 | on | 2 | gerado | tables/TABLE-rbac_resources.md | catálogo de recursos RBAC (PRD-211); select aberto |
| recommendations | suporte | catalog | 12 | on | 4 | gerado | tables/TABLE-recommendations.md | recomendações; verificar uso (Fase 3) |
| role_permissions | suporte | access | 4 | on | 2 | gerado | tables/TABLE-role_permissions.md | matriz de permissões por papel (PRD-211) |
| roles | suporte | access | 10 | on | 2 | gerado | tables/TABLE-roles.md | papéis editáveis (PRD-211); `base_role`; in-degree 1 |
| rotation_participants | suporte | conversations | 8 | on | 2 | gerado | tables/TABLE-rotation_participants.md | participantes da fila de rodízio (PRD-213) |
| rotation_queues | suporte | conversations | 7 | on | 2 | gerado | tables/TABLE-rotation_queues.md | fila de rodízio por loja (PRD-213); in-degree 1 |
| scheduled_sends | suporte | media | 10 | on | 4 | gerado | tables/TABLE-scheduled_sends.md | agendamento de envio; `claim_due_scheduled_sends` |
| sdr_escalations | suporte | sdr | 19 | on | 4 | gerado | tables/TABLE-sdr_escalations.md | escalonamentos do SDR |
| sdr_sessions | suporte | sdr | 9 | on | 4 | gerado | tables/TABLE-sdr_sessions.md | sessões do SDR |
| sellers | **nucleo** | access | 25 | on | 4 | enriquecido | tables/TABLE-sellers.md | **núcleo gravitacional** (in-degree 35); horário/rodízio jsonb |
| stores | **nucleo** | platform | 9 | on | 2 | enriquecido | tables/TABLE-stores.md | **multi-loja** (in-degree 33); raiz do escopo de RLS |
| trackable_links | suporte | media | 12 | on | 4 | gerado | tables/TABLE-trackable_links.md | links rastreáveis (PRD-027) |
| vehicle_models | suporte | vehicles | 11 | on | 4 | gerado | tables/TABLE-vehicle_models.md | modelos de veículo; select aberto, write `is_staff` |
| vehicles | suporte | vehicles | 13 | on | 4 | gerado | tables/TABLE-vehicles.md | veículos do cliente (in-degree 2) |
| whatsapp_account_access_rules | suporte | conversations | 5 | on | 1 | gerado | tables/TABLE-whatsapp_account_access_rules.md | regras de acesso por número (multi-instância) |
| whatsapp_accounts | **nucleo** | conversations | 16 | on | 4 | enriquecido | tables/TABLE-whatsapp_accounts.md | contas/números WhatsApp (in-degree 4); failover |

**54 tabelas · Núcleo (10):** sellers, stores, conversations, customers, leads, orders, quotes, parts, messages, whatsapp_accounts.

---

## Materialized views — schema `public` (3)

| objeto | tier | domínio | status | ficha | observação |
|--------|------|---------|--------|-------|------------|
| mv_commissions_by_period | suporte | bi | gerado | tables/MATVIEW-mv_commissions_by_period.md | lida via RPC `mv_commissions_by_period_read()` (SD) |
| mv_executive_kpis | suporte | bi | gerado | tables/MATVIEW-mv_executive_kpis.md | lida via RPC `mv_executive_kpis_read()` (SD) |
| mv_sales_by_seller_month | suporte | bi | gerado | tables/MATVIEW-mv_sales_by_seller_month.md | lida via RPC `mv_sales_by_seller_month_read()` (SD); refresh pg_cron |

---

## Functions — schema `public` (35)

`SD` = SECURITY DEFINER. Helpers triviais de RLS serão agrupados numa única ficha
(`functions/CATALOG-db-functions.md`); RPCs/jobs/auth-hook substantivos ganham ficha própria.

| objeto | categoria | SD | retorno | status | ficha |
|--------|-----------|:--:|---------|--------|-------|
| custom_access_token_hook | auth_hook | não | jsonb | catalogado | functions/CATALOG-db-functions.md |
| current_app_role | rls_helper | não | text | catalogado | functions/CATALOG-db-functions.md |
| current_seller_id | rls_helper | não | uuid | catalogado | functions/CATALOG-db-functions.md |
| current_store_id | rls_helper | não | uuid | catalogado | functions/CATALOG-db-functions.md |
| is_staff | rls_helper | não | boolean | catalogado | functions/CATALOG-db-functions.md |
| can_access_conversation | rls_helper | sim | boolean | catalogado | functions/CATALOG-db-functions.md |
| is_conversation_participant | rls_helper | sim | boolean | catalogado | functions/CATALOG-db-functions.md |
| current_seller_accessible_account_ids | rls_helper | sim | setof uuid | catalogado | functions/CATALOG-db-functions.md |
| seller_handles_customer | rls_helper | sim | boolean | catalogado | functions/CATALOG-db-functions.md |
| seller_handles_lead | rls_helper | sim | boolean | catalogado | functions/CATALOG-db-functions.md |
| transfer_conversation | rpc | sim | setof conversations | catalogado | functions/CATALOG-db-functions.md |
| search_conversations | rpc | não | table | catalogado | functions/CATALOG-db-functions.md |
| last_inbound_at | rpc | não | timestamptz | catalogado | functions/CATALOG-db-functions.md |
| is_within_24h_window | rpc | não | boolean | catalogado | functions/CATALOG-db-functions.md |
| whatsapp_account_metrics | rpc | sim | jsonb | catalogado | functions/CATALOG-db-functions.md |
| whatsapp_delivery_health | rpc | sim | jsonb | catalogado | functions/CATALOG-db-functions.md |
| whatsapp_provider_health | rpc | sim | jsonb | catalogado | functions/CATALOG-db-functions.md |
| whatsapp_health_tick | cron | sim | void | catalogado | functions/CATALOG-db-functions.md |
| claim_due_scheduled_sends | rpc | não | setof scheduled_sends | catalogado | functions/CATALOG-db-functions.md |
| reconcile_derived_notifications | cron | sim | void | catalogado | functions/CATALOG-db-functions.md |
| storefront_config | rpc | sim | jsonb | catalogado | functions/CATALOG-db-functions.md |
| storefront_top_selling | rpc | sim | table | catalogado | functions/CATALOG-db-functions.md |
| mv_commissions_by_period_read | bi_rpc | sim | setof mv | catalogado | functions/CATALOG-db-functions.md |
| mv_executive_kpis_read | bi_rpc | sim | setof mv | catalogado | functions/CATALOG-db-functions.md |
| mv_sales_by_seller_month_read | bi_rpc | sim | setof mv | catalogado | functions/CATALOG-db-functions.md |
| integration_secret_get | rpc | sim | text | catalogado | functions/CATALOG-db-functions.md |
| integration_secret_set | rpc | sim | void | catalogado | functions/CATALOG-db-functions.md |
| integration_secrets_status | rpc | sim | jsonb | catalogado | functions/CATALOG-db-functions.md |
| seller_access_info | rpc | sim | table | catalogado | functions/CATALOG-db-functions.md |
| system_health_cron_jobs | rpc | sim | table | catalogado | functions/CATALOG-db-functions.md |
| system_health_db_stats | rpc | sim | jsonb | catalogado | functions/CATALOG-db-functions.md |
| health_ping | rpc | não | text | catalogado | functions/CATALOG-db-functions.md |
| notify_conversation_note_mentions | trigger_fn | sim | trigger | catalogado | functions/CATALOG-db-functions.md |
| notify_whatsapp_connection_change | trigger_fn | sim | trigger | catalogado | functions/CATALOG-db-functions.md |
| parts_set_oem_codes_text | trigger_fn | não | trigger | catalogado | functions/CATALOG-db-functions.md |

---

## Triggers — schema `public` (3)

| tabela | trigger | timing/evento | função | status |
|--------|---------|---------------|--------|--------|
| conversation_notes | conversation_notes_notify_mentions | AFTER INSERT | notify_conversation_note_mentions() | pendente (doc na ficha da tabela) |
| parts | parts_oem_codes_text_biu | BEFORE INSERT/UPDATE | parts_set_oem_codes_text() | pendente (doc na ficha da tabela) |
| whatsapp_accounts | whatsapp_accounts_notify_connection | AFTER UPDATE | notify_whatsapp_connection_change() | pendente (doc na ficha da tabela) |

---

## Edge Functions (repo `supabase/functions/`, 18)

| slug | implantada | verify_jwt | versão | status | ficha |
|------|:----------:|:----------:|-------:|--------|-------|
| whatsapp-webhook | sim | não (público) | 20 | catalogado | functions/CATALOG-edge-functions.md |
| whatsapp-send | sim | sim | 15 | catalogado | functions/CATALOG-edge-functions.md |
| whatsapp-connect | sim | sim | 10 | catalogado | functions/CATALOG-edge-functions.md |
| whatsapp-import-history | sim | sim | 6 | catalogado | functions/CATALOG-edge-functions.md |
| whatsapp-media-backfill | sim | não | 5 | catalogado | functions/CATALOG-edge-functions.md |
| whatsapp-avatar-sync | sim | sim | 6 | catalogado | functions/CATALOG-edge-functions.md |
| whatsapp-contacts-name-backfill | **não** | — | — | catalogado | functions/CATALOG-edge-functions.md |
| whatsapp-check-number | **não (deploy pendente)** | — | — | catalogado | functions/CATALOG-edge-functions.md |
| scheduled-send-worker | sim | não | 5 | catalogado | functions/CATALOG-edge-functions.md |
| ai-generate | sim | sim | 4 | catalogado | functions/CATALOG-edge-functions.md |
| integration-secrets | sim | sim | 8 | catalogado | functions/CATALOG-edge-functions.md |
| invite-seller | sim | sim | 12 | catalogado | functions/CATALOG-edge-functions.md |
| invite-seller-email | sim | sim | 13 | catalogado | functions/CATALOG-edge-functions.md |
| reset-seller-password | sim | sim | 12 | catalogado | functions/CATALOG-edge-functions.md |
| set-seller-role | sim | sim | 12 | catalogado | functions/CATALOG-edge-functions.md |
| set-seller-access | sim | sim | 12 | catalogado | functions/CATALOG-edge-functions.md |
| delete-seller | sim | sim | 4 | catalogado | functions/CATALOG-edge-functions.md |
| hello-trace | sim | sim | 10 | catalogado | functions/CATALOG-edge-functions.md |
| health | sim | não (público) | 9 | catalogado | functions/CATALOG-edge-functions.md |

> ❓ **Pendência (Fase 4):** `ai-generate` está implantada (v4) mas seu fonte não apareceu na
> árvore principal de `supabase/functions/` (origem em worktree `feat+ai-llm-real-integration`).
> Confirmar se o fonte foi mergeado na `main`. `list-models` citada na memória do projeto não
> aparece nem implantada nem na pasta — confirmar.

---

## Schemas de sistema (gerenciados pelo Supabase — `estrutural`, aceitos como estão)

Enumerados para fechar o contrato de completude; **não documentados em profundidade** (são do
Supabase/Postgres, não da aplicação). Re-enumerados na reconciliação final (Seção 12).

| schema | tabelas | papel |
|--------|--------:|-------|
| auth | 23 | Supabase Auth (users, sessions, identities, mfa, sso, oauth…) |
| storage | 8 | Supabase Storage (buckets, objects, multipart…) — `objects` tem 13 policies da app |
| realtime | 10 | Supabase Realtime (subscription, messages particionadas por dia) |
| cron | 2 | pg_cron (job, job_run_details) |
| net | 2 | pg_net (fila/resposta HTTP) |
| vault | 1 | Supabase Vault (secrets) — usado por `integration_secret_*` |
| supabase_migrations | 1 | histórico de migrations da CLI |

---

## Progresso (resumabilidade)

- [x] **Fase 0 — Enumeração + Manifesto** (2026-06-17): catálogo completo persistido acima.
- [x] **Fase 1 — Classificação em tiers** (2026-06-17): tier de cada objeto na coluna `tier`.
- [x] **Fase 2 — Esqueleto mecânico** (2026-06-17): 54 fichas de tabela + 3 de matview geradas por
      script (`_introspection/`); índice mestre (`MODELO-DADOS-gallo-base-diesel.md`), panorama de RLS
      (`RLS-PANORAMA.md`), ER por domínio (`ER-DOMINIOS.md`), catálogos de funções DB e Edge.
- [x] **Fase 3 — Enriquecimento de contexto** (2026-06-17): as 10 fichas de núcleo enriquecidas com
      marcador de origem (descrição, dicionário de colunas-chave, justificativa de RLS, narrativa de
      regras, perguntas cirúrgicas). Suporte/estrutural permanecem `gerado` (esqueleto). Achados e
      perguntas consolidados abaixo.
- [ ] **Fase 4 — Validação humana**: confirmar inferências, responder perguntas, confirmar suspeitas-mortas.
- [x] **Fase Final — Reconciliação** (2026-06-17): re-enumerado o banco vivo (57 objetos = 54 tabelas
      + 3 matviews) e cruzado com as fichas em disco — **0 objetos sem ficha, 0 fichas órfãs**.
      Completude provada (47 `gerado` + 10 `enriquecido` = 57). Script: `_introspection/`.

> **Gate aberto — Fase 4 (validação humana).** A completude mecânica está fechada. Falta o humano
> validar o contexto inferido das 10 fichas de núcleo (promover `🔍` → `✅`) e responder Q1–Q8
> (seção "Perguntas para o humano" abaixo). Só então o projeto migra para o **Modo Incremental**
> (governado pelo `PROTOCOLO-DOCUMENTACAO-BANCO.md`).

### Domínios (para índice hierárquico + ER por domínio)

`platform` · `access` · `crm` · `vehicles` · `leads` · `conversations` · `sdr` · `commercial` ·
`catalog` · `media` · `finance` · `notifications` · `ai` · `integrations` · `bi`


---

## Achados transversais (Fase 3) `🔍 inferido`

Padrões que apareceram em várias fichas durante o enriquecimento do núcleo:

1. **PK text → uuid (histórico).** As migrations de criação originais (POC) declaravam `id text`
   (seeds como `'store-matriz'`); a migration `20260608174030_convert_transactional_pks_to_uuid.sql`
   converteu as PKs transacionais para `uuid`. A introspecção (verdade do banco hoje) reporta `uuid` —
   as fichas estão corretas; o `text` aparece só nas migrations originais.
2. **CHECK ausente nos enums comerciais.** `orders`, `quotes`, `conversations` **não** têm CHECK
   constraints em `status`/`payment_status`/`channel` etc. — a validação é 100% na aplicação.
   Contrasta com `sellers`/`customers`, que têm CHECKs no banco.
3. **IDs `TEXT` sem FK uuid.** `conversations.lead_id`, `customers.converted_from_lead_id` e
   `quotes.converted_to_order_id` são `text` (não FK uuid) — provavelmente para tolerar IDs de
   origem externa (mock/DINTEC), mas sem integridade referencial.
4. **Cobertura parcial dos providers Supabase.** Algumas colunas existem no banco mas não são
   lidas/mapeadas pelo provider (ex.: `customers.avatar_url` está no SELECT mas não é mapeado em
   `rowToCustomerBase`; `provider_message_id`/`webhook_event_ids` em `messages` só são tocadas pelas
   Edges). Não é divergência de schema, mas de cobertura.

## Perguntas para o humano (Fase 4 — validação)

Cirúrgicas, levantadas no enriquecimento. Confirmar/responder para promover `🔍` → `✅`:

- **Q1 (avatar):** `customers.avatar_url` é selecionado no provider mas **não mapeado** em
  `rowToCustomerBase` ⇒ `avatarUrl` fica `undefined` em produção (Supabase). É bug ou intencional?
- **Q2 (enums sem CHECK):** a ausência de CHECK em `orders`/`quotes`/`conversations` é decisão
  consciente (flexibilidade) ou lacuna de integridade a corrigir?
- **Q3 (IDs text):** os campos `lead_id`/`converted_*` em `text` são permanentes (IDs cross-source)
  ou débito a migrar para `uuid` + FK?
- **Q4 (`processed_events`):** RLS habilitada e **zero policies** ⇒ acessível só por `service_role`
  (webhook). Confirmar que é intencional.
- **Q5 (suspeita de uso):** `model_kits`, `model_kit_items`, `recommendations`, `product_indicators`,
  `asset_combos` ainda são usadas na prática? (classificadas por nome/FK; confirmar.)
- **Q6 (`ai-generate`):** Edge implantada (v4) com fonte **fora** da árvore principal de
  `supabase/functions/`; `list-models` citada na memória mas ausente. Confirmar merge/estado.
- **Q7 (`stores.settings`):** JSONB monolítico (20+ subchaves de `IPlatformSettings`) — normalizar
  alguma subchave em tabela própria ou manter monolítico?
- **Q8 (`stores.id`):** confirmar que a conversão de PK para `uuid` cobriu `stores` (migration POC
  criava `id text`; introspecção reporta `uuid`).
