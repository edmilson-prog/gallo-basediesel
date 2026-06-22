# ROADMAP — Gestão Multi-loja (Fase 2)

> **Status:** 🔄 Em execução · **Criado:** 2026-06-19 · **Autor:** AILA Sistemas Inteligentes
> **Origem:** PRD-007 (Bloco 0 — Fundação, `_DONE`) deferiu toda a *operação* multi-loja para a "Fase 2". Este roadmap detalha e sequencia essa Fase 2.
> **Gatilho:** o dono vai **cadastrar uma filial/unidade real**. A tela `/app/configuracoes/lojas` é hoje *read-only* ("gestão na Fase 2").

⚠️ **Desambiguação:** "Fase 2" aqui é a **gestão multi-loja** (criar filiais, transferir entre lojas, consolidar BI). **NÃO** confundir com a "Fase 2 (Mock → Supabase)" do projeto, que já foi concluída e está em go-live.

---

## 1. Contexto e descoberta-eixo

Um mapeamento exaustivo (código + banco de produção, 5 leitores paralelos) revelou o ponto central:

> **O gargalo não é a UI — é a fronteira `current_store_id()` no JWT.**

- **Frontend já está pronto para multi-loja:** `MultistoreProvider`, `StoreSwitcher`, `StoreBadge`, `useCurrentStore`/`useAccessibleStores`/`useStoreById`, `withStoreScope`, e o scope `all` do Owner no RBAC. Tudo modelado no PRD-007.
- **Backend é estritamente single-store:** o JWT carrega **um** `store_id` escalar (`current_store_id() = auth.jwt()->'app_metadata'->>'store_id'`). As ~33 tabelas comerciais e todos os helpers RLS comparam `store_id = current_store_id()`. Não há leitura cross-store **nem para o Owner**.
- **`stores` não tem policy de INSERT nem DELETE** — lojas só nascem hoje via migration. `stores_update` é restrito a `id = current_store_id()` (o Owner só edita a própria loja).
- **`sellers` não tem `accessible_store_ids`** — a coluna existe só no tipo `ISeller`; em produção o `SupabaseAuthProvider` popula `accessibleStoreIds = [store_id]` (lista de 1).
- **As matviews de BI já agrupam por `store_id`** (`mv_executive_kpis`, `mv_sales_by_seller_month`, `mv_commissions_by_period`), mas os RPCs `*_read` hard-scopam a `current_store_id()`.
- **"Todas as lojas" nos dashboards é fachada:** a UI tem o filtro, mas o dado colapsa para uma única loja.

**Estado de produção (confirmado por SELECT):** 1 loja (matriz `00000000-…-0001`, CNPJ `32.990.725/0001-60`), 7 vendedores, ~807 clientes — **tudo na matriz** (`distinct store = 1`).

A UI "promete" multi-loja que o banco não entrega. O roadmap ataca o **banco**, na ordem de menor risco.

---

## 2. Decisão arquitetural transversal

**O JWT mantém o `store_id` escalar. Toda operação cross-store é feita via RPC `SECURITY DEFINER` Owner-only.**

Consequência: os blocos **A, B1 e C não tocam** nas ~33 policies operacionais nem no `custom_access_token_hook` (fronteira de login). Apenas o **B2 (vendedor multi-loja)** exige reescrever o claim para array (`accessible_store_ids` no JWT + `current_store_id()` → pertencimento), por isso é o último e o de maior risco.

Alternativa descartada (por ora): colocar o array no JWT desde já e reescrever todas as policies para `store_id = ANY(...)`. Blast-radius altíssimo sobre produção viva — adiado para B2, atrás de flag.

---

## 3. Sub-projetos

Ordem de execução aprovada: **A → B1 → C → B2.**

### Bloco A — CRUD de Lojas 🟢 (fundação, baixo risco)

**Objetivo:** Owner cria/edita/desativa filiais e parceiras pela UI, com segurança real no banco.

**Entregas:**
- **DB:** coluna `stores.is_active boolean NOT NULL DEFAULT true` (soft-delete; **nunca** hard delete — 33 FKs). Escrita via **RPC `SECURITY DEFINER` Owner-only** (`create_store`/`update_store`/`set_store_active`) gated por `current_app_role() = 'owner'` (**não** `is_staff()`, que inclui Gestor). Migration espelhada em `supabase/migrations/`.
- **Provider:** estender `IStoresProvider` com `create`/`update`/`setActive`; impl mock + supabase (espelhar template de `customers.ts`). `buildDefaultSettings(storeId)` extraído de `seedStore.ts` para gerar o blob `settings` jsonb de uma filial nova.
- **UI:** `StoresPage` deixa de ser read-only → listagem gerenciável + `StoreFormSheet` (copiar `SellerFormDialog`: Sheet + RHF + zod + `useMutation` + `invalidateQueries`). Gate `<Can resource="store" action="create|edit|delete">`. `MultistoreProvider` ganha refresh do roster após mutação (hoje só carrega no mount).
- **Guardas:** nunca desativar a matriz nem a última loja ativa (auto-lockout). Estados vazios reforçados ("esta loja ainda não tem clientes") + comunicação ao trocar de loja.

**Decisão pendente (catálogo):** `parts` é store-scoped (351 peças só na matriz) → filial nasceria com catálogo vazio. **Recomendação:** tornar `parts` catálogo **compartilhado/global** (como `vehicle_models` já é). A definir no design do Bloco A.

**Risco:** baixo (aditivo). Validar `rls-regression.sql`; smoke do dono.

### Bloco B1 — Transferência de cliente/lead cross-store 🔴 (alto risco)

**Objetivo:** mover um cliente/lead da matriz para a filial (e vice-versa).

**Entregas:**
- **DB:** RPC `SECURITY DEFINER transfer_customer_store(customer_id, target_store_id)` e análogo para leads — muda `store_id` do registro **e dos filhos coesos** em **cascata transacional**, auditado (espelha `transfer_conversation`, mas cruzando a fronteira de loja). Trilha em `carteira_transfers`/`audit_logs`.
- **Regra de migração:** migrar **cliente + veículos + conversas abertas**; **não** migrar pedidos/comissões já fechados (histórico imutável — preserva BI e comissões retroativas).
- **UI:** ação "Mover para outra loja" na ficha do cliente/lead e em massa (referência visual: `TransferSellerModal`), com confirmação + auditoria.

**Risco:** alto (muda dados reais; cascata). Sem UPDATE direto de `store_id` jamais — só via RPC. Dry-run + backup antes de operação em massa.

### Bloco C — Consolidação cross-store (BI) 🟡 (risco médio)

**Objetivo:** Owner vê dados agregados **por loja** e **consolidados**.

**Entregas:**
- **DB:** RPCs `SECURITY DEFINER` Owner-only `mv_*_all_read` que retornam todas as lojas (por `store_id` + total), reaproveitando as matviews que **já agrupam por `store_id`**. `stores_select` libera o Owner a ver todas as lojas (popular filtros/labels) — demais papéis seguem restritos.
- **UI:** ligar o filtro "Todas as lojas" (hoje fachada) no `ExecutiveCockpitPage` e `ManagerDashboard` a esses RPCs; componentes de comparação (tabela "Indicadores por loja", donut de participação no faturamento). Eliminar fallbacks hardcoded para o id da matriz.

**Risco:** médio — aditivo via RPC, **não** mexe nas policies operacionais. Validar `get_advisors` + `rls-regression.sql`.

### Bloco B2 — Vendedor multi-loja ⚫ (altíssimo risco, atrás de flag)

**Objetivo:** um vendedor opera em N lojas simultaneamente.

**Entregas:**
- **DB:** tabela `seller_stores` (N:N) ou coluna `accessible_store_ids`; **reescrever `custom_access_token_hook`** para injetar o array no JWT; **reescrever `current_store_id()`** → `is_store_accessible(store_id)` em **todas** as ~33 policies; `StoreSwitcher` troca a loja ativa dentro do conjunto permitido.
- **Frontend:** `SupabaseAuthProvider` passa a popular `accessibleStoreIds` de verdade; multi-select de lojas no cadastro de usuário.

**Risco:** altíssimo — mexe no **hook de login** (erro = ninguém loga) e em **toda a RLS**. Por último, atrás de flag, com `rls-regression.sql` como gate **obrigatório** e plano de rollback. Testar em branch Supabase antes.

---

## 4. Matriz de risco e dependências

| Bloco | Toca JWT/hook? | Toca ~33 policies? | Muda dados reais? | Depende de |
|---|---|---|---|---|
| **A** | Não | Não (só `stores`) | Não (adiciona lojas) | — |
| **B1** | Não | Não (RPC isolado) | **Sim** (transfere) | A |
| **C** | Não | Não (RPC aditivo) | Não (leitura) | A |
| **B2** | **Sim** | **Sim** | Não (mas reescreve escopo) | A, (idealmente B1+C estáveis) |

---

## 5. Regras transversais (produção viva)

- **PR-only:** nenhuma integração sem autorização expressa do dono. Push + PR, nunca merge direto na `main`.
- **Migrations espelhadas:** todo `apply_migration` exportado para `supabase/migrations/` no mesmo PR.
- **Gate de RLS:** `supabase/tests/rls-regression.sql` verde **antes e depois** de qualquer mudança de policy/helper; provar por papel (`set local role`) que, com 1 loja, o comportamento dos 807 clientes/7 vendedores fica **idêntico**.
- **Confirmação em prod:** `apply_migration`/deploy de Edge só com confirmação do dono. Preferir validar em branch Supabase (`create_branch`) antes.
- **Auditoria:** toda operação resolve `actor_id` de seller válido (FK `audit_logs.actor_id → sellers` NOT NULL).
- **Cada bloco** = spec → plano → implementação → code review → smoke do dono → release (SemVer + codinome).

---

## 6. Arquivos-âncora (referência)

| Camada | Arquivo |
|---|---|
| Modelo | `src/shared/types/platform.ts` (`IStore`, `IPlatformSettings`, `StoreType`), `src/shared/types/people.ts` (`ISeller.accessibleStoreIds`) |
| Provider | `src/providers/data/contracts/stores.ts`, `impl/supabase/stores.ts`, `impl/mock/stores.ts`, `impl/supabase/customers.ts` (template CRUD) |
| Settings | `src/mocks/data/seedStore.ts` (origem do blob `settings`) |
| UI | `src/features/multistore/pages/StoresPage.tsx`, `components/StoreSwitcher.tsx`, `MultistoreProvider.tsx`; `src/features/admin-settings/components/SellerFormDialog.tsx` (form de referência) |
| Scope | `src/features/multistore/utils/withStoreScope.ts`, `impl/mock/_storeScope.ts` |
| RBAC | `src/features/rbac/permissions/matrix.ts` (recurso `store`) |
| DB (migrations base) | `20260608135134_poc_create_stores_table.sql`, `20260608220448_rls_policies_store_direct.sql`, `20260608220403_rls_helpers_identity.sql`, `20260608141818_poc_create_profiles_and_auth_hook.sql`, `20260610015118_perf_108_trgm_matviews.sql` |
| Transferência (modelo) | `20260614190000_conversation_transfer_rpc.sql`, `20260608151403_create_carteira_transfers_table.sql` |
| BI (C) | `src/features/executive-cockpit/pages/ExecutiveCockpitPage.tsx`, `src/features/manager-dashboard/` |

---

## 7. Próximo passo

Entrar no **design detalhado do Bloco A** (spec → plano → implementação). Decisões a fechar no design do A: catálogo `parts` (compartilhado vs por loja), mecanismo de escrita (RPC Owner-only vs policy), campos do formulário e provisionamento de `settings` da filial nova.
