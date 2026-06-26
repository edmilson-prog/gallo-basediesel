# MODELO DE DADOS — GALLO BASE DIESEL

> Índice mestre **hierárquico** (índice-de-índices por domínio) do schema `public`.
> Gerado pelo bootstrap (`docs/integracoes/BOOTSTRAP-BANCO-EXISTENTE.md`).
> Banco: Supabase `njizaasajkdqptlxddqn` (produção) · atualizado em 2026-06-17.

## Como navegar

- **Ficha de tabela:** `tables/TABLE-<nome>.md` (o nome é o endereço).
- **Materialized view:** `tables/MATVIEW-<nome>.md`.
- **Funções (RPC/helper/trigger/cron):** `functions/CATALOG-db-functions.md`.
- **Edge Functions:** `functions/CATALOG-edge-functions.md`.
- **Segurança (RLS):** `RLS-PANORAMA.md`.
- **Diagramas:** `ER-DOMINIOS.md` (mapa de domínios + ER por domínio).
- **Contrato de completude / progresso:** `_MANIFESTO-BOOTSTRAP.md`.

## Domínios (15)

| domínio | objetos | núcleo |
|---------|--------:|--------|
| [Plataforma & Multi-loja](#platform) | 1 | `stores` |
| [Pessoas & Acesso (RBAC)](#access) | 7 | `sellers` |
| [CRM / Clientes](#crm) | 3 | `customers` |
| [Veículos](#vehicles) | 2 | — |
| [Leads & Carteira](#leads) | 3 | `leads` |
| [Atendimento / WhatsApp](#conversations) | 9 | `conversations`, `messages`, `whatsapp_accounts` |
| [SDR](#sdr) | 2 | — |
| [Comercial (pedidos/orçamentos)](#commercial) | 5 | `orders`, `quotes` |
| [Catálogo (peças/kits)](#catalog) | 5 | `parts` |
| [Mídia & Envio rápido](#media) | 8 | — |
| [Financeiro](#finance) | 3 | — |
| [Notificações](#notifications) | 2 | — |
| [Inteligência artificial](#ai) | 2 | — |
| [Integrações & Infra](#integrations) | 2 | — |
| [BI / Analytics](#bi) | 3 | — |

**Total:** 54 tabelas + 3 materialized views.

## Plataforma & Multi-loja
<a id="platform"></a>

| objeto | tier | propósito | PRD |
|--------|------|-----------|-----|
| [`stores`](tables/TABLE-stores.md) | **núcleo** | Loja/unidade da plataforma — raiz do escopo multi-loja. | PRD-004 |

## Pessoas & Acesso (RBAC)
<a id="access"></a>

| objeto | tier | propósito | PRD |
|--------|------|-----------|-----|
| [`sellers`](tables/TABLE-sellers.md) | **núcleo** | Membro da equipe (staff/externo/representante) — núcleo gravitacional. | PRD-101 |
| [`audit_logs`](tables/TABLE-audit_logs.md) | estrutural | Trilha de auditoria imutável de mutações. | PRD-006 |
| [`departments`](tables/TABLE-departments.md) | suporte | Departamentos: agrupamento de vendedores por loja. | PRD-211 |
| [`profiles`](tables/TABLE-profiles.md) | estrutural | Espelho de auth.users → papel/loja/seller (fonte do JWT). | PRD-107 |
| [`rbac_resources`](tables/TABLE-rbac_resources.md) | suporte | Catálogo de recursos protegíveis (RBAC). | PRD-211 |
| [`role_permissions`](tables/TABLE-role_permissions.md) | suporte | Matriz de permissões por papel. | PRD-211 |
| [`roles`](tables/TABLE-roles.md) | suporte | Papéis (RBAC) editáveis, com base_role. | PRD-211 |

## CRM / Clientes
<a id="crm"></a>

| objeto | tier | propósito | PRD |
|--------|------|-----------|-----|
| [`customers`](tables/TABLE-customers.md) | **núcleo** | Cliente B2B/B2C — núcleo do CRM. | PRD-008 |
| [`customer_notes`](tables/TABLE-customer_notes.md) | suporte | Notas da ficha do cliente. | PRD-008 |
| [`customer_segments`](tables/TABLE-customer_segments.md) | suporte | Segmentos de clientes. | PRD-009 |

## Veículos
<a id="vehicles"></a>

| objeto | tier | propósito | PRD |
|--------|------|-----------|-----|
| [`vehicle_models`](tables/TABLE-vehicle_models.md) | suporte | Modelos de veículo (catálogo compartilhado). | PRD-025 |
| [`vehicles`](tables/TABLE-vehicles.md) | suporte | Veículo de um cliente. | PRD-007 |

## Leads & Carteira
<a id="leads"></a>

| objeto | tier | propósito | PRD |
|--------|------|-----------|-----|
| [`leads`](tables/TABLE-leads.md) | **núcleo** | Lead do funil comercial. | PRD-010 |
| [`carteira_transfers`](tables/TABLE-carteira_transfers.md) | suporte | Transferências de carteira (cliente/lead) entre vendedores. | PRD-011 |
| [`distribution_traces`](tables/TABLE-distribution_traces.md) | suporte | Rastro da decisão de distribuição/rodízio de uma conversa. | PRD-013/213 |

## Atendimento / WhatsApp
<a id="conversations"></a>

| objeto | tier | propósito | PRD |
|--------|------|-----------|-----|
| [`conversations`](tables/TABLE-conversations.md) | **núcleo** | Conversa de atendimento (WhatsApp), por loja/cliente/número. | PRD-022 |
| [`messages`](tables/TABLE-messages.md) | **núcleo** | Mensagem de uma conversa (in/outbound). | PRD-022 |
| [`whatsapp_accounts`](tables/TABLE-whatsapp_accounts.md) | **núcleo** | Conta/número WhatsApp conectado (com failover). | PRD-111 |
| [`conversation_notes`](tables/TABLE-conversation_notes.md) | suporte | Notas internas fixadas numa conversa. | PRD-119 |
| [`conversation_participants`](tables/TABLE-conversation_participants.md) | estrutural | Junção conversa↔seller co-responsável (multi-instância). | Switchboard |
| [`message_templates`](tables/TABLE-message_templates.md) | suporte | Catálogo de templates HSM do WhatsApp. | PRD-116 |
| [`rotation_participants`](tables/TABLE-rotation_participants.md) | suporte | Participantes da fila de rodízio. | PRD-213 |
| [`rotation_queues`](tables/TABLE-rotation_queues.md) | suporte | Fila de rodízio de atendimento, uma por loja. | PRD-213 |
| [`whatsapp_account_access_rules`](tables/TABLE-whatsapp_account_access_rules.md) | suporte | Regras de acesso por número WhatsApp (multi-instância). | Switchboard |

## SDR
<a id="sdr"></a>

| objeto | tier | propósito | PRD |
|--------|------|-----------|-----|
| [`sdr_escalations`](tables/TABLE-sdr_escalations.md) | suporte | Escalonamentos do agente SDR para humano. | PRD-029 |
| [`sdr_sessions`](tables/TABLE-sdr_sessions.md) | suporte | Sessões do agente SDR. | PRD-029 |

## Comercial (pedidos/orçamentos)
<a id="commercial"></a>

| objeto | tier | propósito | PRD |
|--------|------|-----------|-----|
| [`orders`](tables/TABLE-orders.md) | **núcleo** | Pedido de venda. | PRD-015 |
| [`quotes`](tables/TABLE-quotes.md) | **núcleo** | Orçamento. | PRD-012 |
| [`commissions`](tables/TABLE-commissions.md) | suporte | Comissões de vendas por pedido/vendedor. | PRD-019 |
| [`order_items`](tables/TABLE-order_items.md) | suporte | Item de um pedido (filho de orders). | PRD-015 |
| [`quote_items`](tables/TABLE-quote_items.md) | suporte | Item de um orçamento (filho de quotes). | PRD-012 |

## Catálogo (peças/kits)
<a id="catalog"></a>

| objeto | tier | propósito | PRD |
|--------|------|-----------|-----|
| [`parts`](tables/TABLE-parts.md) | **núcleo** | Peça do catálogo (43 colunas). | PRD-014 |
| [`model_kit_items`](tables/TABLE-model_kit_items.md) | estrutural | Junção kit↔peça. | PRD-025 |
| [`model_kits`](tables/TABLE-model_kits.md) | suporte | Kits de peças por modelo de veículo. | PRD-025 |
| [`product_indicators`](tables/TABLE-product_indicators.md) | suporte | Indicadores/curva de produto por vendedor. | PRD-016 |
| [`recommendations`](tables/TABLE-recommendations.md) | suporte | Recomendações de produto/ação. | PRD-023 |

## Mídia & Envio rápido
<a id="media"></a>

| objeto | tier | propósito | PRD |
|--------|------|-----------|-----|
| [`asset_combos`](tables/TABLE-asset_combos.md) | suporte | Combos de ativos para envio rápido. | PRD-027 |
| [`asset_favorites`](tables/TABLE-asset_favorites.md) | estrutural | Junção seller↔ativo (favoritos da biblioteca). | PRD-027 |
| [`asset_library_items`](tables/TABLE-asset_library_items.md) | suporte | Biblioteca de ativos reutilizáveis. | PRD-027 |
| [`asset_send_log`](tables/TABLE-asset_send_log.md) | estrutural | Log de envios de ativos da biblioteca. | PRD-027 |
| [`media_assets`](tables/TABLE-media_assets.md) | suporte | Ativos de mídia (gestão central — Vault). | PRD-026 |
| [`quick_replies`](tables/TABLE-quick_replies.md) | suporte | Respostas rápidas de texto. | PRD-027 |
| [`scheduled_sends`](tables/TABLE-scheduled_sends.md) | suporte | Envios agendados de mensagem/mídia. | Chronicle |
| [`trackable_links`](tables/TABLE-trackable_links.md) | suporte | Links rastreáveis enviados ao cliente. | PRD-027 |

## Financeiro
<a id="finance"></a>

| objeto | tier | propósito | PRD |
|--------|------|-----------|-----|
| [`cash_flow_entries`](tables/TABLE-cash_flow_entries.md) | suporte | Lançamentos de fluxo de caixa. | PRD-021 |
| [`expenses`](tables/TABLE-expenses.md) | suporte | Despesas (com recorrência/série). | PRD-020 |
| [`goals`](tables/TABLE-goals.md) | suporte | Metas de vendas por vendedor/loja. | PRD-017 |

## Notificações
<a id="notifications"></a>

| objeto | tier | propósito | PRD |
|--------|------|-----------|-----|
| [`notification_preferences`](tables/TABLE-notification_preferences.md) | suporte | Preferências de notificação por vendedor. | PRD-024 |
| [`notifications`](tables/TABLE-notifications.md) | suporte | Central de notificações in-app (parte derivada via pg_cron). | PRD-024 |

## Inteligência artificial
<a id="ai"></a>

| objeto | tier | propósito | PRD |
|--------|------|-----------|-----|
| [`ai_settings`](tables/TABLE-ai_settings.md) | suporte | Configuração global de IA (singleton). Owner-only; chaves no Vault. | ai |
| [`ai_usage_events`](tables/TABLE-ai_usage_events.md) | estrutural | Log append-only de cada chamada real ao LLM. | ai |

## Integrações & Infra
<a id="integrations"></a>

| objeto | tier | propósito | PRD |
|--------|------|-----------|-----|
| [`integration_logs`](tables/TABLE-integration_logs.md) | estrutural | Auditoria de chamadas a provedores externos (WhatsApp/Vault). | PRD-112 |
| [`processed_events`](tables/TABLE-processed_events.md) | estrutural | Ledger de idempotência de webhook. | PRD-114 |

## BI / Analytics
<a id="bi"></a>

| objeto | tier | propósito | PRD |
|--------|------|-----------|-----|
| [`mv_commissions_by_period`](tables/MATVIEW-mv_commissions_by_period.md) | suporte | Comissões agregadas por loja/vendedor/período/status. | PRD-018 |
| [`mv_executive_kpis`](tables/MATVIEW-mv_executive_kpis.md) | suporte | KPIs executivos mensais por loja (pedidos, receita, clientes, ticket). | PRD-018 |
| [`mv_sales_by_seller_month`](tables/MATVIEW-mv_sales_by_seller_month.md) | suporte | Vendas mensais por vendedor (pedidos, receita, desconto, cancelados). | PRD-018 |
