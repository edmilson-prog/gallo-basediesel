---
objeto: catalogo-funcoes-postgres
tipo: catalogo
schema: public
status: gerado
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# Catálogo de Functions do Postgres — `public` (35)

> Camada mecânica (assinatura, retorno, `SECURITY`, linguagem) = `[mecânico]` (introspecção de
> `pg_proc`). Propósito = `🔍 inferido (assinatura + nome + CLAUDE.md/PRD)` salvo onde marcado `❓`.
> As funções de trigger estão também documentadas na ficha da tabela que as dispara.

`SD` = `SECURITY DEFINER` (roda com os privilégios do dono, ignora RLS — usar com cuidado).

---

## Helpers de RLS (escopo do usuário logado)

Lêem claims do JWT e são chamados dentro das policies para não repetir lógica de escopo.

| função | SD | retorno | propósito |
|--------|:--:|---------|-----------|
| `current_store_id()` | não | uuid | Loja do usuário logado (claim do JWT). Base do isolamento multi-loja. `🔍` |
| `current_seller_id()` | não | uuid | Seller do usuário logado. `🔍` |
| `current_app_role()` | não | text | Papel base do JWT (`owner`/`manager`/…). `🔍` |
| `is_staff()` | não | boolean | Papel é staff (amplia escopo dentro da loja). `🔍` |
| `can_access_conversation(conv uuid)` | **sim** | boolean | Acesso a uma conversa/mensagens: atribuído, participante ou regra por número (multi-instância). Governa o RLS de `conversations`/`messages`. `🔍` |
| `is_conversation_participant(conv uuid)` | **sim** | boolean | Seller é participante co-responsável da conversa. `🔍` |
| `current_seller_accessible_account_ids()` | **sim** | setof uuid | Números WhatsApp acessíveis ao seller (atendente/papel/loja/participação). `🔍` |
| `seller_handles_customer(p_customer_id uuid)` | **sim** | boolean | Atendente lê cliente vinculado por conversa sem ter a carteira. `🔍` |
| `seller_handles_lead(p_lead_id uuid)` | **sim** | boolean | Idem para lead vinculado. `🔍` |

## Auth Hook

| função | SD | retorno | propósito |
|--------|:--:|---------|-----------|
| `custom_access_token_hook(event jsonb)` | não | jsonb | **Custom Access Token Hook** do Supabase Auth: injeta claims (papel/loja/seller, de `profiles`) no JWT a cada emissão de token. Fonte da verdade do RBAC no token. `🔍 (CLAUDE.md)` |

## RPCs de aplicação

| função | SD | retorno | propósito |
|--------|:--:|---------|-----------|
| `transfer_conversation(p_conversation_id uuid, p_to_seller_id uuid)` | **sim** | setof conversations | Transfere a conversa para outro seller (padrão RLS-handoff: UPDATE que tira a linha do próprio escopo exige SD). `🔍` |
| `search_conversations(…14 args…)` | não | table | Busca/listagem server-side da Inbox (filtros por loja/status/número/tags/datas; paginada). Multi-instância. `🔍` |
| `last_inbound_at(p_conversation_id uuid)` | não | timestamptz | Timestamp da última mensagem recebida (base da janela de 24h). `🔍 (PRD-117)` |
| `is_within_24h_window(p_conversation_id uuid)` | não | boolean | Se a conversa está dentro da janela de 24h do WhatsApp. `🔍 (PRD-117)` |
| `whatsapp_account_metrics(p_account_id uuid, p_days int)` | **sim** | jsonb | Métricas de uma conta/número WhatsApp num período. `🔍` |
| `whatsapp_delivery_health(p_hours int)` | **sim** | jsonb | Saúde de entrega de mensagens (owner, tela de saúde). `🔍 (PRD-118)` |
| `whatsapp_provider_health()` | **sim** | jsonb | Saúde de provedores e failover (owner, tela de saúde). `🔍 (PRD-120)` |
| `claim_due_scheduled_sends(p_limit int)` | não | setof scheduled_sends | Claim atômico dos envios agendados vencidos (usado pelo worker; dedupe via `dispatch_started_at`). `🔍` |
| `storefront_config(p_store_id uuid)` | **sim** | jsonb | Configuração pública da vitrine B2C de uma loja. `🔍` |
| `storefront_top_selling(p_store_id uuid, p_limit int)` | **sim** | table(part_id uuid) | Peças mais vendidas para a vitrine. `🔍` |
| `integration_secret_get(p_name text)` | **sim** | text | Lê um segredo do Supabase Vault (service_role). `🔍 (PRD Keyring)` |
| `integration_secret_set(p_name text, p_value text, p_description text)` | **sim** | void | Grava um segredo no Vault (write-only, auditado). `🔍` |
| `integration_secrets_status()` | **sim** | jsonb | Status (presença, sem expor valor) dos segredos cadastrados. `🔍` |
| `seller_access_info()` | **sim** | table(seller_id, role, last_sign_in_at) | Info de acesso por seller (último login) para a tela de usuários. `🔍` |
| `system_health_cron_jobs()` | **sim** | table | Estado dos jobs `pg_cron` (agenda, última execução). Tela de saúde. `🔍` |
| `system_health_db_stats()` | **sim** | jsonb | Estatísticas do banco para a tela de saúde. `🔍` |
| `health_ping()` | não | text | Healthcheck trivial do banco. `🔍` |
| `mv_commissions_by_period_read()` | **sim** | setof mv | Leitura scoped (por loja) da MV de comissões. `🔍` |
| `mv_executive_kpis_read()` | **sim** | setof mv | Leitura scoped da MV de KPIs executivos. `🔍` |
| `mv_sales_by_seller_month_read()` | **sim** | setof mv | Leitura scoped da MV de vendas por vendedor/mês. `🔍` |

## Jobs (pg_cron)

| função | SD | retorno | propósito |
|--------|:--:|---------|-----------|
| `whatsapp_health_tick()` | **sim** | void | Tick `*/5 min`: avalia saúde/failover dos provedores e emite notificações. `🔍 (PRD-120)` |
| `reconcile_derived_notifications()` | **sim** | void | Recompõe no servidor as notificações derivadas (ex.: metas, vencimentos). `🔍` |

## Funções de trigger

| função | SD | dispara em | propósito |
|--------|:--:|------------|-----------|
| `notify_conversation_note_mentions()` | **sim** | `conversation_notes` AFTER INSERT | Fan-out de @menção em nota da conversa → notificações in-app (`type='nota.mencao'`). `🔍` |
| `notify_whatsapp_connection_change()` | **sim** | `whatsapp_accounts` AFTER UPDATE | Notifica mudança de estado de conexão de um número. `🔍` |
| `parts_set_oem_codes_text()` | não | `parts` BEFORE INSERT/UPDATE | Deriva um campo textual de busca a partir de `oem_codes` (array). `🔍` |

---

## Perguntas pendentes / a aprofundar (Fase 3/4)

- ❓ Confirmar a lógica exata de `can_access_conversation` e `current_seller_accessible_account_ids` (multi-instância) lendo `pg_get_functiondef` — núcleo da segurança de atendimento.
- ❓ Confirmar os claims exatos injetados por `custom_access_token_hook` (chaves do JWT).
- ❓ `search_conversations`: a memória do projeto cita um bug pré-existente de overflow de URL no `.in()` em telas de analytics (não nesta RPC) — verificar se afeta filtros aqui.
