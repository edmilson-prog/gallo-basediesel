# Categorias de peça como dado — item 9 do ui_kit `catalog/lista`

**Data:** 2026-08-15
**Branch:** `worktree-part-categories-taxonomy`
**Base:** `main` após o #490 (lista) e o #492 (nova peça)
**Fonte da verdade:** projeto Claude Design “GALLO Base Diesel — Design System”,
`ui_kits/catalog/lista/` — arquivo novo `cl-cats.jsx` + item 9 do `README.md`.

Continuação do #490. Ao reconferir a fonte da verdade, o kit havia ganhado
**dois** ajustes que não estavam na entrega anterior:

1. **Item 9 — “Categorias gerenciáveis”**: um drawer aberto por um botão
   `Categorias` no header, com contagem por categoria, barra de prontas, grupos
   DINTEC mapeados, renomear/mesclar/excluir e cadastro de categoria nova.
2. **Item 3 — “Margem e Giro na lista (Owner/Gestor)”**: as duas colunas
   comerciais deveriam ser restritas por papel. O #490 não fez isso.

---

## O achado que decidiu o desenho

`PartCategory` era um **union fechado de 10 slugs em TypeScript**. Não existia
tabela de categorias em lugar nenhum: `parts.category` é `text` puro no
Postgres — sem enum, sem CHECK, sem FK (`20260608150303_create_parts_table_v2.sql`).
A taxonomia estava espalhada por **~19 listas hardcoded** em storefront,
indicadores, sales/inventory/profitability analytics, portal B2B, NLP de
identificação e mocks, com **3 conjuntos de ids divergentes**
(`filtro` / `filtros` / `freios`).

Ou seja: o banco sempre aceitou qualquer categoria; era o código que fechava.

### Decisão: override-and-extend, não substituição

A tabela `part_categories` **não substitui** os 10 builtins — ela os sobrepõe:

- Os builtins continuam em código e são o **fallback garantido**.
- Uma linha com o mesmo `value` **customiza** um builtin (rótulo, ícone, cor).
- Uma linha com `value` novo **adiciona** uma categoria.
- A tabela **nasce vazia**, então a migration é inerte e o app se comporta
  exatamente como antes até alguém usar o drawer.

O efeito prático: se a migration nunca for aplicada, se a RLS bloquear ou se a
query falhar, a tela mostra os 10 builtins — o comportamento de hoje. Nada
quebra por ausência de dado.

**A chave de junção é `value`, não `id`.** `parts.category` guarda o slug e
precede a tabela; pôr uma FK agora rejeitaria as ~1.981 peças com categoria
`NULL` e todo snapshot histórico em `order_items.part_category`.

---

## O que foi implementado

### Banco

`supabase/migrations/20260814180000_part_categories_catalog.sql` — tabela
`public.part_categories` (store-scoped), RLS espelhando `conversation_tags`:
SELECT para qualquer membro da loja, escrita **Owner-STRICT**. CHECK de slug
kebab-case; unique em `(store_id, value)` e em `(store_id, lower(label))`.

> ⚠️ **A migration NÃO foi aplicada.** Mergear o PR não aplica — a aplicação em
> produção é manual e exige OK expresso do dono. Enquanto isso, o app roda nos
> builtins, sem erro.

### Cor: por que paleta e não classe

`color` guarda um **id de paleta** (`emerald`), nunca uma classe Tailwind. O
Tailwind v4 gera classes varrendo o código-fonte em build; uma classe vinda do
banco em runtime **simplesmente não existiria** na folha de estilo. `categoryTone()`
resolve o id contra `PART_CATEGORY_PALETTE`, um mapa de strings literais — e há
teste garantindo que nenhum tom seja construído por interpolação.

### Camada de dados

| Arquivo | Papel |
|---|---|
| `providers/data/contracts/partCategories.ts` | `list` / `save` (upsert por `value`) / `delete` |
| `providers/data/impl/mock/partCategories.ts` (+ teste) | catálogo em memória, nasce vazio |
| `providers/data/impl/supabase/partCategories.ts` | mapper fino, upsert em `store_id,value` |
| `providers/data/hooks/usePartCategoriesProvider.ts` | fatia do provider |

### Tipo aberto

```ts
export type BuiltinPartCategory = "filtro" | ... ;         // os 10, para autocomplete
export type PartCategory = BuiltinPartCategory | (string & {});
```

Abrir o union quebrou **zero** arquivos — inclusive o único erro de compilação
previsto (`Record<PartCategory, string>` em `NewIndicatorPage`) deixou de existir,
porque `string & {}` alarga o Record para índice livre.

### Taxonomia viva

- `utils/categories.ts` — builtins, paleta, `mergeCategoryDescriptors`,
  `toCategorySlug`, `isCategorySlug` (+ 22 testes).
- `hooks/useCategoryDescriptors.ts` — **leitura**, barata o bastante para uma
  célula de tabela; degrada para os builtins em erro.
- `useCategoryAdmin()` — **escrita**, separada de propósito: renderizar uma
  linha não pode registrar observer de mutation.

### Drawer (item 9)

`components/list/CatalogCategoriesDrawer.tsx` — cada família com contagem real,
barra de prontas, grupos DINTEC presentes; “Sem categoria” em vermelho no rodapé
com atalho **Triar**; formulário de criação (nome + ícone + cor).

**Renomear / Mesclar / Excluir — o que é honesto em cada caso:**

| Ação | Builtin | Criada pelo usuário |
|---|---|---|
| Renomear / recolorir | ✅ cria linha de override | ✅ edita a linha |
| Mover peças para outra | ✅ reatribuição em lote | ✅ |
| Excluir | ❌ **Arquivar** — vive no código, não dá para apagar | ✅ só com 0 peças |

O kit rotula a ação como “Mesclar com…”. Aqui ela chama-se **“Mover peças
para…”**: como o slug é a chave de junção e o builtin vive no código, mesclar de
verdade (sumir com a origem) não é possível — o que dá para fazer é esvaziar.
Rotular de “mesclar” seria mentir sobre o resultado.

### Gate de permissão (item 3)

Margem e Giro passam a exigir `usePermission("profitability", "view")` — o mesmo
recurso que guarda a tela de Rentabilidade, concedido a **Owner, Gestor e
Financeiro**. Vale nas duas visões e no menu de colunas; **uma preferência salva
em `localStorage` não alarga acesso**, porque o conjunto visível é interseccionado
com o permitido a cada render.

Era um vazamento real: antes deste PR, um Vendedor lia custo e margem em toda
linha do catálogo.

### Sweep dos consumidores

Passaram a ler a taxonomia viva: filtros e barra de massa da lista, visão
agrupada, células de linha, ficha (`PartIdentityCard`), grade de categorias da
nova peça (`PartCategoryGrid`, do #492) e os selects de **sales-analytics**,
**inventory-analytics** e **profitability**.

Os 4 validadores de URL que testavam contra a lista fechada foram abertos com
`isCategorySlug` — cujo regex é byte-a-byte o CHECK da migration. Sem isso, uma
categoria nova aplicaria o filtro e o select apareceria em branco.

---

## O que deliberadamente NÃO mudou

- **Storefront público** (`storefront*`, `storefront-category`, `storefront-search`)
  — é anônimo e não lê a tabela store-scoped. Fica nos builtins. Os slugs
  públicos já são desacoplados de propósito (`slugs.ts` documenta isso), e mexer
  neles é mexer em SEO.
- **`PartImage`** ganhou um prop opcional `descriptors` em vez de chamar o hook:
  ele é usado em ~8 telas da loja pública, e embutir o hook dispararia uma query
  store-scoped em cada página anônima.
- **`part-identification/**`** — taxonomia própria de keywords do NLP.
- **Os 3 id-sets divergentes** (`filtro`/`filtros`/`freios`) — as pontes de
  conversão já existem e funcionam; unificá-las é refactor de SEO e de mocks,
  fora do escopo desta entrega.
- **`order_items.part_category`** é snapshot histórico e **não segue rename** —
  por desenho: um pedido de 2024 deve dizer como a categoria se chamava em 2024.

---

## Validação

| Gate | Resultado |
|---|---|
| `bun run test` | **3.580 testes / 406 arquivos — todos passando** (30 novos: 22 taxonomia + 8 provider) |
| `bun run build` | ✓ built |
| `bunx tsc --noEmit` | **0 erros** nos arquivos tocados (382 no total, todos baseline pré-existente) |
| `bunx eslint` nos arquivos tocados | **0 erros** |

**Não validado:** smoke manual — por convenção, quem testa a UI é o dono.

## Pendências

- [ ] 🔴 Aplicar a migration `20260814180000_part_categories_catalog.sql` em
      produção (manual, exige OK do dono). Sem ela o drawer é leitura + triagem.
- [ ] Smoke: criar categoria, renomear builtin, arquivar, mover peças, triar.
- [ ] Verificar com um usuário Vendedor que Margem e Giro sumiram mesmo.
- [ ] Decidir se `ProductSelectorField` (indicadores) entra no sweep — depende de
      uma história de i18n própria.
