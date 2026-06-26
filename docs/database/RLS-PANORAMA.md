# Panorama de RLS — GALLO BASE DIESEL

> Mapa consolidado de Row Level Security do schema `public` — a história de segurança do
> banco em um lugar. Regras = `[mecânico]` (introspecção de `pg_policies`). Gerado 2026-06-17.

## Helpers de escopo (SQL functions) `🔍 inferido (uso nas policies + CLAUDE.md)`

As policies não repetem lógica: delegam a funções helper. **Toda tabela de negócio é
isolada por loja**; staff e dono ampliam; conversas têm regra própria.

| helper | retorna | papel |
|--------|---------|-------|
| `current_store_id()` | uuid | loja do usuário logado (claim do JWT) — base do isolamento multi-loja |
| `current_seller_id()` | uuid | seller do usuário logado |
| `current_app_role()` | text | papel base do JWT (`owner`/`manager`/…) |
| `is_staff()` | boolean | papel é staff (amplia escopo dentro da loja) |
| `can_access_conversation(uuid)` | boolean | SD — acesso a conversa/mensagens (multi-instância: atribuído, participante, regras por número) |
| `seller_handles_customer/lead(uuid)` | boolean | SD — atendente lê cliente/lead vinculado por conversa sem ter a carteira |

## Padrão por tabela `[mecânico]`

Sinais: **store** (isolado por loja) · **seller** (dono/escopo próprio) · **staff** (staff amplia) ·
**conv** (`can_access_conversation`) · **handles** (`seller_handles_*`) · **owner?** (`current_app_role`) ·
**self** (`auth.uid`) · **OPEN** (leitura aberta a autenticados) · **anon-active** (leitura anônima de ativos).

### Plataforma & Multi-loja

| tabela | policies | SELECT | escrita (I/U/D) | notas |
|--------|---------:|--------|-----------------|-------|
| `stores` | 2 | store | staff, store | — |

### Pessoas & Acesso (RBAC)

| tabela | policies | SELECT | escrita (I/U/D) | notas |
|--------|---------:|--------|-----------------|-------|
| `audit_logs` | 4 | owner?, staff, store | DENY, store | delete bloqueado; update bloqueado |
| `departments` | 2 | OPEN, staff | staff | — |
| `profiles` | 2 | OPEN, self | — | — |
| `rbac_resources` | 2 | OPEN, owner? | owner? | — |
| `role_permissions` | 2 | OPEN, owner? | owner? | — |
| `roles` | 2 | OPEN, owner? | owner? | — |
| `sellers` | 4 | store | self, staff, store | — |

### CRM / Clientes

| tabela | policies | SELECT | escrita (I/U/D) | notas |
|--------|---------:|--------|-----------------|-------|
| `customer_notes` | 4 | store | store | — |
| `customer_segments` | 4 | seller, staff, store | seller, staff, store | — |
| `customers` | 4 | handles, seller, staff, store | seller, staff, store | — |

### Veículos

| tabela | policies | SELECT | escrita (I/U/D) | notas |
|--------|---------:|--------|-----------------|-------|
| `vehicle_models` | 4 | OPEN | staff | — |
| `vehicles` | 4 | store | store | — |

### Leads & Carteira

| tabela | policies | SELECT | escrita (I/U/D) | notas |
|--------|---------:|--------|-----------------|-------|
| `carteira_transfers` | 4 | staff, store | staff, store | — |
| `distribution_traces` | 4 | staff, store | staff, store | — |
| `leads` | 4 | handles, seller, staff, store | seller, staff, store | — |

### Atendimento / WhatsApp

| tabela | policies | SELECT | escrita (I/U/D) | notas |
|--------|---------:|--------|-----------------|-------|
| `conversation_notes` | 4 | store | seller, staff, store | — |
| `conversation_participants` | 2 | seller, staff | seller, staff | — |
| `conversations` | 4 | conv | conv, seller, staff, store | — |
| `message_templates` | 4 | store | staff, store | — |
| `messages` | 4 | conv | conv | — |
| `rotation_participants` | 2 | OPEN, staff | staff | — |
| `rotation_queues` | 2 | OPEN, staff | staff | — |
| `whatsapp_account_access_rules` | 1 | staff, store | staff, store | — |
| `whatsapp_accounts` | 4 | store | staff, store | — |

### SDR

| tabela | policies | SELECT | escrita (I/U/D) | notas |
|--------|---------:|--------|-----------------|-------|
| `sdr_escalations` | 4 | store | store | — |
| `sdr_sessions` | 4 | store | store | — |

### Comercial (pedidos/orçamentos)

| tabela | policies | SELECT | escrita (I/U/D) | notas |
|--------|---------:|--------|-----------------|-------|
| `commissions` | 4 | seller, staff, store | seller, staff, store | — |
| `order_items` | 4 | store | store | — |
| `orders` | 4 | seller, staff, store | seller, staff, store | — |
| `quote_items` | 4 | store | store | — |
| `quotes` | 4 | seller, staff, store | seller, staff, store | — |

### Catálogo (peças/kits)

| tabela | policies | SELECT | escrita (I/U/D) | notas |
|--------|---------:|--------|-----------------|-------|
| `model_kit_items` | 4 | store | store | — |
| `model_kits` | 4 | store | store | — |
| `parts` | 5 | anon-active, store | store | leitura anônima (vitrine) |
| `product_indicators` | 4 | seller, staff, store | seller, staff, store | — |
| `recommendations` | 4 | seller, staff, store | seller, staff, store | — |

### Mídia & Envio rápido

| tabela | policies | SELECT | escrita (I/U/D) | notas |
|--------|---------:|--------|-----------------|-------|
| `asset_combos` | 4 | seller, staff, store | seller, staff, store | — |
| `asset_favorites` | 4 | seller, staff, store | seller, staff, store | — |
| `asset_library_items` | 4 | store | store | — |
| `asset_send_log` | 4 | seller, staff, store | seller, staff, store | — |
| `media_assets` | 4 | seller, staff, store | seller, staff, store | — |
| `quick_replies` | 4 | seller, staff, store | seller, staff, store | — |
| `scheduled_sends` | 4 | store | store | — |
| `trackable_links` | 4 | store | store | — |

### Financeiro

| tabela | policies | SELECT | escrita (I/U/D) | notas |
|--------|---------:|--------|-----------------|-------|
| `cash_flow_entries` | 4 | staff, store | staff, store | — |
| `expenses` | 4 | staff, store | staff, store | — |
| `goals` | 4 | seller, staff, store | seller, staff, store | — |

### Notificações

| tabela | policies | SELECT | escrita (I/U/D) | notas |
|--------|---------:|--------|-----------------|-------|
| `notification_preferences` | 4 | seller, staff | seller, staff | — |
| `notifications` | 4 | seller, staff, store | seller, staff, store | — |

### Inteligência artificial

| tabela | policies | SELECT | escrita (I/U/D) | notas |
|--------|---------:|--------|-----------------|-------|
| `ai_settings` | 2 | owner? | owner? | — |
| `ai_usage_events` | 1 | owner? | — | — |

### Integrações & Infra

| tabela | policies | SELECT | escrita (I/U/D) | notas |
|--------|---------:|--------|-----------------|-------|
| `integration_logs` | 1 | owner? | — | — |
| `processed_events` | 0 | — | — | **sem policy** (só service_role) |

## Leituras de destaque `🔍 inferido`

- **Imutabilidade da auditoria:** `audit_logs` bloqueia UPDATE/DELETE (USING `false`) — só INSERT/SELECT.
- **Vitrine pública:** `parts` tem policy extra `parts_select_anon` (leitura anônima de `active = true`).
- **Owner-only:** `ai_settings`, `ai_usage_events`, `integration_logs` restritas via `current_app_role()`.
- **Conversas:** `conversations`/`messages` não usam store direto no SELECT — delegam a `can_access_conversation()` (multi-instância).
- **Leitura aberta a autenticados:** `roles`, `role_permissions`, `rbac_resources`, `departments`, `rotation_queues`, `rotation_participants`, `vehicle_models` (escrita restrita a staff/owner).
- **`processed_events`:** RLS habilitada e **sem policy** ⇒ acessível só por `service_role` (webhook). Confirmar intenção.
