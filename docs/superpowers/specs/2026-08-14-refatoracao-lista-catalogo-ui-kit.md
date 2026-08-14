# Refatoração da lista do catálogo pelo ui_kit `catalog/lista`

**Data:** 2026-08-14
**Branch:** `worktree-catalog-lista-ui-kit`
**Fonte da verdade:** projeto Claude Design “GALLO Base Diesel — Design System”
(`0dddcf0e-782d-4f2e-be6c-0a094c427bbe`), arquivos:

- `ui_kits/catalog/lista/index.html` (alvo)
- `ui_kits/catalog/lista/cl-ui.jsx` — paleta, dados, primitivas (`ClChip`, `ClCatTile`, `ClBtn`)
- `ui_kits/catalog/lista/cl-shell.jsx` — cabeçalho, faixa de completude, filtros, barra de massa
- `ui_kits/catalog/lista/cl-table.jsx` — Direção A (mesa de trabalho)
- `ui_kits/catalog/lista/cl-groups.jsx` — Direção B (por categoria)
- `colors_and_type.css` — fundações de cor e tipografia

Antecedente: PR #483 refez a **ficha** de produto pelo mesmo kit. Nada em
`components/list/` havia sido tocado — a lista estava 100% no estado pré-kit.

---

## Tese do kit

O catálogo da GALLO **não é uma referência pronta**: a importação do DINTEC
deixou ~2.778 peças meio preenchidas (sem categoria, sem fabricante, sem OEM,
sem aplicação, sem custo). O kit trata a lista como **fila de enriquecimento**,
não como navegador de produtos. Três consequências de projeto:

1. **A faixa de completude** (“a faixa que faltava”, nas palavras do kit) põe o
   tamanho do backlog em números absolutos sobre a base inteira — e cada número
   é um filtro, de modo que ler o problema e começar a resolvê-lo é o mesmo gesto.
2. **Nenhuma célula mostra vazio.** Ela diz *o que falta* e, quando dá, oferece a
   ação que corrige (`Repor 8 →`, `desativar?`).
3. **A correção é por lote.** Selecionar linhas flutua a barra de massa com as
   três correções que de fato movem os números de completude.

## Decisões tomadas com o dono

| Questão | Decisão |
|---|---|
| O kit traz duas direções (A · mesa de trabalho, B · por categoria) | **A como base + B como seletor de visão** numa única tela. Evita o débito de “A e B convivendo no ar” que a ficha do cliente deixou. |
| Kit é dark puro com hex fixo (`#141011`, dourado `#E0BB4E`) | **Traduzir para tokens semânticos.** Estrutura, densidade e hierarquia fiéis; cor por `bg-background` / `text-foreground` / `severity-*`, funcionando em claro e escuro (exigência do `CLAUDE.md`). |

---

## O que foi implementado

### Lógica de negócio (pura, testada)

| Arquivo | Papel |
|---|---|
| `utils/completeness.ts` | Modelo de completude: `missingFields`, `isReadyToSell`, `needsRestock`, `isDeadStockCandidate`, buckets de cobertura e `countCoverage` (uma passada só). |
| `utils/turnover.ts` | Giro por peça a partir de pedidos pagos: `buildTurnoverIndex`, `turnoverFor`, janela de 12 meses. |
| `utils/csvExport.ts` | Export CSV pt-BR (`;`, CRLF, BOM) com guarda contra CSV injection. |

**Regras que valem registrar:**

- *Pronta para venda* = categoria + fabricante + custo + (OEM **ou** aplicação).
  Faltar só um dos dois últimos ainda é vendável; faltar os dois torna a peça
  inencontrável no balcão.
- *Custo 0 significa “nunca preenchido”*, não “de graça” — nada no catálogo é
  de graça.
- *Repor* exige `stockAvailable <= 0` **e** `stockMinimum > 0`. Peça zerada sem
  mínimo não é sinal de compra: ninguém disse quanto a prateleira deveria ter.
- *Candidata a desativar* nunca dispara com giro desconhecido (`null`) — só com
  um zero de verdade.

### UI

| Arquivo | Estado | Papel |
|---|---|---|
| `components/list/CatalogCoverageBar.tsx` | novo | Faixa de completude — 7 buckets clicáveis, contagens sobre a base inteira. |
| `components/list/CatalogRowCells.tsx` | novo | Todas as células do kit: identidade, códigos, categoria, ficha, preço, margem, giro, estoque + `CategoryTile`. |
| `components/list/CatalogBulkBar.tsx` | novo | Barra flutuante de seleção: definir categoria, definir fabricante, exportar, desativar. |
| `components/list/CatalogGroupedList.tsx` | novo | Direção B — grupos com barra de cobertura e bloco “Sem categoria” como fila de triagem. |
| `components/list/CatalogTable.tsx` | reescrito | Direção A com seleção, novas colunas e as células do kit. |
| `components/list/CatalogFiltersBar.tsx` | editado | Bucket “Repor” + seletor de visão Lista/Por categoria. |
| `components/list/CatalogHeader.tsx` | editado | Título em `font-display` maiúsculo (o kit usa Saira Condensed). |
| `hooks/useCatalogTurnover.ts` | novo | Janela de pedidos para o giro — **desligada** até a coluna ser ligada. |
| `pages/CatalogListPage.tsx` | editado | Costura seleção, completude, giro e as duas visões. |

### Colunas

Conjunto padrão passa a ser o do kit: **Peça · Códigos · Categoria · Ficha ·
Preço · Margem · Estoque**. `Fabricante` e `Status` saem do padrão porque o kit
os dobra dentro da célula de identidade — continuam disponíveis no menu de
colunas. `Aplicações` e `Giro` também ficam disponíveis, desligadas.

A chave de `localStorage` virou `gallo-catalog-columns-v2`: sem o bump, quem já
usava a tela nunca veria as colunas novas, porque o conjunto salvo vencia o
default.

### Estado na URL

Dois parâmetros novos, ambos omitidos quando estão no default:
`cov` (bucket de completude) e `view` (`table` | `grouped`).
`clearAll` limpa `cov` mas **preserva** `view` — visão é preferência, não filtro.

### Ações reais (não decorativas)

O kit é um protótipo: seus botões disparam toast. Aqui todos fazem trabalho real
via `partsProvider.update`, em lotes de 5 para não inundar o provider, com
invalidação das duas queries do catálogo ao final:

- **Definir categoria / fabricante / Desativar** — gated por `usePermission("part", "edit")`,
  com diálogo de confirmação; falhas parciais são reportadas com a contagem.
- **Exportar** — CSV client-side, sem servidor.
- **Repor N →** — copia o resumo de pedido de compra (reusa `buildRestockSummary`
  da ficha).
- **desativar?** — seleciona a peça e deixa a barra de massa fazer o resto. É o
  desfecho honesto: o kit só mostrava um toast.

---

## Desvios da fonte da verdade — e por quê

### 1. `nome cru` / `ERP:` não foi implementado

O kit distingue o nome **limpo** proposto (`p.clean`) do nome **cru** do ERP
(`p.raw`), mostrando um por cima do outro e um chip `nome cru` quando não há
proposta de limpeza. **`IPart` não tem esse par** — só `name`. Não existe campo,
migration ou heurística confiável para derivar um do outro, e inventar uma
regra de limpeza automática seria criar dado do nada.

O que sobrou no lugar: a segunda linha da célula de identidade traz SKU +
fabricante (ou `sem fabricante`), e a célula de categoria expõe `part.group` — o
grupo cru do DINTEC — que é a pista real para classificar a peça.

**Para fechar essa lacuna** seria preciso um campo novo (ex.: `rawName`) populado
no import, com migration exportada para `supabase/migrations/`.

### 2. Giro é opcional e vem desligado

`IPart` não carrega rotatividade. A única fonte é uma janela inteira de pedidos
(`ordersProvider.list`), que é uma ordem de grandeza mais pesada que a própria
lista — e este repositório tem histórico de `statement_timeout` por fetch amplo.
Some-se a isso que **produção não tem pedidos**: ligada por padrão, a coluna
marcaria “nunca vendida” em 100% do catálogo e dispararia a sugestão
`desativar?` na base inteira.

Solução: a coluna existe, ordena e renderiza exatamente como no kit, mas nasce
desligada e sua query fica `enabled: false` até alguém ligá-la. Enquanto o índice
é `null`, a célula mostra `—`, nunca “nunca vendida”.

### 3. A visão agrupada agrupa a página, não a base

O kit agrupa a amostra inteira. Aqui a Direção B agrupa a **página corrente** —
agrupar as ~2.778 peças de uma vez renderizaria milhares de linhas e quebraria a
paginação. Os cabeçalhos de grupo dizem “N nesta página” em vez de “N na amostra”,
para não sugerir que o número é da base.

### 4. Barra de completude conta a base, a tabela mostra o recorte

Fiel ao kit (“números da base inteira · a tabela abaixo é uma amostra”). As
contagens saem da query `catalog-all-for-filters`, que a página já fazia.

---

## Validação

| Gate | Resultado |
|---|---|
| `bun run test` | **3.490 testes, 401 arquivos — todos passando** (54 novos: 26 de completude, 12 de giro, 16 de CSV) |
| `bun run build` | **✓ built** |
| `bunx tsc --noEmit` | **0 erros** em `src/features/catalog` (baseline pré-existente do repo intocado) |
| `bunx eslint src/features/catalog` | **0 erros**, 1 warning pré-existente (`PartNewPage`, fast-refresh) |

**Não validado:** smoke manual no browser — por convenção do projeto, quem testa
a UI é o dono.

## Pendências conhecidas

- [ ] Smoke manual: faixa de completude, seleção em massa contra o Supabase real,
      export CSV, alternância Lista ⇄ Por categoria.
- [ ] Decidir se `rawName` entra no modelo (desvio 1).
- [ ] Avaliar ligar a coluna Giro depois que produção tiver pedidos
      (ver `project_prod_has_no_orders`).
- [ ] `useCatalogList` continua puxando o catálogo inteiro e paginando no
      cliente — débito pré-existente, não tocado aqui.
