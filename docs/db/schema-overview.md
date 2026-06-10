# Schema Overview — GALLO BASE DIESEL (Fase 2)

> Atualizado em 2026-06-09 · 40 tabelas no schema `public`, todas com RLS habilitada.
> Fonte da verdade do que está aplicado: histórico remoto, espelhado em `supabase/migrations/`.
> Desenho de RLS: `docs/db/rls-policies-fase2-mvp.md` · Smoke de cutover: `docs/db/cutover-smoke-checklist.md`.

## Decisões estruturais (divergências conscientes dos PRDs 100/101)

| PRD previa | Implementado | Por quê |
| --- | --- | --- |
| Schemas `crm` + `storefront` | Schema único `public` | PostgREST/MCP/CLI operam por default em `public`; separação lógica não compensou o atrito no MVP single-tenant |
| Projetos staging + prod | Projeto único (`njizaasajkdqptlxddqn`) + Preview da Vercel | Custo/escala do MVP; Preview cumpre o papel de staging do frontend |
| PKs preservando ids do mock (`text`) | **`uuid` em todos os 36 PKs + 98 FKs** | Banco greenfield; mocks são seed descartável (migrations `convert_*_pks_to_uuid`) |
| Migrations versionadas desde o início | Aplicadas via MCP, **exportadas para o Git em 2026-06-09** | Velocidade do cutover; ver `supabase/migrations/README.md` |

Padrões transversais: colunas **snake_case** (providers mapeiam para os tipos camelCase `I*`);
objetos aninhados grandes como **jsonb** (`stores.settings`, `purchase_stats`, `stage`, …);
colunas de ator/polimórficas são `text` sem FK (aceitam sentinelas como `"system"`).

## Identidade e RLS

- `profiles` liga `auth.users` → (role, store_id, seller_id). O **Custom Access Token Hook**
  (`public.custom_access_token_hook`, HABILITADO) injeta esses campos em `app_metadata` no JWT.
- Helpers `current_store_id()` / `current_seller_id()` / `current_app_role()` / `is_staff()`
  leem **apenas o JWT** (fail-closed sem claims), sempre embrulhados em `(select …)` nas policies.
- Modelo: staff (owner/manager/financeiro) = store-wide; vendedor = carteira própria + pool de
  conversas não atribuídas; `anon` = apenas catálogo ativo do storefront (grant de coluna em `parts`).
- Store sentinela da Matriz: `00000000-0000-0000-0000-000000000001` (idêntica no mock e no DB).

## Tabelas por domínio (40)

### Plataforma e identidade
| Tabela | Tipo de dado | Escopo RLS |
| --- | --- | --- |
| `stores` | Lojas (IStore; `settings` jsonb carrega config da plataforma) | própria loja; sem INSERT/DELETE no client |
| `profiles` | auth.users → role/store/seller (fonte das claims do JWT) | self-select + staff da loja |
| `sellers` | Equipe de vendas (ISeller) | loja; escrita staff + self-update |
| `whatsapp_accounts` | Contas WhatsApp da loja (mock até PRD-111+) | loja |

### CRM
| Tabela | Tipo de dado | Escopo RLS |
| --- | --- | --- |
| `customers` | Clientes B2B/B2C (união discriminada em colunas nullable) | per-seller (staff vê loja) |
| `customer_notes` | Notas (FK `author_id` → sellers) | herda de customers |
| `customer_segments` | Segmentos salvos por vendedor | dono (+staff) |
| `vehicles` | Frota do cliente (`service_history` jsonb) | herda de customers |
| `vehicle_models` | Catálogo canônico de modelos (referência global) | leitura global; escrita staff |
| `leads` | Pipeline (`stage` jsonb) | per-seller |
| `carteira_transfers` | Transferências de carteira | staff-only |

### Atendimento
| Tabela | Tipo de dado | Escopo RLS |
| --- | --- | --- |
| `conversations` | Conversas multicanal (`assigned_seller_id` null = pool) | per-seller + pool reivindicável |
| `messages` | Mensagens | herda de conversations |
| `sdr_sessions` / `sdr_escalations` | Simulação SDR e escalonamentos | herda / loja |
| `distribution_traces` | Auditoria do roteamento (PRD-013) | staff-only |

### Comercial
| Tabela | Tipo de dado | Escopo RLS |
| --- | --- | --- |
| `parts` | Catálogo de peças (43 colunas; `oem_codes_text` mantido por trigger) | loja + leitura `anon` de colunas públicas (ativas) |
| `quotes` / `quote_items` | Orçamentos (snapshot de preço em jsonb) | per-seller / herda |
| `orders` / `order_items` | Pedidos (37 colunas; snapshot) | per-seller / herda |
| `commissions` | Comissões calculadas | per-seller |
| `model_kits` / `model_kit_items` | Kits por modelo de veículo | loja / herda |
| `product_indicators` | Indicadores de produto por vendedor | per-seller |
| `recommendations` | Recomendações (copiloto) | per-seller |

### Financeiro e gestão
| Tabela | Tipo de dado | Escopo RLS |
| --- | --- | --- |
| `expenses` | Despesas (DRE) | **staff-only** |
| `cash_flow_entries` | Fluxo de caixa | **staff-only** |
| `goals` | Metas | per-seller (staff vê loja) |
| `audit_logs` | Trilha de auditoria — **imutável** (UPDATE/DELETE `using(false)`) | staff+financeiro |

### Mídia e envio rápido (PRD-026/027)
| Tabela | Tipo de dado | Escopo RLS |
| --- | --- | --- |
| `media_assets` | Metadata de mídia (bytes → Storage, PRD-106) | own+pool (escrita #48) |
| `asset_library_items` / `asset_combos` | Biblioteca de ativos / combos | loja / dono+shared |
| `asset_favorites` / `asset_send_log` | Favoritos e ledger de envio | dono |
| `quick_replies` | Respostas rápidas (`shared` visível à loja) | dono+shared |
| `trackable_links` / `scheduled_sends` | Links rastreáveis / envios agendados | loja / dono |

### Notificações
| Tabela | Tipo de dado | Escopo RLS |
| --- | --- | --- |
| `notifications` | Notificações (derivadas recompostas server-side por `pg_cron`, issue #44) | destinatário (+staff) |
| `notification_preferences` | Matriz de preferências | destinatário (+staff) |

## Funções e jobs

- `custom_access_token_hook(event)` — claims do JWT (auth admin only).
- `storefront_config(uuid)` / RPC top-selling — superfície anon do storefront (SECURITY DEFINER, somente `settings->'storefront'`).
- `reconcile_derived_notifications()` — SECURITY DEFINER, EXECUTE revogado; agendada por `pg_cron` (`* * * * *`).
- Extensões instaladas: `pg_cron`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault` (+ `pg_trgm` no PRD-108).

## Como evoluir o schema

1. Aplicar migration via MCP `apply_migration` (nome descritivo em snake_case).
2. Exportar o SQL aplicado para `supabase/migrations/<version>_<name>.sql` no mesmo PR.
3. Regenerar `src/types/supabase.generated.ts`.
4. Rodar a suíte `supabase/tests/rls-regression.sql` (CI: `.github/workflows/rls-tests.yml`).
5. Atualizar este documento se o domínio mudar.
