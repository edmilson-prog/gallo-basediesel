# Renomear contato do pool + nome uniforme na tela de Atendimento

> **Release:** v0.131.1 `Ledger` (PATCH) · **PR:** [#225](https://github.com/edmilson-prog/gallo-basediesel/pull/225) · **Merge commit:** `9c0295b5` · **Tag:** `v0.131.1` · **Data:** 2026-07-03
>
> **Commits do PR:**
> - `c856d761` — `fix(customers): let attending sellers rename pool contacts + unify name casing`
> - `8b24d87f` — `fix(customers): force uppercase in the rename contact input`

---

## 1. Objetivo

Dois problemas relatados na tela de **Atendimento**, resolvidos no mesmo PR:

1. **Vendedores não conseguiam renomear contatos.** A premissa de negócio é que **não há restrição** para renomear — qualquer atendente pode. Na prática, quem não é `is_staff` nem dono da carteira recebia o toast *"Não foi possível renomear o contato"* ao tentar renomear um contato **em fila** (pool, sem dono).
2. **O nome do contato aparecia de 3 formas diferentes** na mesma tela — MAIÚSCULAS na ficha (à direita), minúsculas na lista de conversas e no topo da conversa.

Ainda no mesmo ciclo, um follow-up reforçou que o **campo de renomear já force a caixa alta na origem** (o que é digitado entra e é salvo em MAIÚSCULAS).

---

## 2. Causa raiz (renomear)

O `RenameContactDialog` fazia **UPDATE direto** em `customers` via `provider.update`. A policy de escrita:

```sql
customers_update = is_staff() OR seller_id = current_seller_id()
```

**não** tem o ramo `seller_handles_customer(id)` que a policy de leitura `customers_select` **tem**. Resultado: um contato do pool (`seller_id = null`) era **visível** para o atendente (via acesso por instância/conversa) mas o UPDATE casava **0 linhas** → erro.

É exatamente a mesma assimetria de RLS do [modelo de 2 portões](./conversation-access-model.md): **leitura escopada por instância funciona, escrita não**. Foi provado em produção sob impersonação (vendedor Lucas `5a6400ed`, `seller_internal`, não-staff): o UPDATE direto afetava **0 linhas**.

---

## 3. Solução — visão geral

Espelhar o padrão já usado na irmã `mark_contact_not_customer`: uma **RPC `SECURITY DEFINER`** gated por acesso à conversa, que executa a escrita com privilégio e grava a auditoria no servidor. O front deixa de fazer UPDATE direto e passa a chamar um novo método de provider `renameContact`.

```
RenameContactDialog
      │  provider.renameContact(customerId, name)
      ▼
ICustomersProvider.renameContact  ── contrato
      │
      ├── supabase impl → RPC rename_customer_contact (SECURITY DEFINER, gated)
      └── mock impl     → customersApi.update + logMockMutation
```

### Arquivos alterados (PR #225)

| Arquivo | Tipo | O quê |
|---|---|---|
| `supabase/migrations/20260703140000_rename_customer_contact_rpc.sql` | **novo** | RPC `SECURITY DEFINER` gated + audit server-side + revoke anon |
| `src/providers/data/contracts/customers.ts` | mod | assina `renameContact` no contrato |
| `src/providers/data/impl/supabase/customers.ts` | mod | chama a RPC |
| `src/providers/data/impl/mock/customers.ts` | mod | implementação mock equivalente |
| `src/providers/data/impl/mock/customers.test.ts` | **novo** | testes do mock `renameContact` |
| `src/features/customers/components/RenameContactDialog.tsx` | mod | usa `renameContact`, larga o audit client-side, força MAIÚSCULAS |
| `src/features/conversations/components/ConversationListItem.tsx` | mod | nome em `uppercase` |
| `src/features/conversations/components/ConversationHeader.tsx` | mod | nome (h2) em `uppercase` |
| `CHANGELOG.md` / `package.json` | mod | bump v0.131.1 Ledger |

---

## 4. Camada de dados

### 4.1. Migration — `rename_customer_contact`

Arquivo: `supabase/migrations/20260703140000_rename_customer_contact_rpc.sql`

```sql
create or replace function public.rename_customer_contact(p_customer_id uuid, p_name text)
returns setof public.customers
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_store  uuid := public.current_store_id();
  v_seller uuid := public.current_seller_id();
  v_cust   public.customers;
  v_name   text := btrim(p_name);
  v_before text;
begin
  select * into v_cust from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'customer % not found', p_customer_id using errcode = 'P0002';
  end if;
  if v_cust.store_id is distinct from v_store then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Gate: staff, OU dono da carteira (ficha /app/clientes, sem conversa),
  -- OU atendente do número (Portão A — pool/instância).
  if not (
    public.is_staff()
    or v_cust.seller_id = v_seller
    or exists (select 1 from public.conversations c
               where c.customer_id = p_customer_id and public.can_access_conversation(c.id))
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'name cannot be empty' using errcode = '22023';
  end if;

  -- Escreve só o nome de EXIBIÇÃO, resolvido pelo type da própria linha.
  -- whatsapp_name (dono = webhook) NUNCA é tocado.
  if v_cust.type = 'B2B' then
    v_before := v_cust.nome_fantasia;
    return query update public.customers set nome_fantasia = v_name where id = p_customer_id returning *;
  else
    v_before := v_cust.full_name;
    return query update public.customers set full_name = v_name where id = p_customer_id returning *;
  end if;

  -- Auditoria SERVER-SIDE (a mutação faz bypass de RLS e pode ser cross-carteira):
  if v_seller is not null then
    insert into public.audit_logs (id, store_id, actor_id, action, resource, resource_id, before, after)
    values (gen_random_uuid(), v_store, v_seller, 'customer.rename', 'customer', p_customer_id::text,
            jsonb_build_object('name', v_before), jsonb_build_object('name', v_name));
  end if;
end;
$$;

-- Fail closed + estreita a superfície: sem PUBLIC/anon, só authenticated.
revoke all on function public.rename_customer_contact(uuid, text) from public, anon;
grant execute on function public.rename_customer_contact(uuid, text) to authenticated;
```

**Decisões de segurança:**
- **Gate de 3 ramos** — `is_staff()` (dono/gestor), `seller_id = me` (dono da carteira, cobre a ficha `/app/clientes` que não tem conversa), e `can_access_conversation` (quem atende o número, cobre o pool). Espelha `mark_contact_not_customer` + adiciona o ramo do dono da carteira.
- **Escreve só o nome de exibição** — `full_name` (B2C) ou `nome_fantasia` (B2B), resolvido pelo `type` da linha. **`whatsapp_name` nunca é tocado** (é do webhook).
- **`for update`** — trava a linha durante a leitura+escrita.
- **`store_id` check** — barra cross-store.
- **Audit server-side** — como a RPC faz bypass de RLS e pode agir cross-carteira, a trilha (`customer.rename`, com `before`/`after` do nome) é gravada aqui, não só no client (à prova de adulteração).
- **`revoke ... from public, anon` + `grant ... to authenticated`** — fail closed, alinhado à família `can_access_*` endurecida.
- **RLS `customers_update` permanece intocada** — Portão B intacto.

### 4.2. Contrato — `ICustomersProvider`

`src/providers/data/contracts/customers.ts`:

```ts
/**
 * Rename a contact's DISPLAY name — fullName (B2C) / nomeFantasia (B2B),
 * resolved from the row's own type server-side. Gated so a non-staff seller
 * attending a POOL contact can rename it; writes the audit trail server-side.
 */
renameContact(customerId: ID, name: string): Promise<ICustomer>;
```

### 4.3. Impl Supabase

`src/providers/data/impl/supabase/customers.ts` — chama a RPC:

```ts
async renameContact(customerId, name) {
  const { data, error } = await this.client
    .rpc("rename_customer_contact", { p_customer_id: customerId, p_name: name })
    .maybeSingle();
  if (error) throw error;
  return mapCustomerRow(data);
}
```

### 4.4. Impl Mock

`src/providers/data/impl/mock/customers.ts` — equivalente in-memory, com o mesmo mapeamento por `type` e trilha de auditoria mock (`logMockMutation({ action: "customer.rename" })`).

Coberto por `src/providers/data/impl/mock/customers.test.ts`:
- B2C → grava `fullName`;
- B2B → grava `nomeFantasia`;
- em ambos, **preserva `whatsappName`**.

---

## 5. Front — `RenameContactDialog`

`src/features/customers/components/RenameContactDialog.tsx`:

- **Deixou de fazer UPDATE direto** (`provider.update` com um `Partial<ICustomer>`) e passou a chamar `provider.renameContact(customer.id, trimmed)`.
- **Removeu o audit client-side** (`auditLog(...)` e o import) — a trilha agora é server-side na RPC.
- Mantém a auto-suficiência: roda o rename, invalida as queries (`customer-profile`, `customers-list`) e mostra o toast.

---

## 6. Nome uniforme — MAIÚSCULAS nas 3 superfícies

Decisão do dono: **MAIÚSCULAS em tudo** (alinha ao padrão já usado nas etiquetas de conversa). Antes, só a ficha tinha `uppercase`:

| Superfície | Arquivo | Antes → Depois |
|---|---|---|
| Ficha (direita) | `ProfileHeader.tsx:54` | já tinha `uppercase` (inalterado) |
| Lista de conversas | `ConversationListItem.tsx` | span do nome: `truncate text-sm` → `truncate text-sm uppercase` |
| Topo da conversa | `ConversationHeader.tsx` | h2: adicionado `uppercase` |

> **Nota sobre a lista:** a lista usa o cache monotônico `useRelatedEntities` (zona congelada — o cache do Atendimento não deve ser tocado). Por isso, após um rename, a **ficha e o topo atualizam na hora**, mas a **linha da lista** reflete o novo nome no **reload** — decisão explícita do dono ("aceitar recarregar"). O cache **não foi tocado**.

### 6.1. Campo de renomear força caixa alta na origem (commit `8b24d87f`)

Follow-up: além da exibição, o **campo editável** força MAIÚSCULAS enquanto se digita, para que o valor **salvo** já fique no padrão.

`RenameContactDialog.tsx`:

```ts
/** pt-BR aware — preserva acentos (ç→Ç, á→Á). */
const toUpperName = (value: string) => value.toLocaleUpperCase("pt-BR");
```

Aplicado em todos os pontos que alimentam o campo:

| Ponto | Comportamento |
|---|---|
| `onChange` | cada tecla já vira caixa alta |
| Seed de abertura (`useEffect` + `useState`) | abre já em caixa alta |
| Botão "Usar o nome do WhatsApp" | aplica a versão em caixa alta |
| Guarda "sem alteração" | compara contra o valor em caixa alta (evita salvar à toa) |

> O rótulo *"Nome no WhatsApp: X"* continua mostrando o nome **original** — é o que o WhatsApp de fato tem; só o campo editável é uppercased.

---

## 7. Investigação paralela: menu ⋮ vazio para não-staff (sem código)

Durante o teste, o vendedor Lucas via o menu ⋮ da ficha **sem nenhuma opção** e o menu ⋮ do topo com **apenas "Atualizar foto do contato"** — ou seja, o botão "Renomear contato" sumia por gating de RBAC.

**Investigação (systematic-debugging, sem fixes sem causa raiz):** toda a configuração estática foi verificada e estava **correta** — `role` mapeado para `Vendedor`, `slug` `Vendedor`, matriz estática com `customer:edit:own` e `conversation:edit:own`, fallback estático idêntico, RLS permitindo não-staff ler `roles`.

**Causa raiz:** **timing de hidratação do RBAC no primeiro paint** — o cache `rbacConfig` ainda não estava hidratado quando o menu montou, então `hasPermission` retornava `false` universalmente. **Resolveu com o reload da página** (confirmado pelo dono). **Não era bug de configuração → nenhuma alteração de código.**

---

## 8. Verificação

- **Build:** `bun run build` ✅ (`built in 4.21s`, exit 0).
- **Testes:** `bun run test` ✅ **1489/1489** (194 arquivos, exit 0).
- **Prod (sob impersonação, revertida):** ALLOW renomeia+audita (ator correto); DENY = `42501`; anon = `permission denied`; `whatsapp_name` intacto; nada indevido persistiu.
- **Parity da migration em prod:** `SECURITY DEFINER`, `exec_roles = authenticated/postgres/service_role` (SEM anon).

---

## 9. Rollout / estado em produção

| Item | Estado |
|---|---|
| Migration `20260703140000` | **Aplicada em prod (2026-07-03)** via MCP `apply_migration`, autorizada pelo dono; parity + smoke live confirmados |
| PR #225 | **MERGEADO (2026-07-03)** — merge commit `9c0295b5` |
| `main` | **v0.131.1** |
| Tag | **`v0.131.1` publicada** no merge commit |
| CHANGELOG | entrada `0.131.1 Ledger` |

**Pendência única:** smoke do dono na UI com um vendedor real (renomear um contato em fila e conferir a caixa alta). Código e migration já estão no ar.

---

## 10. Lições aprendidas

1. **Escrita escopada por conversa/instância para não-staff sofre a MESMA assimetria que a leitura sofria.** `customers_update` não tem o ramo `seller_handles_customer` que `customers_select` tem. A solução é uma **RPC `SECURITY DEFINER` gated por `can_access_conversation`** (espelhando `mark_contact_not_customer`), com **audit server-side** (não confiar só no client) + **revoke de anon**. Ver [modelo de acesso a conversas](./conversation-access-model.md).
2. **Menu de RBAC vazio no primeiro paint** costuma ser **timing de hidratação** do cache de permissões, não erro de configuração — reload resolve; confirme a config estática antes de tocar em qualquer regra.
3. **Coluna/campo de exibição derivado do `type` da linha** deve ser resolvido **no servidor** (a RPC decide `full_name` vs `nome_fantasia`), não no client — evita divergência B2B/B2C.
