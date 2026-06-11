# Design — CRUD completo de usuários (Configurações → Usuários)

> **Status:** aprovado pelo dono em 2026-06-11.
> **Contexto:** a tela `Configurações → Usuários` (PRD-107 Fase 3) cobre apenas as operações de **acesso** (criar login, redefinir senha, trocar papel, desligar/reativar). Não existe forma de **cadastrar um usuário novo**, **editar dados** nem **excluir** — os vendedores listados vieram do seed. Este design fecha o CRUD.

## Decisões do dono

| Decisão | Escolha |
| --- | --- |
| Escopo | Cadastrar novo + editar dados + excluir |
| Semântica de excluir | **Soft delete** — some da plataforma e perde o login, registro permanece no banco preservando histórico (31 tabelas referenciam `sellers` com `NO ACTION`; exclusão física é inviável com histórico) |
| Fluxo de cadastro | **Dois passos** — cadastra só os dados (fica "sem acesso"); o botão "Criar acesso" existente cobre o login depois |
| E-mail de quem tem login | Edição permitida com aviso fixo: o acesso continua pelo e-mail antigo (sincronizar e-mail de login fica fora de escopo) |
| Arquitetura | **Abordagem A** — dados via provider (RLS já protege), exclusão via Edge Function nova (`service_role` para revogar auth) |

## 1. Modelo e migration

- `alter table public.sellers add column deleted_at timestamptz;` (null = ativo).
- Migration aplicada via MCP `apply_migration` **e espelhada em `supabase/migrations/` no mesmo PR** (regra do projeto).
- `ISeller` (em `src/shared/types/people.ts`) ganha `deletedAt?: ISO8601`, mapeado no impl supabase (`deleted_at`).
- Nenhuma policy de RLS muda — `sellers_insert`/`sellers_update`/`sellers_delete` (staff da loja) já cobrem o necessário.

## 2. Provider — contrato e implementações

`ISellersProvider` (`src/providers/data/contracts/sellers.ts`) ganha:

```typescript
/** Input do cadastro de um vendedor novo (sem acesso). */
export interface ICreateSellerInput {
  storeId: ID;
  fullName: string;
  email: string;
  phone?: string;
  type: SellerType; // internal | external | representative
  region?: string;
}

interface ISellersProvider {
  // ... métodos existentes (list, get, setAvailability, update)
  create(input: ICreateSellerInput): Promise<ISeller>;
  /** Soft delete — marca deleted_at, desativa e revoga o login (se houver). */
  remove(id: ID): Promise<void>;
}
```

Defaults na criação: `divisions: ['parts']`, `availability: 'offline'`, `active: true`, `deletedAt: undefined`.

- **Mock** (`impl/mock/sellers.ts` + `src/mocks/api/sellers.ts`): `create` insere no mockStore; `remove` seta `deletedAt` + `active=false`. Auditoria via `auditLogger` como nas demais mutações mock.
- **Supabase** (`impl/supabase/sellers.ts`): `create` = `insert` direto (RLS de staff protege); `remove` = invoca a Edge Function `delete-seller`.
- `list()` (**ambas** as impls) filtra `deleted_at is null` — o excluído some de toda a plataforma (equipe, distribuição, rankings), pois tudo consome o provider. `get()` **continua resolvendo excluídos**, para que pedidos/históricos antigos sigam exibindo o nome.

## 3. Edge Function `delete-seller` (a 11ª)

- **Owner-only** (mais restrita que `set-seller-access`, por ser irreversível na prática).
- Guards (mesmo padrão das funções existentes): alvo precisa pertencer à loja do caller; nunca a si mesmo; nunca um Owner.
- Ordem de execução:
  1. Se o seller tem `profiles.auth_user_id`: `auth.admin.deleteUser` + delete da linha em `profiles` (libera o e-mail para reuso futuro).
  2. `update sellers set deleted_at = now(), active = false`.
  3. Audit log `seller_deleted` (best-effort, como nas demais).
- Para seller sem login, apenas o passo 2 + 3.
- Usa os padrões `_shared/` existentes (CORS, auth guard, resposta de erro padronizada).
- Cliente: função `deleteSeller(sellerId)` em `src/features/admin-settings/api/sellerAccess.ts` — chamada pelo impl supabase do provider.

## 4. UI — reforma da tela Usuários

- `UsersPlaceholderPage` → renomeada `UsersPage` (mesma rota Owner-only `/app/configuracoes/usuarios`). Mantém o padrão visual de Configurações (`SectionHeader` + lista compacta) — não é tela de lista massiva; as regras de tabela de `docs/dev/ux-guidelines.md` §4 não se aplicam aqui.
- **Novo usuário**: botão no topo da lista abre `SellerFormDialog` (react-hook-form + zod):
  - Campos: nome* (min 3), e-mail* (formato válido), telefone (opcional), tipo* (interno/externo/representante), região (visível apenas para externo/representante).
  - Salva **sem acesso** → o item aparece na lista com o botão "Criar acesso" existente (fluxo de 2 passos).
- **Editar**: ação por item abre o mesmo `SellerFormDialog` em modo edição (mesmos campos). Quando o usuário tem login e o campo e-mail diverge do original, exibir aviso fixo no formulário: *"O acesso continua pelo e-mail antigo. O e-mail de login não é alterado."*
- **Excluir**: ação por item abre `AlertDialog` destrutivo explicando as consequências (perde o login, some das listas, histórico de vendas/conversas preservado). Oculto para a linha do Owner e para o próprio usuário logado.
- Em modo **mock/demonstração**, o CRUD de dados funciona de verdade (mockStore); apenas as operações de acesso seguem exigindo `VITE_AUTH_SOURCE=supabase`. O aviso de "exige backend Supabase" passa a cobrir só a parte de acesso.
- Invalidação de queries após mutação: `["sellers", storeId]` e `["seller-access", storeId]`.
- Strings de UI em pt-BR com acentuação correta.

## 5. Erros, testes e gate

- Toasts pt-BR mapeando erros da Edge Function (mesmo padrão de `sellerAccess.ts`).
- Testes Vitest:
  - mock provider — `create` (defaults aplicados), `remove` (some do `list`, `get` ainda resolve), filtro `deletedAt` no `list`;
  - schema zod do `SellerFormDialog` (campos obrigatórios, e-mail inválido, região condicional).
- Gate: `bun run build` + `bun run test` verdes.
- Branch `feat/users-crud` a partir da `main`; PR ao final; bump de versão (MINOR) após merge, conforme fluxo do projeto.

## Fora de escopo (explícito)

- Exclusão física/anonimização LGPD (futuro, PRD-191).
- Sincronização do e-mail de login ao editar o e-mail do cadastro.
- Reatribuição de carteira/clientes na exclusão (o vínculo histórico permanece com o vendedor excluído).
- Mudanças nos fluxos de acesso existentes (criar acesso, reset de senha, papel, desligar/reativar).
