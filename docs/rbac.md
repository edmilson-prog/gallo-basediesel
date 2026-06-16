# RBAC — Roles, Permissões e Auditoria

> PRD-006 · GALLO BASE DIESEL · Fase 1 (mock).

Este documento é a referência canônica do modelo de papéis, permissões e
auditoria do produto. A matriz aqui descrita vive em
`src/features/rbac/permissions/matrix.ts` e deve ser espelhada pelas policies
do Supabase RLS na Fase 2.

> ⚠️ **O RBAC frontend não é segurança real.** A proteção efetiva entra com
> Supabase Auth + RLS (PRD-100+). Tudo o que este pacote entrega é disciplina
> de UX/UI: esconder o que o usuário não deve ver e bloquear a navegação.

---

## Modelo

Três dimensões compõem cada checagem de permissão:

- **Resource** (`customer`, `order`, `audit_log`, …) — entidade lógica.
- **Action** (`view`, `create`, `edit`, `delete`, `approve`) — verbo.
- **Scope** (`own < team < store < all`) — abrangência.

Hierarquia de scope: quem tem `store` implicitamente tem `team` e `own`; quem
tem `all` tem tudo. O helper `compareScopes()` impõe essa ordem.

Desde o PRD-211, o scope `team` corresponde aos **membros do departamento** do
usuário: o resolver puro `resolveTeamMemberIds(currentSellerId, departmentMembers)`
devolve o próprio usuário mais os demais sellers que compartilham o mesmo
`departmentId` (um usuário sem colegas de departamento degrada para `own`). O
isolamento real de dados é garantido pelo **RLS do Supabase governado pelo
`base_role`** — a filtragem de scope na UI ainda não está plugada nos list hooks
(`getCurrentUserScope` é o resolver canônico, fundação para futura adoção).

Apenas dois tipos de "user" interessam à camada: `null` (anônimo) e qualquer
objeto que carregue um campo `role: RoleName`. As helpers não conhecem o
restante da identidade — Supabase e mock convivem porque ambos atendem essa
shape.

---

## Papéis

| Papel             | Resumo                                                     |
| ----------------- | ---------------------------------------------------------- |
| `Owner`           | Visão total — todos os recursos, todas as lojas            |
| `Gestor`          | Loja própria — gerencia operação, aprova orçamentos        |
| `Vendedor`        | Carteira própria — atende clientes, cria orçamentos        |
| `VendedorExterno` | Espelha Vendedor; região vira filtro no PRD-007            |
| `SDR`             | Qualifica leads e prepara conversas, sem acesso financeiro |
| `Cliente`         | Portal B2B/B2C — vê o próprio histórico                    |
| `Financeiro`      | Visão financeira da loja — aprova comissões, vê auditoria  |

## Matriz consolidada

Legenda: `C`=create · `V`=view · `E`=edit · `D`=delete · `A`=approve · `:scope`

| Recurso        | Owner     | Gestor      | Vendedor | SDR     | Cliente | VendExt | Financeiro |
| -------------- | --------- | ----------- | -------- | ------- | ------- | ------- | ---------- |
| customer       | CRUD:all  | CRUD:store  | VE:own   | V:store | —       | VE:own  | V:store    |
| vehicle        | CRUD:all  | CRUD:store  | VE:own   | V:store | V:own   | VE:own  | —          |
| lead           | CRUD:all  | CRUD:store  | VE:own   | VC:own  | —       | VE:own  | —          |
| conversation   | CRUD:all  | CRUD:store  | VE:own   | VC:own  | VC:own  | VE:own  | —          |
| message        | CRUD:all  | C:store     | VC:own   | VC:own  | VC:own  | VC:own  | —          |
| part           | CRUD:all  | V:store     | V:store  | V:store | V:store | V:store | V:store    |
| quote          | CRUDA:all | CRUDA:store | VE:own   | VC:own  | V:own   | VE:own  | V:store    |
| order          | CRUD:all  | CRUD:store  | V:own    | —       | V:own   | V:own   | V:store    |
| commission     | CRUDA:all | A:store     | V:own    | —       | —       | V:own   | VA:store   |
| goal           | CRUD:all  | CRUD:store  | V:own    | —       | —       | V:own   | V:store    |
| recommendation | CRUD:all  | V:store     | V:own    | V:own   | —       | V:own   | —          |
| transfer       | CRUD:all  | CRUD:store  | —        | —       | —       | —       | —          |
| segment        | CRUD:all  | CRUD:store  | VCE:own  | —       | —       | VE:own  | —          |
| seller         | CRUD:all  | V:store     | V:own    | V:store | —       | V:own   | V:store    |
| store          | CRUD:all  | V:own       | —        | —       | —       | —       | V:own      |
| settings       | CRUD:all  | V:store     | V:own    | —       | —       | —       | —          |
| audit_log      | V:all     | V:store     | —        | —       | —       | —       | V:store    |
| role           | CRUD:all  | V:store     | —        | —       | —       | —       | —          |

> **Nota:** `audit_log` jamais aparece com `delete` para nenhum papel — o log
> é append-only por desenho. No Supabase isso é enforcado por `REVOKE DELETE`
> e por trigger anti-`UPDATE` na tabela.

---

## Propagação do enforcement (PRD-211)

A partir do PRD-211 os papéis e permissões deixaram de ser apenas constantes e passaram a viver em tabelas (`public.roles`, `public.role_permissions`, `public.rbac_resources`). A propagação funciona assim:

- **Fonte da verdade:** as tabelas acima. A UI lê uma cópia em memória (cache `rbacConfig`) que é **re-hidratada ao salvar** o editor de papéis (`rehydrateRbac`), então mudanças de permissão refletem na navegação sem recarregar a página.
- **Enforcement real:** continua na **RLS do Supabase**, governada pelo **`base_role`** do usuário (claim no JWT). A matriz fina refina UI/navegação; ela nunca concede além do que a RLS permite.
- **Papéis customizados:** todo papel customizado carrega um `base_role` (um dos 7 de sistema). Como ele nunca excede o papel-base, **não há janela "a UI concede o que a API nega"**.
- **Troca de papel-base:** quando o `base_role` de um usuário muda, é preciso um **refresh de claims** (re-login ou refresh do token) para a RLS reconhecer o novo papel.
- **`manage_roles`:** editar a matriz de papéis exige o recurso `manage_roles` (Owner); apenas visualizar a tela continua sob `role:view`. O recurso `monitor` nasce aqui como dado (base de um futuro "modo monitoramento"), sem comportamento ativo ainda.

---

## API pública

Tudo deve ser importado do barrel `@/features/rbac`:

```ts
import {
  Can,
  Forbidden,
  hasPermission,
  usePermission,
  useCurrentRole,
  getEffectivePermissions,
  getCurrentUserScope,
  auditLog,
} from "@/features/rbac";
```

### Helper síncrono

```ts
const allowed = hasPermission(currentUser, "commission", "approve", "store");
```

### Hook reativo

```tsx
function ApproveButton({ commissionId }: { commissionId: string }) {
  const canApprove = usePermission("commission", "approve");
  if (!canApprove) return null;
  return <Button onClick={...}>Aprovar</Button>;
}
```

### Componente declarativo

```tsx
<Can resource="commission" action="approve">
  <Button onClick={...}>Aprovar</Button>
</Can>

<Can
  resource="customer"
  action="delete"
  fallback={<Tooltip>Apenas Gestores e Owners excluem clientes</Tooltip>}
>
  <Button variant="destructive">Excluir</Button>
</Can>
```

### Bloqueio de rota

`requireAuth(pathname, roles?, permission?)` é a função consumida pelos
`beforeLoad` das rotas TanStack. Pode ser usada com role guard simples, com
permission guard fino, ou ambos combinados.

```ts
// papel-only (compatível com o PRD-003)
beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner"]);

// permission fina — Owner + Gestor + Financeiro (qualquer um com view:audit_log)
beforeLoad: ({ location }) =>
  requireAuth(location.pathname, undefined, { resource: "audit_log", action: "view" });
```

### Auditoria

`auditLog(params)` é fire-and-forget. Nunca lança, nunca quebra a ação.

```ts
auditLog({
  action: "approve",
  resource: "commission",
  resourceId: commission.id,
  before: { status: "pendente" },
  after: { status: "aprovado" },
});
```

Os **mock providers** (`@/providers/data/impl/mock/*`) já registram audit log
automaticamente em mutações de `customer`, `order`, `quote` e `commission`. O
`AuthProvider` registra `auth.signin` e `auth.signout`.

---

## Mapeamento previsto para Supabase RLS

Cada entrada da matriz vira uma policy. Esqueleto:

```sql
-- Vendedor vê apenas clientes da própria carteira (view:own)
CREATE POLICY "vendedor_view_own_customers"
  ON public.customers FOR SELECT
  TO authenticated
  USING (
    auth.uid() = (
      SELECT s.user_id FROM public.sellers s
      WHERE s.id = customers.seller_id
    )
  );

-- Gestor vê e edita tudo da própria loja (CRUD:store)
CREATE POLICY "gestor_manage_store_customers"
  ON public.customers FOR ALL
  TO authenticated
  USING (
    customers.store_id = (
      SELECT s.store_id FROM public.sellers s
      WHERE s.user_id = auth.uid()
    )
  );

-- Audit log: insert-only, sem update e sem delete
REVOKE UPDATE, DELETE ON public.audit_log FROM authenticated;
CREATE POLICY "owner_read_all_audits"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sellers s
      WHERE s.user_id = auth.uid()
        AND s.role = 'Owner'
    )
  );
```

A regra geral é: para cada `(role, resource, action, scope)` na matriz,
existe uma `POLICY` correspondente em `(resource, action)` filtrada pela
condição que materializa o `scope`. O PRD de migração para Supabase deve
gerar essas policies a partir desta matriz.

---

## O que NÃO está coberto pelo MVP

- Edição de papéis e permissões pela UI (a tela `/app/configuracoes/papeis`
  é read-only; edição entra na Fase 2)
- Permissões por registro (ex.: "apenas o vendedor X pode editar o cliente Y")
- Compliance LGPD avançada (anonimização, direito de esquecimento) em logs
- Persistência do audit log entre reloads (mock é volátil — Supabase resolve)
- Logs de leitura/view (apenas mutations e auth events geram log)

---

## Convenções

- Resources e actions sempre como **string literal** tipada (`ResourceName`,
  `PermissionAction`). Passar string solta quebra o build.
- Acoplar `auditLog()` somente nos **mock providers** neste PRD; no Supabase
  o gatilho será via trigger DB no PRD-110+.
- Sempre `import { ... } from "@/features/rbac"` — nunca dos arquivos
  internos. O barrel é a superfície pública.
