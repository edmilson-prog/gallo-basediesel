# Diagramas ER por domínio — GALLO BASE DIESEL

> Mapa de domínios + ER por domínio (mermaid). Gerado de FKs reais (2026-06-17).
> Um único ER de 54 tabelas seria ilegível — o detalhe mora em cada domínio.

## Mapa de domínios

```mermaid
flowchart LR
  platform["Plataforma & Multi-loja"]
  access["Pessoas & Acesso (RBAC)"]
  crm["CRM / Clientes"]
  vehicles["Veículos"]
  leads["Leads & Carteira"]
  conversations["Atendimento / WhatsApp"]
  sdr["SDR"]
  commercial["Comercial (pedidos/orçamentos)"]
  catalog["Catálogo (peças/kits)"]
  media["Mídia & Envio rápido"]
  finance["Financeiro"]
  notifications["Notificações"]
  ai["Inteligência artificial"]
  integrations["Integrações & Infra"]
  bi["BI / Analytics"]
  media --> platform
  conversations --> access
  access --> platform
  leads --> access
  commercial --> access
  conversations --> platform
  media --> access
  crm --> access
  media --> conversations
  catalog --> platform
  leads --> platform
  finance --> access
  finance --> platform
  commercial --> platform
  leads --> crm
  commercial --> catalog
  commercial --> conversations
  commercial --> crm
  catalog --> access
  sdr --> access
  sdr --> conversations
  ai --> platform
  conversations --> crm
  crm --> platform
  leads --> conversations
  media --> crm
  media --> commercial
  media --> catalog
  media --> vehicles
  catalog --> vehicles
  notifications --> platform
  commercial --> vehicles
  commercial --> leads
  catalog --> crm
  sdr --> crm
  sdr --> leads
  sdr --> platform
  platform --> access
  media --> leads
  vehicles --> crm
```

_Seta A → B = alguma tabela do domínio A referencia (FK) uma do domínio B._

## Plataforma & Multi-loja

```mermaid
flowchart TD
  stores["stores"]
  sellers["sellers ⟨access⟩"]
  stores -->|manager_id| sellers
```

## Pessoas & Acesso (RBAC)

```mermaid
flowchart TD
  audit_logs["audit_logs"]
  departments["departments"]
  profiles["profiles"]
  rbac_resources["rbac_resources"]
  role_permissions["role_permissions"]
  roles["roles"]
  sellers["sellers"]
  audit_logs -->|actor_id| sellers
  stores["stores ⟨platform⟩"]
  audit_logs -->|store_id| stores
  departments -->|manager_id| sellers
  stores["stores ⟨platform⟩"]
  departments -->|store_id| stores
  profiles -->|seller_id| sellers
  stores["stores ⟨platform⟩"]
  profiles -->|store_id| stores
  role_permissions -->|role_id| roles
  stores["stores ⟨platform⟩"]
  roles -->|store_id| stores
  sellers -->|department_id| departments
  sellers -->|parent_seller_id| sellers
  stores["stores ⟨platform⟩"]
  sellers -->|store_id| stores
```

## CRM / Clientes

```mermaid
flowchart TD
  customer_notes["customer_notes"]
  customer_segments["customer_segments"]
  customers["customers"]
  sellers["sellers ⟨access⟩"]
  customer_notes -->|author_id| sellers
  customer_notes -->|customer_id| customers
  sellers["sellers ⟨access⟩"]
  customer_segments -->|owner_id| sellers
  sellers["sellers ⟨access⟩"]
  customers -->|converted_by_seller_id| sellers
  sellers["sellers ⟨access⟩"]
  customers -->|seller_id| sellers
  stores["stores ⟨platform⟩"]
  customers -->|store_id| stores
```

## Veículos

```mermaid
flowchart TD
  vehicle_models["vehicle_models"]
  vehicles["vehicles"]
  customers["customers ⟨crm⟩"]
  vehicles -->|customer_id| customers
```

## Leads & Carteira

```mermaid
flowchart TD
  carteira_transfers["carteira_transfers"]
  distribution_traces["distribution_traces"]
  leads["leads"]
  sellers["sellers ⟨access⟩"]
  carteira_transfers -->|created_by| sellers
  sellers["sellers ⟨access⟩"]
  carteira_transfers -->|from_seller_id| sellers
  stores["stores ⟨platform⟩"]
  carteira_transfers -->|store_id| stores
  sellers["sellers ⟨access⟩"]
  carteira_transfers -->|to_seller_id| sellers
  conversations["conversations ⟨conversations⟩"]
  distribution_traces -->|conversation_id| conversations
  customers["customers ⟨crm⟩"]
  distribution_traces -->|customer_id| customers
  distribution_traces -->|lead_id| leads
  sellers["sellers ⟨access⟩"]
  distribution_traces -->|selected_seller_id| sellers
  stores["stores ⟨platform⟩"]
  distribution_traces -->|store_id| stores
  customers["customers ⟨crm⟩"]
  leads -->|converted_to_customer_id| customers
  sellers["sellers ⟨access⟩"]
  leads -->|seller_id| sellers
  stores["stores ⟨platform⟩"]
  leads -->|store_id| stores
```

## Atendimento / WhatsApp

```mermaid
flowchart TD
  conversation_notes["conversation_notes"]
  conversation_participants["conversation_participants"]
  conversations["conversations"]
  message_templates["message_templates"]
  messages["messages"]
  rotation_participants["rotation_participants"]
  rotation_queues["rotation_queues"]
  whatsapp_account_access_rules["whatsapp_account_access_rules"]
  whatsapp_accounts["whatsapp_accounts"]
  sellers["sellers ⟨access⟩"]
  conversation_notes -->|author_id| sellers
  conversation_notes -->|conversation_id| conversations
  stores["stores ⟨platform⟩"]
  conversation_notes -->|store_id| stores
  sellers["sellers ⟨access⟩"]
  conversation_participants -->|added_by| sellers
  conversation_participants -->|conversation_id| conversations
  sellers["sellers ⟨access⟩"]
  conversation_participants -->|seller_id| sellers
  sellers["sellers ⟨access⟩"]
  conversations -->|assigned_seller_id| sellers
  customers["customers ⟨crm⟩"]
  conversations -->|customer_id| customers
  stores["stores ⟨platform⟩"]
  conversations -->|store_id| stores
  conversations -->|whatsapp_account_id| whatsapp_accounts
  sellers["sellers ⟨access⟩"]
  message_templates -->|created_by| sellers
  stores["stores ⟨platform⟩"]
  message_templates -->|store_id| stores
  message_templates -->|whatsapp_account_id| whatsapp_accounts
  messages -->|conversation_id| conversations
  rotation_participants -->|queue_id| rotation_queues
  departments["departments ⟨access⟩"]
  rotation_participants -->|scope_department_id| departments
  stores["stores ⟨platform⟩"]
  rotation_queues -->|store_id| stores
  whatsapp_account_access_rules -->|whatsapp_account_id| whatsapp_accounts
  whatsapp_accounts -->|failover_account_id| whatsapp_accounts
  stores["stores ⟨platform⟩"]
  whatsapp_accounts -->|store_id| stores
```

## SDR

```mermaid
flowchart TD
  sdr_escalations["sdr_escalations"]
  sdr_sessions["sdr_sessions"]
  sellers["sellers ⟨access⟩"]
  sdr_escalations -->|assigned_seller_id| sellers
  conversations["conversations ⟨conversations⟩"]
  sdr_escalations -->|conversation_id| conversations
  customers["customers ⟨crm⟩"]
  sdr_escalations -->|customer_id| customers
  leads["leads ⟨leads⟩"]
  sdr_escalations -->|lead_id| leads
  stores["stores ⟨platform⟩"]
  sdr_escalations -->|store_id| stores
  sellers["sellers ⟨access⟩"]
  sdr_escalations -->|urgent_broadcast_claimed_by_seller_id| sellers
  conversations["conversations ⟨conversations⟩"]
  sdr_sessions -->|conversation_id| conversations
```

## Comercial (pedidos/orçamentos)

```mermaid
flowchart TD
  commissions["commissions"]
  order_items["order_items"]
  orders["orders"]
  quote_items["quote_items"]
  quotes["quotes"]
  commissions -->|order_id| orders
  sellers["sellers ⟨access⟩"]
  commissions -->|seller_id| sellers
  stores["stores ⟨platform⟩"]
  commissions -->|store_id| stores
  vehicles["vehicles ⟨vehicles⟩"]
  order_items -->|applied_to_vehicle_id| vehicles
  order_items -->|order_id| orders
  parts["parts ⟨catalog⟩"]
  order_items -->|part_id| parts
  sellers["sellers ⟨access⟩"]
  orders -->|canceled_by| sellers
  conversations["conversations ⟨conversations⟩"]
  orders -->|conversation_id| conversations
  customers["customers ⟨crm⟩"]
  orders -->|customer_id| customers
  orders -->|quote_id| quotes
  sellers["sellers ⟨access⟩"]
  orders -->|seller_id| sellers
  stores["stores ⟨platform⟩"]
  orders -->|store_id| stores
  parts["parts ⟨catalog⟩"]
  quote_items -->|part_id| parts
  quote_items -->|quote_id| quotes
  sellers["sellers ⟨access⟩"]
  quotes -->|approved_by| sellers
  conversations["conversations ⟨conversations⟩"]
  quotes -->|conversation_id| conversations
  customers["customers ⟨crm⟩"]
  quotes -->|customer_id| customers
  leads["leads ⟨leads⟩"]
  quotes -->|lead_id| leads
  sellers["sellers ⟨access⟩"]
  quotes -->|seller_id| sellers
  stores["stores ⟨platform⟩"]
  quotes -->|store_id| stores
```

## Catálogo (peças/kits)

```mermaid
flowchart TD
  model_kit_items["model_kit_items"]
  model_kits["model_kits"]
  parts["parts"]
  product_indicators["product_indicators"]
  recommendations["recommendations"]
  model_kit_items -->|kit_id| model_kits
  model_kit_items -->|part_id| parts
  vehicle_models["vehicle_models ⟨vehicles⟩"]
  model_kits -->|model_id| vehicle_models
  stores["stores ⟨platform⟩"]
  model_kits -->|store_id| stores
  stores["stores ⟨platform⟩"]
  parts -->|store_id| stores
  sellers["sellers ⟨access⟩"]
  product_indicators -->|seller_id| sellers
  stores["stores ⟨platform⟩"]
  product_indicators -->|store_id| stores
  sellers["sellers ⟨access⟩"]
  recommendations -->|seller_id| sellers
  stores["stores ⟨platform⟩"]
  recommendations -->|store_id| stores
  customers["customers ⟨crm⟩"]
  recommendations -->|subject_id| customers
```

## Mídia & Envio rápido

```mermaid
flowchart TD
  asset_combos["asset_combos"]
  asset_favorites["asset_favorites"]
  asset_library_items["asset_library_items"]
  asset_send_log["asset_send_log"]
  media_assets["media_assets"]
  quick_replies["quick_replies"]
  scheduled_sends["scheduled_sends"]
  trackable_links["trackable_links"]
  sellers["sellers ⟨access⟩"]
  asset_combos -->|owner_id| sellers
  stores["stores ⟨platform⟩"]
  asset_combos -->|store_id| stores
  asset_favorites -->|asset_id| asset_library_items
  sellers["sellers ⟨access⟩"]
  asset_favorites -->|seller_id| sellers
  stores["stores ⟨platform⟩"]
  asset_library_items -->|store_id| stores
  asset_send_log -->|asset_id| asset_library_items
  sellers["sellers ⟨access⟩"]
  asset_send_log -->|seller_id| sellers
  conversations["conversations ⟨conversations⟩"]
  media_assets -->|conversation_id| conversations
  customers["customers ⟨crm⟩"]
  media_assets -->|customer_id| customers
  orders["orders ⟨commercial⟩"]
  media_assets -->|linked_order_id| orders
  parts["parts ⟨catalog⟩"]
  media_assets -->|linked_part_id| parts
  vehicles["vehicles ⟨vehicles⟩"]
  media_assets -->|linked_vehicle_id| vehicles
  messages["messages ⟨conversations⟩"]
  media_assets -->|message_id| messages
  stores["stores ⟨platform⟩"]
  media_assets -->|store_id| stores
  sellers["sellers ⟨access⟩"]
  quick_replies -->|owner_id| sellers
  stores["stores ⟨platform⟩"]
  quick_replies -->|store_id| stores
  conversations["conversations ⟨conversations⟩"]
  scheduled_sends -->|conversation_id| conversations
  stores["stores ⟨platform⟩"]
  scheduled_sends -->|store_id| stores
  conversations["conversations ⟨conversations⟩"]
  trackable_links -->|conversation_id| conversations
  leads["leads ⟨leads⟩"]
  trackable_links -->|lead_id| leads
  stores["stores ⟨platform⟩"]
  trackable_links -->|store_id| stores
```

## Financeiro

```mermaid
flowchart TD
  cash_flow_entries["cash_flow_entries"]
  expenses["expenses"]
  goals["goals"]
  sellers["sellers ⟨access⟩"]
  cash_flow_entries -->|created_by| sellers
  stores["stores ⟨platform⟩"]
  cash_flow_entries -->|store_id| stores
  expenses -->|recurrence_parent_id| expenses
  stores["stores ⟨platform⟩"]
  expenses -->|store_id| stores
  sellers["sellers ⟨access⟩"]
  goals -->|created_by| sellers
  sellers["sellers ⟨access⟩"]
  goals -->|seller_id| sellers
  stores["stores ⟨platform⟩"]
  goals -->|store_id| stores
```

## Notificações

```mermaid
flowchart TD
  notification_preferences["notification_preferences"]
  notifications["notifications"]
  stores["stores ⟨platform⟩"]
  notifications -->|store_id| stores
```

## Inteligência artificial

```mermaid
flowchart TD
  ai_settings["ai_settings"]
  ai_usage_events["ai_usage_events"]
  stores["stores ⟨platform⟩"]
  ai_usage_events -->|store_id| stores
```

## Integrações & Infra

```mermaid
flowchart TD
  integration_logs["integration_logs"]
  processed_events["processed_events"]
```
