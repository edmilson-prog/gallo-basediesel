# Design — Tela de gestão de kits de revisão (CRUD de IServiceKit)

> **Issue:** #24 · **Data:** 2026-06-03 · **Autor:** sessão Claude Opus 4.8 (1M context)
> **Status:** aprovado pelo usuário (aguardando plano de implementação)

## Contexto

A Fase 3 do editor de orçamento (v0.61.0 Toolkit) entregou os kits de revisão
(`IServiceKit`) em modo **somente-leitura**: modelo, seed estático, provider com
`list` e consumo no editor via `KitPicker` (insere todas as peças de um kit de uma
vez). Falta a **tela de gestão** para o usuário criar, editar, duplicar e excluir
kits — registrada como issue #24 e deferida de propósito no spec do editor.

Este documento desenha essa tela e a extensão de escrita do provider.

## Objetivo

Permitir que **Owner/Gestor** montem e mantenham kits de revisão pela interface,
sem editar código. Os kits criados/editados ficam imediatamente disponíveis no
`KitPicker` do editor de orçamento.

## Princípios e restrições

- **Fase 1 (Frontend First):** persistência é **mock in-memory** (igual a
  `expenses`). Escritas valem na sessão e se perdem no reload. Stub Supabase lança
  `NotImplementedError`. Persistência real fica para a Fase 2.
- **Provider Pattern:** a feature consome apenas `useServiceKitsProvider`; nunca
  importa `impl/*` direto (bloqueado por ESLint).
- **TypeScript strict**, interfaces de domínio prefixadas com `I`.
- **Tokens semânticos** apenas (sem hex/`--gallo-*` cru). Light + dark.
- **DRY:** um único componente de formulário reusado em 3 cascas de UX.
- **Consistência:** seguir os padrões já existentes (CRUD de catálogo, mutations de
  `expenses`, RBAC via `usePermission`/`<Can>`, navegação em `navigation.ts`).

## Decisões de produto (definidas no brainstorm)

| Decisão                  | Escolha                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| Localização na navegação | **Dentro de Catálogo** (`/app/catalogo/kits`)                                                      |
| UX de criar/editar       | **As 3** — página, dialog e drawer — selecionáveis                                                 |
| Seleção da UX            | **Preferência persistida** (toggle + localStorage, padrão `useQuoteEditorPrefs`)                   |
| Operações no MVP         | criar, editar, **duplicar**, **excluir (com confirmação)**, **filtros/busca**, **contagem de uso** |
| Contagem de uso          | **Mock determinístico** (semeado por id) — rastreamento real adiado                                |
| Quem gerencia            | **Owner + Gestor** (Vendedor só consome no editor)                                                 |

## Arquitetura e fluxo de dados

Nova feature `src/features/service-kits/` que consome o provider `serviceKits`
estendido com escrita. Leitura e escrita via TanStack Query; as mutations invalidam
a query key `["service-kits"]`, então o `KitPicker` do editor reflete as mudanças
automaticamente. Toda escrita é mock in-memory.

```
ServiceKitsListPage ──query──> useServiceKits ──> useServiceKitsProvider.list
        │                                              │
        │ create/edit/duplicate/remove                 └─ mock api (store in-memory)
        ▼
useServiceKitMutations ──> provider.{create,update,remove,duplicate}
        │                          │
        └─ invalidate ["service-kits"] ──> KitPicker (editor) atualiza
```

## Camada de provider + mock (escrita)

**Contract** (`src/providers/data/contracts/serviceKits.ts`) — adiciona às
operações de leitura:

```ts
export interface ICreateServiceKitInput {
  storeId: ID;
  name: string;
  description?: string;
  vehicleApplication?: { brand: string; model: string };
  category?: PartCategory;
  items: IServiceKitItem[];
}

export interface IServiceKitsProvider {
  list(params?: IListServiceKitsParams): Promise<IServiceKit[]>;
  create(input: ICreateServiceKitInput): Promise<IServiceKit>;
  update(id: ID, patch: Partial<ICreateServiceKitInput>): Promise<IServiceKit>;
  remove(id: ID): Promise<void>;
  duplicate(id: ID): Promise<IServiceKit>;
}
```

**Mock api** (`src/mocks/api/serviceKits.ts`):

- Store mutável in-memory inicializado a partir de `SEED_SERVICE_KITS` (o seed vira
  **estado inicial**, não fonte imutável).
- `create`: gera id determinístico-incremental (`kit-<slug(name)>-<n>`), faz push.
- `update`: `patchById` no store; lança erro se id ausente.
- `remove`: `removeById`.
- `duplicate`: clona o kit, novo id, nome `"<name> (cópia)"`.
- Todas via `runApi("serviceKitsApi", "<op>", …)` para latência simulada e logging.

**Impls:**

- `impl/mock/serviceKits.ts`: delega as 4 novas ops à api.
- `impl/supabase/serviceKits.ts`: as 4 novas ops lançam `NotImplementedError`.

**Factory:** já registra a slice `serviceKits`; apenas a interface cresce.

## Estrutura da feature (1 form, 3 cascas)

```
src/features/service-kits/
  pages/
    ServiceKitsListPage.tsx     # lista + filtros + toggle de UX + ações
    ServiceKitFormPage.tsx      # casca "página" (rotas /novo e /$id/editar)
  components/
    KitForm.tsx                 # núcleo único: campos + KitItemBuilder + submit
    KitFormDialog.tsx           # casca dialog (Dialog shadcn) envolvendo KitForm
    KitFormDrawer.tsx           # casca drawer (Sheet shadcn) envolvendo KitForm
    KitItemBuilder.tsx          # busca de peça (useItemSearch) + lista de itens + qtd
    KitsTable.tsx               # nome, veículo, categoria, nº itens, uso, ações
    KitUxToggle.tsx             # 3 ícones: página | dialog | drawer
    DeleteKitDialog.tsx         # AlertDialog de confirmação
  hooks/
    useServiceKits.ts           # query lista — key ["service-kits", storeId]
    useServiceKitMutations.ts   # create/update/remove/duplicate + invalidate + toast
    useServiceKitFormPrefs.ts   # localStorage "gallo-kit-ux" (page|dialog|drawer)
  utils/
    kitValidation.ts            # schema zod
    kitUsageMock.ts             # contagem determinística semeada por id
  types.ts                      # KitUxMode, re-exports de input types
```

**Seleção da casca de UX:** os botões "Novo kit" e "Editar" consultam
`useServiceKitFormPrefs`:

- modo `page` → navega para `/app/catalogo/kits/novo` ou `/$id/editar`;
- modos `dialog`/`drawer` → abrem a casca in-place sobre a lista (sem trocar rota).

As 3 cascas renderizam o **mesmo `KitForm`** — lógica de validação, estado e submit
ficam num único lugar. As cascas só fornecem o contêiner (página/dialog/drawer) e
os botões de cancelar/salvar.

**`KitItemBuilder`:** reusa `useItemSearch` (query key compartilhada
`["parts-for-quote"]`) para a busca de peças à esquerda; à direita lista os itens já
no kit com controle de quantidade (inteiro ≥1) e remover. Peça órfã (partId sem peça
no catálogo) aparece como "peça indisponível", sem quebrar.

## RBAC + navegação

- **Matriz** (`src/features/rbac/permissions/matrix.ts`): novo resource
  `serviceKit` com ações `view/create/edit/delete` liberadas para **Owner** e
  **Gestor**. Vendedor não recebe nenhuma — continua apenas _consumindo_ kits no
  editor de orçamento.
- **Gate de rota:** `app.catalogo.kits.*` exige `requireAuth` com `["Owner","Gestor"]`.
- **Gate de UI:** ações de criar/editar/duplicar/excluir envoltas em
  `<Can resource="serviceKit" action="…">`.
- **Menu** (`src/features/shell/config/navigation.ts`): novo `INavItem`
  "Kits de revisão" (ícone `mdi:toolbox-outline`), `to` = nova constante
  `CATALOGO_KITS` em `shell/config/routes.ts`, `roles: ["Owner","Gestor"]`, no mesmo
  grupo de navegação do Catálogo.

## Rotas (TanStack Router file-based)

```
app.catalogo.kits.tsx            # wrapper <Outlet> + guard de role
app.catalogo.kits.index.tsx      # ServiceKitsListPage
app.catalogo.kits.novo.tsx       # ServiceKitFormPage (modo criar)
app.catalogo.kits.$id.editar.tsx # ServiceKitFormPage (modo editar)
```

As rotas `/novo` e `/$id/editar` só são acessadas no modo de UX `page`; nos modos
`dialog`/`drawer` o formulário abre na própria lista.

## Validação, erros e casos de borda

- **Validação** (zod + react-hook-form):
  - `name`: obrigatório, trim não-vazio; aviso (não bloqueio) se duplicar nome na loja.
  - `items`: ≥1 item; cada `quantity` inteiro ≥1.
  - `vehicleApplication`, `category`, `description`: opcionais.
- **Peça órfã:** linha "peça indisponível" no builder; consistente com
  `expandKitToItems` (insere o que existe, ignora o resto).
- **Toasts (sonner):** sucesso em criar/editar/duplicar/excluir; erro tratado com
  mensagem amigável.
- **Estados:** skeleton no carregamento da lista; empty-state "Nenhum kit cadastrado"
  com CTA para criar o primeiro.
- **Contagem de uso:** badge "usado em N orçamentos" derivado de `kitUsageMock(id)` —
  número **determinístico semeado** (mesmo padrão de `overdueTitlesCount`), rotulado
  internamente como placeholder de demo.

## Fora de escopo (deferido)

- Persistência real no Supabase (stub lança `NotImplementedError`).
- Rastreamento real de uso de kit (exigiria origem-de-kit no modelo de orçamento).
- Versionamento/histórico de alterações de kit.
- Kits por divisão (`service`/`industrial`) — modelados depois.

## Critério de "feito"

- Owner/Gestor cria, edita, duplica e exclui kits pela interface, nas 3 UX
  selecionáveis por preferência persistida.
- Mudanças refletem no `KitPicker` do editor sem reload.
- Provider estendido com `create/update/remove/duplicate` (mock funcional, supabase
  stub lança erro).
- Permissões restringem gestão a Owner/Gestor; Vendedor não vê a tela.
- `tsc --noEmit` filtrado pelos arquivos da feature = vazio; prettier/eslint
  limpos por-arquivo.
