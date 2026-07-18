# Import de Produtos DINTEC — Design

> **Para agentes:** REQUIRED SUB-SKILL: use superpowers:writing-plans para transformar este design num plano de implementação task-by-task.

**Objetivo:** trazer produtos reais e identificáveis para o catálogo (`parts`) da plataforma, combinando três fontes de dados reais — o ERP DINTEC (Firebird), uma cotação de fornecedor (UFI) e uma lista de aplicação de outro fornecedor (Turbo Filtros) — seguindo o mesmo padrão de import assistido pelo agente (dry-run + revisão, sem tela de upload) já usado no import de clientes (`docs/superpowers/specs/2026-07-10-dintec-customer-import-design.md`).

**Arquitetura:** dois pipelines de script independentes e aditivos (sem conflito de dados entre si, confirmado por cruzamento de SKU e código de barras): (1) enriquecimento + criação a partir das planilhas de fornecedor, (2) criação a partir do catálogo DINTEC/Firebird. Ambos reaproveitam o padrão validado em `scripts/dintec-import/` (idempotência paginada, batching, backup pré-escrita, gate `DINTEC_CONFIRM_WRITE`).

**Tech Stack:** scripts TypeScript standalone (`scripts/dintec-import/`), Supabase JS client com `service_role`, parsing de `.xlsx` sem dependência nova (zip + XML, ver Task de parsing), export CSV do Firebird via `isql` embedded (mesma técnica de `docs/db/GUIA-BANCO-TURBO-DIESEL.md`).

## Contexto — como chegamos aqui

O catálogo de peças (`parts`, tabela Supabase, migration `20260608150303_create_parts_table_v2.sql`) tem hoje **351 linhas**, e é uma mistura de duas origens bem diferentes — confirmado por SKU, nome, custo e referências cruzadas com `quote_items`:

- **151 linhas reais** (SKU no formato `NN.NNN.NN`, sem prefixo `GAL-`), extraídas de duas planilhas de fornecedor:
  - `docs/export/2024.11.14 Cotação Turbo Diesel UFI.xlsx` — cotação de preço da UFI (fabricante de filtros) para a Turbo Diesel, 1.532 produtos, com custo/preço, dados fiscais, aplicação veicular e referências cruzadas de 10 marcas concorrentes.
  - `docs/export/APLICAÇÃO JAN-2025 TURBO FILTROS.xlsx` — lista de aplicação da Turbo Filtros (outro fabricante), 1.387 produtos, sem preço, focada em aplicação veicular e referências cruzadas de 12 marcas.

  Confirmado por comparação direta (nome + custo batendo exatamente, ex.: SKU `19.008.00` = "Chave Para Desmontagem De Filtro", custo R$302,56 em ambos os lados). O gerador que semeou essas linhas usou uma amostra das planilhas (aparentemente aleatória, não curada por "o que a loja realmente vende" — só 25 dos 138 itens UFI marcados como efetivamente comprados já estão na base) e sintetizou por cima `unit_price`, `created_at`, e perdeu `oem_codes`/código de barras.

- **200 linhas mock puro** (SKU `GAL-XXX-NNNN`), com marcas que não aparecem em nenhuma das duas planilhas ("Cummins OEM", "Eaton", "Garrett", "Genuine Parts", "ZF Aftermarket", "Knorr", "WABCO" — nomes de marca templados, categorias genéricas de freio/motor/elétrica/suspensão/lubrificantes, vários `unit_cost = 0`). Faker convencional, sem vínculo com nenhuma fonte real. Vinculadas a 33 `quote_items` em 13 orçamentos — **todos com `customer_id IS NULL`**, ou seja, seed órfão da mesma leva limpa no import de clientes (`docs/dev/dintec-providers.md` / limpeza dos 70 clientes fictícios), não orçamento de cliente real.

**Nenhuma das duas fontes de fornecedor (nem o Firebird) tem sobreposição com as 151 linhas reais existentes ou entre si** — testado por `REFERENCIA` (0/148 SKUs batem), por código de barras (0/1.338 batem). São três universos de dados complementares, não conflitantes.

## Fontes de dados — achados

### Fonte 1: Firebird DINTEC (`PRODUTO`, `GRUPO`, `PRODUTOECOMMERCE`, `PRODUTOFORNECEDOR`, `FORNECEDOR`)

8.373 produtos cadastrados, 8.200 ativos. **Sem coluna de nome/descrição própria** — identidade vem de `REFERENCIA` (16,4% preenchida) ou de `PRODUTOECOMMERCE.DESCRICAO` (2.394 linhas, tabela paralela de e-commerce). **Escopo: 2.514 produtos ativos identificáveis** (têm `REFERENCIA` OU descrição via `PRODUTOECOMMERCE`). Os outros 5.686 ativos (69%) são estoque real (96,6% com custo > R$1) mas sem nenhum nome/referência — ficam de fora deste import.

Achados-chave, todos confirmados com dado real e/ou print da tela do DINTEC:

| Campo GALLO | Coluna Firebird | Observação |
|---|---|---|
| `sku` | `PRODUTO.CODPRO` | Único, 100% cobertura, chave interna do DINTEC |
| `name` | `REFERENCIA` + `MARCA`, ou `PRODUTOECOMMERCE.DESCRICAO` | Texto rico tipo "FILTRO AR EXTERNO AGRALE..." visto na tela **não está em nenhuma tabela local** — vem de consulta externa inacessível a nós. Usar o que temos. |
| `category` | **não mapeado** — fica `null` | `IPart.category` é `PartCategory`, um enum fechado de 10 valores (`filtro`\|`freio`\|`correia`\|`motor`\|`embreagem`\|`eletrica`\|`transmissao`\|`suspensao`\|`arrefecimento`\|`lubrificante` — `src/shared/types/part-identification.ts`) usado pelo extrator por palavra-chave do PRD-021, não uma taxonomia de negócio livre. `GRUPO.NOME` (Filtros, Sensores, Bicos Injetores, Bombas de Alta Pressão, "MANN"...) não mapeia 1:1 nesse enum e forçar mapeamento arriscaria classificar errado uma feature voltada ao cliente final. `GRUPO.NOME` vai só em `subcategory`/`group_label` (texto livre). |
| `unitCost` / `averageCost` | `CUSTO` | 99,1% preenchido |
| `unitPrice` | `VALOR5` (faixa **VAREJO**) | Confirmado com print real: `OFICINA`=`VALOR3`/`PERC3` (100% markup), `ATACADO`=`VALOR4`/`PERC4` (60%), `VAREJO`=`VALOR5`/`PERC5` (80%), `ECOMMERCE`=calculado via `PERC2` (140%, não persistido em coluna própria) |
| `priceTables[]` | as 4 faixas acima | ~50% dos 2.514 têm as 3 faixas persistidas preenchidas |
| `fiscal.ncm/icmsPercent/taxSubstitution/origin` | `NCM`, `ICMS`, `TIPOSUBST`, `ORIGEM_MERC` | Direto em `PRODUTO`. `IPartFiscal` **não tem** campo para `IPI`/`PIS`/`COFINS` (só `ncm?`/`icmsPercent?`/`taxSubstitution?`/`origin?` — `src/shared/types/catalog.ts`) — esses 3 ficam de fora, não há onde guardá-los sem inventar campo novo no tipo |
| `crossReferences[]` | `APLICACAO`, trecho após `"COD. SEMELHANTES:"` | Parser simples (split por `/`), só essa parte estruturada |
| `applicationNotes` | `APLICACAO`, resto do texto | Cru, sem tentar estruturar em `applications[]` (baixo ROI — só 24,9% preenchido, alto risco de parsing errado) |
| `weightKg` | `PESO` | Presente em `PRODUTO`, cobertura não medida na investigação — importado quando não-nulo |
| `suppliers[]` | **não mapeado** — só o `supplier: string` | `IPartSupplier` exige `cost`+`quantity` por entrada (é o "Entrada em Estoque" visto na tela — histórico de compra por fornecedor). A única tabela com esse formato, `ENTRADANFE`, está **vazia** (0 linhas); `PRODUTOFORNECEDOR` (6.187 vínculos) não tem custo nem quantidade, só o vínculo produto↔fornecedor. Usada apenas para resolver o `supplier: string` (obrigatório) via `FORNECEDOR.NOME` do primeiro vínculo válido — `CODPRO` sujo (ex.: `"537/1"`) em parte das linhas, tratado com skip-e-log |
| `stockAvailable` | **sem fonte confiável** | `ESTOQUE` (tabela) está vazia; `CLASSEPRODUTO.ESTOQUE` existe mas é uma contagem **congelada em 31/10/2024** (quase 2 anos velha) — não importar como estoque atual |
| `stockMinimum` | `ESTMINIMO` | Atual (limiar de reposição, não saldo). `IPart` não tem campo `stockMaximum` — `ESTMAXIMO` existe no Firebird mas não tem onde ir, fica de fora |
| Curva ABC / mais vendidos | **sem fonte** | `ITENSNOTAFISCAL` vazia; `NFISCAL.CODPRO` sempre vazio na prática — não dá pra calcular |

### Fonte 2: Planilha UFI (cotação)

1.532 linhas, header na linha 3 (0-indexed). Só as **138 linhas com `Comprou?=SIM`** entram no escopo (as demais 1.394 são catálogo do fabricante nunca comprado pela loja — fora de escopo, mesmo raciocínio de "não poluir a busca do vendedor" já aplicado ao DINTEC).

| Campo GALLO | Coluna planilha | Observação |
|---|---|---|
| `sku` | `Código Comercial` | Chave da UFI, 100% preenchida nas linhas SIM |
| `name` | `Descrição` | Title-case na escrita (`"Chave Para Desmontagem De Filtro"`, seguindo o padrão já em uso nas 151 linhas reais existentes) |
| `brand` | constante `"UFI"` | |
| `category`/`subcategory` | `Segmento` / `Família` | |
| `unitCost` | `Preço c/ ICMS, Pis e Cofins` | |
| `unitPrice` (só linhas NOVAS) | `Preço c/ ICMS, Pis, Cofins e IPI` | Linhas já existentes (25) **não têm o `unit_price` sobrescrito** — regra `fillIfEmpty`, nunca substitui valor de plataforma já presente |
| `oemCodes` / código de barras | `Código de Barras` | 88,3% preenchido — ausente nas 151 linhas reais atuais, é o enriquecimento mais valioso |
| `crossReferences[]` | colunas `OE`/`Mann`/`Hengst`/`Mahle`/`Tecfil`/`Vox`/`Fram`/`Wega`/`Fleetguard`/`Parker`/`Donaldson` | Cada célula não-vazia vira `{brand: <nome da coluna>, code: <valor>}` |
| `applicationNotes` | `APLICAÇÃO` | Texto cru, 95,6% preenchido nas linhas SIM |
| `fiscal.ncm` | `NCM` | `IPartFiscal` não tem campo para `CST`/`PIS`/`COFINS`/`IPI` — só `NCM` é importado, o resto fica de fora (mesma limitação da Fonte 1) |
| `weightKg` | `Peso Líq (Kg)` | |

### Fonte 3: Planilha Turbo Filtros (aplicação)

1.387 linhas, sem coluna de preço nem flag de compra — é só uma lista de referência/aplicação, não uma cotação. **Só enriquece produtos que já existem nas 151 linhas reais** (match por `sku`/`Referência Turbo`); não cria produtos novos a partir dela (sem sinal do que a loja realmente vende).

| Campo GALLO | Coluna planilha | Observação |
|---|---|---|
| `oemCodes` | `Código Original` | |
| `crossReferences[]` | `Mann`/`Donaldson`/`Fleetguard`/`Parker`/`Hengst`/`Mahle`/`Tecfil`/`Fram`/`Wega`/`Vox`/`JapanParts`/`Baldwin` | Mesmo padrão da UFI |
| `applicationNotes` | `Principais Aplicações` | |
| `fiscal.ncm` | `NCM` | |

## Migration

Nova migration em `supabase/migrations/`, espelhando o padrão já usado em `customers` (`20260625130000_customers_dintec_codcli.sql`):

```sql
ALTER TABLE public.parts
  ADD COLUMN dintec_codpro integer,
  ADD COLUMN dintec_synced_at timestamptz,
  ADD COLUMN catalog_source text; -- 'dintec_erp' | 'supplier_ufi' | 'supplier_turbo_filtros' | 'manual'

CREATE UNIQUE INDEX parts_dintec_codpro_idx ON public.parts (dintec_codpro) WHERE dintec_codpro IS NOT NULL;
CREATE UNIQUE INDEX parts_sku_idx ON public.parts (sku); -- hoje não existe, vira a chave de idempotência do track de planilha
```

`catalog_source` é preenchido para as 151 linhas reais retroativamente (`'supplier_ufi'` ou `'supplier_turbo_filtros'` conforme o `sku` bater com qual planilha) e para toda linha nova criada pelos dois pipelines — dá rastreabilidade de proveniência sem precisar de uma tabela separada.

## Pipeline

**0. Limpeza dos 200 mock (`run-parts-mock-cleanup.ts`)** — pré-requisito, roda uma vez antes dos dois pipelines abaixo. Mesmo padrão da limpeza dos 70 clientes fictícios: transação única auto-abortante, critério `sku ~ '^GAL-'`, cascata cobre os 33 `quote_items` (13 orçamentos, todos com `customer_id IS NULL` — confirmado, não é orçamento de cliente real) antes de apagar as `parts`. Backup local em `scratchpad/` (fora do git) antes da escrita, mesmo gate `DINTEC_CONFIRM_WRITE=yes`.

Dois scripts standalone em `scripts/dintec-import/`, cada um com o padrão já validado: **dry-run primeiro** (sem gate), **depois write** (gate `DINTEC_CONFIRM_WRITE=yes`), backup pré-escrita em `scratchpad/`, batching de 100-200 linhas, relatório final com receita de rollback.

**1. `run-parts-supplier-sync.ts`** (fontes 2 e 3, planilhas)
- Parsing de `.xlsx` **sem dependência nova**: o arquivo é um zip com XML dentro (`xl/sharedStrings.xml` + `xl/worksheets/sheetN.xml`); parser mínimo com `node:zlib`/lib de zip nativa do Node + regex/DOM parser, mesmo princípio usado nesta investigação (validado, script Python equivalente já rodou nas duas planilhas reais).
- Match contra `parts.sku` existente → enriquece campos vazios (nunca sobrescreve valor já presente, regra `fillIfEmpty` reaproveitada de `src/features/dintec-import/engine/`).
- SKUs UFI com `Comprou?=SIM` ausentes da base → cria.
- Linhas Turbo Filtros sem match em `parts.sku` existente → ignoradas (não criam produto novo, só enriquecem).

**2. `run-parts-dintec-import.ts`** (fonte 1, Firebird)
- Export via `isql` embedded (SQL novo em `scripts/dintec-import/sql/export-parts-full-fields.sql`, mesma técnica de `docs/db/GUIA-BANCO-TURBO-DIESEL.md` §7) dos 2.514 produtos identificáveis, já com joins para `GRUPO`/`PRODUTOECOMMERCE`/`PRODUTOFORNECEDOR`+`FORNECEDOR`.
- Idempotência por `dintec_codpro` (âncora paginada, mesmo padrão de `run-full-import.ts` para clientes) — sem lógica de match/dedup adicional, já que `CODPRO` é PK única no Firebird e não há sobreposição com as outras duas fontes.
- Cria só (não há produto DINTEC pré-existente na plataforma para enriquecer).

## Fora de escopo / deferido

- Os 5.686 produtos DINTEC ativos sem `REFERENCIA` nem descrição (reais, mas sem nome legível).
- As 1.394 linhas UFI com `Comprou?=NÃO` (catálogo do fabricante nunca comprado).
- Estoque atual (`stockAvailable`) — nenhuma das 3 fontes tem saldo confiável e atual.
- Curva ABC / produtos mais vendidos — sem histórico de venda por item disponível no Firebird.
- Estruturação completa de `applications[]` (marca/modelo/motor/ano) — fica como texto livre em `applicationNotes` nas 3 fontes.
- Sync contínuo/automático — cada rodada é assistida (dry-run + revisão do dono), igual ao import de clientes.
- `IPI`/`PIS`/`COFINS`/`CST` (Fontes 1 e 2) — `IPartFiscal` só modela `ncm`/`icmsPercent`/`taxSubstitution`/`origin`; sem campo novo no tipo, esses valores não têm onde ir.
- `category` estruturado a partir de `GRUPO.NOME` — `IPart.category` é o enum fechado de 10 valores do extrator por palavra-chave do PRD-021 (identificação de peça), não uma taxonomia livre; `GRUPO.NOME` vai só em `subcategory`/`group_label`.
- `suppliers[]` rico (histórico de compra por fornecedor) — exige `cost`+`quantity` por entrada; a única tabela nesse formato (`ENTRADANFE`) está vazia no Firebird. Só o `supplier: string` é resolvido.
- `ESTMAXIMO` (Firebird) — `IPart` não tem campo `stockMaximum`.

## Riscos e ressalvas

- `PRODUTOFORNECEDOR.CODPRO` tem valores sujos (`"537/1"`) — parser precisa `try/catch` por linha + log de linhas puladas, não deixar o script inteiro falhar por isso.
- `unitPrice` dos 25 produtos UFI já existentes fica como está hoje (pode não bater com nenhuma fórmula real da UFI) — só preenchido pra linhas novas.
- Parsing de `.xlsx` sem lib é mais código que usar uma dependência pronta — trade-off aceito pra não adicionar pacote novo a um script de uso único (`bunfig.toml` exige confirmação do dono antes de excluir pacote do `minimumReleaseAge`).
- `PRODUTOECOMMERCE`/`GRUPO`/`PRODUTOFORNECEDOR` do Firebird precisam de leitura via `isql` com os mesmos joins — SQL novo, não testado ainda em volume total (só amostras durante a investigação).

## Testes

Engines puros novos em `src/features/dintec-import/engine/` (ou pasta própria pro import de produtos), TDD, mesmo padrão dos engines de cliente:
- Parser de `APLICACAO`/`Aplicação` → `{applicationNotes, crossReferences[]}` (split em "COD. SEMELHANTES:").
- Resolver de faixa de preço DINTEC (`VALOR3/4/5` + `PERC2` → `priceTables[]` nomeadas).
- Parser de linha de planilha UFI/Turbo Filtros → `IPart` parcial (nome title-case, cross-references por coluna de marca).
- `fillIfEmpty` reaproveitado sem alteração.
