# Spec — Bloco A: Gestão de Lojas (CRUD + Compartilhamento de Recursos)

> **Roadmap:** [ROADMAP-gestao-multiloja-fase2.md](../../prds/ROADMAP-gestao-multiloja-fase2.md) · **Bloco:** A (1º de A → B1 → C → B2)
> **Criado:** 2026-06-19 · **Status:** 🔄 Em design (aguardando review do dono)

O Bloco A se divide em dois componentes sequenciais, cada um com seu PR:

- **A1 — CRUD de Lojas:** Owner cria/edita/desativa filiais e parceiras pela UI.
- **A2 — Política de compartilhamento de recursos:** parâmetro global (por tipo de recurso) que define o que é compartilhado entre lojas; aplicado a catálogo de peças, kits e tags.

**Decisões do dono já fechadas:**
- Settings de filial nova = **padrões limpos** (`buildDefaultSettings`, sem herdar da matriz).
- Escrita cross-loja via **RPC `SECURITY DEFINER` Owner-only** (não policy aberta).
- Compartilhamento = **por tipo de recurso, global** (liga/desliga por categoria; pool único).
- Recursos compartilháveis = **catálogo de peças (parts)** + **kits (model_kits)** + **tags do catálogo**.

---

## Componente A1 — CRUD de Lojas

### A1.1 Banco (migration versionada + espelhada)

1. `ALTER TABLE public.stores ADD COLUMN is_active boolean NOT NULL DEFAULT true;`
   - Soft-delete. **Nunca** hard delete (33 FKs, maioria `NO ACTION`).
2. **RPCs `SECURITY DEFINER` Owner-only** (gate `current_app_role() = 'owner'`, `REVOKE EXECUTE FROM anon`):
   - `create_store(p_name, p_type, p_cnpj, p_address, p_manager_id, p_active_divisions, p_settings jsonb) returns stores`
   - `update_store(p_id, p_name, p_cnpj, p_address, p_manager_id, p_active_divisions) returns stores` (nunca altera `id`/`type` da matriz; ver guardas)
   - `set_store_active(p_id, p_active boolean) returns stores`
   - Cada RPC grava `audit_logs` (`action` = `store.create|store.update|store.disable`), resolvendo `actor_id` de seller válido.
3. **Ampliar `stores_select`**: `USING (id = current_store_id() OR current_app_role() = 'owner')` — o Owner precisa enxergar as filiais que cria (hoje a RLS as esconderia). Aditivo, Owner-only.
4. **Guardas no servidor (dentro das RPCs):**
   - `set_store_active(false)` **proíbe** desativar `type = 'matriz'` e proíbe desativar a última loja ativa.
   - `create_store` só aceita `type IN ('filial','parceira')` (matriz é única, criada por seed).

### A1.2 Provider (Provider Pattern)

- `IStoresProvider` (contract) ganha: `create(input)`, `update(id, patch)`, `setActive(id, active)`.
- **supabase impl:** chama as RPCs via `.rpc(...)`; `list()` passa a trazer também filiais (graças ao `stores_select` ampliado). Mapper `rowToStore` reaproveitado.
- **mock impl:** paridade — `create`/`update`/`setActive` mutando o `mockStore` (upsert/patchById), com `logMockMutation` e as mesmas guardas (não desativar matriz/última).
- `buildDefaultSettings(storeId): IPlatformSettings` — factory extraída de `seedStore.ts` (hoje o blob só existe inline na matriz). Gera defaults de fábrica válidos (pipeline, motivos de perda, gamificação, comissão, etc.) para a filial nova. **TDD** (engine puro, testado).

### A1.3 UI

- `StoresPage` deixa de ser read-only:
  - Remove o badge "Somente leitura · gestão na Fase 2" e o hint pontilhado.
  - Botão **"Nova loja"** (gate `<Can resource="store" action="create">` — Owner).
  - Por loja: ação **Editar** (`<Can ... action="edit">`) e **Ativar/Desativar** (toggle; matriz sem opção de desativar).
  - `StoreFormSheet` — copia o padrão de `SellerFormDialog` (Sheet `side=right`, RHF + zod schema em `engine/storeForm.ts`, `useMutation` + toast + `invalidateQueries(['stores'])`).
  - Campos: `name`, `type` (filial/parceira), `cnpj` (máscara + validação), `address`, `managerId` (select de vendedores), `activeDivisions` (multi-select; default `['parts']`).
- `MultistoreProvider`: expõe `refreshStores()` (ou migra o roster para TanStack Query com `queryKey: ['stores']`) chamado no `onSuccess` da mutação — hoje o roster só carrega no mount. Preservar a loja ativa se ainda acessível; rodar o fallback existente se a loja ativa for desativada.
- **Estados vazios** reforçados nas telas scoped, antecipando a 1ª filial vazia (ver Riscos).

### A1.4 Critérios de aceitação (A1)

```gherkin
DADO que sou Owner em /app/configuracoes/lojas
QUANDO clico em "Nova loja", preencho filial e salvo
ENTÃO a loja é criada (RPC), aparece na lista e no StoreSwitcher sem reload
  E um audit_log store.create é gravado

DADO que sou Gestor
QUANDO acesso /app/configuracoes/lojas
ENTÃO vejo as lojas, mas NÃO vejo os botões criar/editar/desativar (gate Owner)

DADO que tento desativar a matriz (ou a última loja ativa)
QUANDO a RPC executa
ENTÃO a operação é rejeitada com mensagem clara, sem alterar nada

DADO 1 loja (estado atual de produção)
QUANDO rodo a suíte rls-regression antes/depois da migration
ENTÃO o comportamento dos 807 clientes / 7 vendedores é idêntico
```

---

## Componente A2 — Política de Compartilhamento de Recursos

### A2.1 Modelo

- Tabela global **`resource_sharing_policy(resource_type text PRIMARY KEY, shared boolean NOT NULL DEFAULT false, updated_at, updated_by)`**.
  - RLS: SELECT por qualquer `authenticated` (a RLS dos recursos precisa lê-la); escrita só Owner (via RPC `set_resource_sharing(resource_type, shared)`).
  - Linhas seed: `parts`, `model_kits`, `catalog_tags` — todas `shared = false` por padrão (comportamento atual preservado).
- Helper `public.is_resource_shared(p_resource_type text) returns boolean` — `SECURITY DEFINER STABLE`, lê a tabela. Usado nas policies.

### A2.2 Aplicação por recurso

**`parts` e `model_kits` (tabelas com RLS) — mecanismo uniforme:**
- `parts_select` (authenticated) passa a: `USING (store_id = current_store_id() OR is_resource_shared('parts'))`.
- `model_kits_select`: `USING (store_id = current_store_id() OR is_resource_shared('model_kits'))`.
- **Escrita permanece store-scoped** (insert/update/delete seguem `current_store_id()`): cada loja gerencia as peças/kits que criou; o compartilhamento é de **leitura** (pool de visibilidade bidirecional). Isso entrega "a filial vê o catálogo da matriz e vice-versa" sem o risco de uma loja sobrescrever o catálogo da outra. *(Trade-off explícito; se o dono quiser escrita compartilhada, é um delta posterior.)*
- `parts_select_anon` (`active = true`) é mantida intacta (storefront público).

**Tags do catálogo (`settings.tagSuggestions`, jsonb por loja) — mecanismo diferente:**
- Tags **não** são tabela e não passam por RLS. Quando `catalog_tags` está `shared = true`, a resolução de `tagSuggestions` é feita **em app**: a loja lê as tags da **matriz** (loja-fonte) em vez das próprias.
- Implementação: um resolver em `settingsProvider`/hook que, se `is_resource_shared('catalog_tags')`, retorna `tagSuggestions` da matriz. Sem migração de tags para tabela (evita escopo extra).
- ⚠️ **Ponto de review:** se o dono preferir tags com o mesmo mecanismo de pool de parts, isso exige **promover tags a tabela** (`catalog_tags` com `store_id` + RLS) — escopo maior. A spec assume o tratamento leve (resolução em app) salvo decisão contrária.

### A2.3 UI

- Tela/seção **"Compartilhamento entre lojas"** (Owner-only), em `StoresPage` ou em Configurações → Lojas: três toggles (Catálogo de peças, Kits, Tags) chamando `set_resource_sharing`.
- Visível apenas para Owner e útil de fato com 2+ lojas (com 1 loja, informativo).

### A2.4 Critérios de aceitação (A2)

```gherkin
DADO duas lojas (matriz + filial) e parts shared = false
QUANDO a filial lista peças
ENTÃO vê apenas as próprias (0, recém-criada)

DADO parts shared = true
QUANDO a filial lista peças
ENTÃO vê o pool (as 351 da matriz + as suas), e a matriz vê as da filial também
  E a escrita continua restrita à loja de origem de cada peça

DADO 1 loja (produção atual) e qualquer valor dos flags
QUANDO os 7 vendedores operam
ENTÃO o comportamento é idêntico ao atual (rls-regression verde)
```

---

## Riscos e mitigação

- **Produção viva (807 clientes, 7 vendedores, 1 loja):** toda mudança de RLS (`stores_select`, `parts_select`, `model_kits_select`) roda `supabase/tests/rls-regression.sql` antes/depois; com 1 loja o comportamento é invariante (os `OR` só ativam com 2+ lojas / flag ligado).
- **1ª filial vazia = risco de pânico:** ao existir a 2ª loja, trocar a loja ativa para a filial deixa telas scoped vazias. Mitigação: estados vazios claros + (futuro) banner explicativo. O Bloco A **não cria** a filial real — só a ferramenta.
- **Auto-lockout:** guardas server-side impedem desativar a matriz / última loja ativa; o `MultistoreProvider` faz fallback se a loja ativa some.
- **Migrations espelhadas + PR-only:** todo `apply_migration` exportado em `supabase/migrations/` no mesmo PR; nada aplicado em prod sem confirmação do dono (preferir validar em branch Supabase antes).
- **`actor_id` NOT NULL:** RPCs resolvem seller válido para a auditoria não falhar silenciosamente.

## Fora de escopo (Bloco A)

- Transferência de clientes/leads entre lojas (Bloco B1).
- Vendedor multi-loja / array no JWT (Bloco B2).
- Consolidação BI cross-store (Bloco C).
- Escrita compartilhada de catálogo (só leitura no A2).
- Estoque/preço por loja (tema próprio).

## Sequência de entrega

1. **A1** (CRUD) — PR próprio, smoke do dono, release.
2. **A2** (compartilhamento) — PR próprio, sobre A1.
