# Refatoração da ficha de produto pelo `ui_kits/catalog`

**Data:** 2026-08-13
**Tela:** `/app/catalogo/$id` — detalhamento de produto (ERP)
**Fonte da verdade:** projeto Claude Design "GALLO Base Diesel — Design System",
`ui_kits/catalog/index.html` (+ `cat-ui.jsx`, `cat-detail.jsx`, `cat-content.jsx`, `colors_and_type.css`)

A tela já existia (PR #330). Esta passada é de **fidelidade ao kit**, não de arquitetura:
o `index.html` do kit descreve exatamente o modo **Balcão**, e era dele que a implementação
mais se afastava.

## O achado central: a tela não usava a tipografia da marca

`grep font-display src/features/catalog` retornava **zero**. O kit usa `--font-display`
(Saira Condensed, uppercase) em tudo que é número estrutural — valores dos KPIs (26px), nome
do produto (22px), preços da tabela (17px), custo do fornecedor (16px). A ficha era 100%
Barlow, e era isso que a fazia parecer genérica ao lado do kit.

Mesmo diagnóstico da ficha do cliente (PR #482). **Ao implementar qualquer ui_kit, cheque
primeiro se `font-display` está aplicada** — é o gap mais barato e mais visível.

## Mudanças de layout

| Item | Antes | Agora (kit) |
|---|---|---|
| Grid do Balcão | `grid-cols-12` (4/8 ≈ 33%/67%) | `lg:grid-cols-[440px_1fr]`, gap 16 |
| Largura do conteúdo | `max-w-[1600px]` | `max-w-[1360px]`, padding `22px 26px 40px` |
| Header de ações | barra full-bleed com `border-b` | bloco dentro do container, "Voltar" como link plano |
| Seletor de modo | `ToggleGroup` outline solto | poço único (`bg-muted/40`, radius 9), ativo em `bg-primary` |
| Abas | `TabsList` solta + cards separados | **um card só**: faixa de abas + corpo `p-[18px]` |
| Histórico de preço | link dentro do card de preços | painel colapsável próprio, abaixo do card, só na aba Comercial |
| Identidade | bloco GTIN em caixa + grid de 3 chips | eyebrow `Cód.` + h1 display + chips + **spec rows** |
| Fiscal / Logística | caixinhas `Field` | `PartSpecRow` em grid de 2 colunas |
| Fornecedores | `<table>` de 6 colunas | lista de cards (ícone, nome, chip "Última compra", custo display) |
| Tabela de preços | 4 colunas, estrela no padrão | 5 colunas, chip "Padrão", preço display, lápis por linha |

## Primitivas novas

Espelham `CatCard` / `CatChip` / `CatSpecRow`, traduzidas para tokens semânticos:

- `PartPanel` — superfície com header (ícone + título + slot `right`) separado por régua.
- `PartChip` — chip uppercase/tracked/bold, radius 6 (**não** pill), tons `neutral | info |
  success | warning | critical` × variantes `soft | ghost | solid`.
- `PartSpecRow` — label uppercase de 104px + valor + slot de ação + botão copiar.

## Padrão que protegeu os outros dois layouts

`PartPricingTable`, `PartFiscalCard`, `PartLogisticsCard` e `PartSuppliersTable` são
compartilhados com os layouts **Painel** e **Ficha**. Todo tratamento do kit entrou por
**prop opt-in com default byte-a-byte igual**:

- `headless` — remove o chrome de card (só o Balcão passa, porque o painel de abas já é o card).
- `showHistory` (default `true`) — o Balcão passa `false` e renderiza o histórico como painel.
- `onRequestEdit` — habilita o lápis por linha; sem ele a coluna de ação não existe.

Mesma ideia do `variant="detail"` usado na ficha do cliente.

## Desvios conscientes do kit (não são bugs)

- **Sem botão "adicionar foto"** — o kit tem o botão de câmera flutuante na miniatura, mas o
  app não tem upload de imagem de peça. Um botão inerte seria mais um beco
  (ver `project_agenda_placeholder_action_dead_ends`).
- **Sem chip "Primária/Secundária"** nas aplicações — `IApplication` não tem esse campo. A
  linha secundária segue mostrando motor + faixa de anos, que é o dado real.
- **Original destacado, Equivalente neutro** — o kit pinta "Equivalente" de dourado porque o
  produto de exemplo é equivalente. Preservada a semântica do app (Original = destaque).
- **Códigos em `font-mono`, não `--font-semicond`** — Barlow Semi Condensed não está carregada
  no app; `font-mono` já é a convenção para códigos (mesma decisão da ficha do cliente).
- **Peso display 700, não 800** — o `index.html` do app carrega Saira Condensed em 400/600/700.
  Subir para 800 encareceria o carregamento de fonte de todas as telas.
- **Faixa de KPIs responsiva** — o kit fixa 5 colunas (1440px); mantido `2 / 3 / 5` por
  breakpoint. Em `lg` o resultado é idêntico ao kit.
- **`<table>` preservada** nas tabelas de preço — o kit usa CSS grid; a semântica de tabela de
  dados vale mais que a paridade de mecanismo, e o resultado visual é o mesmo.

## Validação

- `bunx tsc --noEmit` — **zero** erros em `src/features/catalog` (baseline do repo intacto).
- `bun run build` — ✓.
- `bun run test` — 393 arquivos, **3310** testes, todos passando.
- `bunx eslint src/features/catalog` — sem erros novos; o único aviso
  (`react-refresh/only-export-components` em `PartNewPage.tsx`) é pré-existente.
- **Pendente: smoke visual do dono** nos 2 modos (claro/escuro) e nos 3 layouts
  (Balcão / Painel / Ficha), com peça completa × peça sem GTIN/fornecedor/aplicações.

Sem migration, sem Edge Function, sem mudança de contrato de dados.
