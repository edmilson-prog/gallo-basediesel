# Refatoração do cadastro de peça pelo `ui_kits/catalog/nova-peca`

**Data:** 2026-08-14
**Tela:** `/app/catalogo/novo` — cadastro de peça
**Fonte da verdade:** projeto Claude Design "GALLO Base Diesel — Design System",
`ui_kits/catalog/nova-peca/index.html` (+ `np-ui.jsx`, `np-form.jsx`, `np-fitment.jsx`),
reusando `ui_kits/catalog/lista/cl-ui.jsx`

Diferente da ficha (PR #483), esta não é passada de fidelidade: a tela é **reescrita**.
O `PartForm` tinha um único consumidor — `PartNewPage` — porque a edição de peça mora nas
seções inline da ficha (`components/detail/`). Isso deu liberdade para mudar a estrutura sem
tocar em nenhuma outra tela.

## O que a tela era

Uma pilha vertical de 6 `fieldset` numa coluna `max-w-4xl`, todos com o mesmo peso visual:
Identificação → Categoria → Aplicações → Equivalências → Comercial → Estoque. Mais:

- **Duplicata só no submit.** `provider.findByOem(primaryOem)` rodava depois de tudo
  preenchido; o erro voltava como texto vermelho num campo lá em cima. Com 2.778 linhas na
  base, é assim que nascem os duplicados.
- **Categoria num `Select`** — 10 opções escondidas atrás de um clique, no campo que mais
  falta na base (1.981 peças sem categoria).
- **Preço solto.** Um `unitPrice` digitado, sem custo obrigatório, sem margem à vista e sem
  as 5 tabelas do ERP que a ficha mostra.
- **Referências cruzadas fora do cadastro.** `PartCrossReferenceEditor` existia e era usado
  só na ficha — a busca por código de concorrente nascia cega.
- **`Switch` Original/Equivalente** sem dizer o que cada estado significa.
- **Estoque mínimo mudo** — o campo que decide se a peça entra na fila de reposição não
  dizia isso.
- **Botão apagado sem explicação** quando faltava algo.

## O que a tela é agora

| Item | Antes | Agora (kit) |
|---|---|---|
| Container | `max-w-4xl`, `py-6` | `max-w-[1360px]`, `pt-[22px] px-4 sm:px-[26px]` (mesmo da ficha) |
| Header | botão "Voltar" + `h1 text-xl` | breadcrumb + `h1 font-display text-[24px] uppercase` + chip "SKU automático" + selo vivo de completude |
| Estrutura | 6 fieldsets empilhados | faixa de código → 2 colunas de trabalho → "Onde ela serve" full width |
| Código | campo comum no meio da Identificação | **faixa própria no topo**, `size="lg"` mono, consultado ao digitar |
| Categoria | `Select` | grade de 10 tiles + subcategoria em chips |
| Comercial | preço + custo soltos | custo + markup → margem colorida + as 5 tabelas do ERP |
| Refs. cruzadas | ausentes no create | presentes, ao lado das equivalências |
| Origem | `Switch` | dois estados nomeados (`role="radiogroup"`) |
| Rodapé | botões alinhados à direita | sticky, com `Falta: código · categoria` e "Salvar e cadastrar outra" |
| Tipografia | 100% Barlow | `font-display` (Saira Condensed) em códigos, preços e margem |

## O código vem primeiro

É o único campo que já existe fisicamente — na caixa e na nota — e o único que consegue
dizer "isso já está na base" antes do resto ser digitado.

- **Debounce de 400 ms** (`usePartCodeLookup`), `provider.list({ search, pageSize: 10 })`.
- O servidor faz `ilike` em `name`, `sku`, `brand` e `oem_codes_text`; o veredito exato sai
  de `findDuplicateByCode` (engine), que casa **SKU, códigos OEM, referências cruzadas** e
  **tokens do nome cru** — nas linhas do DINTEC o código nunca ganhou coluna e vive dentro
  do nome (`"00313366 — UFI"`), e é dali que vêm os duplicados.
- Casamento **exato**, nunca por substring: bloquear `C205` porque existe `C20500` seria um
  guarda que as pessoas aprendem a contornar.
- **Falha aberta.** Catálogo fora do ar não bloqueia o cadastro — o problema é nosso, e a
  peça está no balcão.
- Rede final no submit: `findByOem` de novo, para a corrida de duas pessoas lançando a
  mesma nota. Se essa chamada falhar, também não bloqueia.

## Régua de preços

`custo + markup Padrão` alimentam `buildPriceTables()` — as 5 tabelas
(Padrão/Ecommerce/Oficina/Varejo/Atacado) aparecem no próprio cadastro, cada uma com a
margem sobre a venda colorida por `marginHealth` (≥45% `success`, ≥30% `warning`, abaixo
`critical`). Sem custo, o preço entra direto e a margem é **declarada desconhecida**, não
mostrada como zero.

**As 5 tabelas não são persistidas.** `resolvePriceTables()` já as deriva de
`unitCost + marginPercent` na leitura; gravar um retrato aqui só criaria uma cópia que
diverge na primeira vez que alguém editar o custo.

## Camada de regras (nova, testada)

`src/features/catalog/engine/` — 41 testes, escritos antes do código.

- `newPart.ts` — `derivePartCodeState` (enum único do campo: `idle → typing → loading →
  duplicate | free | error`), `canSubmitCode`, `resolveStandardPrice`, `isSaleReady`,
  `missingRequirements`.
- `partCodeMatch.ts` — `findDuplicateByCode`.

Mesmo desenho da máquina de estados do "Novo cliente" (`engine/newCustomerLookup.ts`),
inclusive a guarda de *lookup* defasado: enquanto o debounce não alcança o que está
digitado, o estado é `loading` e o submit fica travado.

## Decisões de tradução do kit

- **Cor da categoria fica só no ícone.** Os 10 `tone` de `categories.ts` são cores cruas do
  Tailwind e significam "qual família". A **seleção** usa `border-primary bg-primary/10` +
  glifo `mdi:check` + `aria-pressed`: reusar a cor da família para dizer "foi esta que
  escolhi" deixaria o estado ilegível para quem não separa emerald de lime.
- **Margem e saúde via `severity-*`**, não hex — `marginHealth` já devolve
  `success|warning|critical`, que são os nomes dos tokens.
- **Sem cor de fundo dourada fixa**: o dourado do kit é o `primary` do tema `diesel`; usar o
  token faz a tela seguir os 4 temas e os 2 modos.

## Desvios conscientes do kit

- **A checagem não cobre referência cruzada isolada.** `cross_references` é `jsonb` sem
  coluna de texto gerada, então não entra no `ilike` do servidor — só é conferida entre as
  linhas que a busca já trouxe. Um código que exista **apenas** como referência cruzada
  ainda escapa. O copy na tela diz o que é verdade ("SKU, OEM ou nome"), não o que o kit
  prometia. Correção real = coluna gerada `cross_references_text` + índice, igual a
  `oem_codes_text`.
- **Sem datalist de marca/modelo de veículo.** O kit sugere veículos a partir de uma base
  fixa (`NP_VEH`); o app não tem essa lista canônica exposta ao catálogo. Preferi o
  `ApplicationsEditor` que já existe a inventar um beco de sugestões.
- **`priceLocked` continua não sendo passado no cadastro.** Na ficha, preço é Owner-only;
  no cadastro nunca foi. Travar agora impediria não-Owner de cadastrar peça com preço —
  mudança de RBAC, não de layout. Fica registrado, não alterado.
- **Geração de SKU inalterada** (`GAL-NEW-<timestamp>`): fora do escopo do kit.
- **Estoque não é copiado na duplicação** — a cópia é outra peça, em outra prateleira.

## Régua de "pronta para venda": uma só, compartilhada com a lista

O PR #490 (lista do catálogo) mergeou durante esta refatoração e trouxe
`src/features/catalog/utils/completeness.ts` com `isReadyToSell(part: IPart)` — a mesma
regra que esta tela precisa. Em vez de deixar duas cópias, a regra foi **extraída para um
núcleo único**:

```ts
// utils/completeness.ts
export function isSaleReadyFrom(facts: ISaleReadyFacts): boolean
```

`ISaleReadyFacts` são os fatos crus (`hasCategory`, `hasManufacturer`, `hasCost`, `hasCode`,
`hasApplication`), independentes de onde vieram. A lista os lê de uma `IPart` salva
(`isReadyToSell`); o formulário os lê dos campos, que ainda são strings numa caixa de texto
(`engine/newPart.ts` → `isSaleReady`). **A regra é escrita uma vez.**

Uma terceira cópia divergente desta regra é um problema que o projeto já teve
(`project_root_route_permission_wall`); esta é a chance de não repetir.

`i18n/pt-BR.ts` recebeu blocos dos dois PRs, em regiões diferentes do mesmo objeto — o merge
saiu sem conflito.

## Validação

- `bun run test` — 400 arquivos, **3477** testes, todos passando (baseline 3436 + 41 novos).
- `bun run build` — ✓.
- `bunx tsc --noEmit` — **zero** erros em `src/features/catalog` (baseline do repo intacto).
- `bunx eslint` — zero erros; o único aviso (`react-refresh/only-export-components` em
  `PartNewPage.tsx`, por causa de `validatePartNewSearch`) é pré-existente.
- **Pendente: smoke visual do dono** nos 2 modos (claro/escuro), em ~1366px e em mobile,
  com: código livre × código duplicado × catálogo fora do ar; com custo × sem custo;
  e o caminho "Salvar e cadastrar outra".

Sem migration, sem Edge Function, sem mudança de contrato de dados.
