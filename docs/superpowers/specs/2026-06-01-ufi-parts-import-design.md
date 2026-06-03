# Import em massa (amostra) de filtros UFI — Design

> **Data:** 2026-06-01 · **Autor:** Claude Opus 4.8 (1M) + Edmilson
> **Branch alvo:** a definir no plano · **Status:** aprovado para plano
> **Validação prévia:** commit `94c2153` (cross-references no modelo + UI + 1 SKU real)

## Objetivo

Importar uma **amostra representativa de ~150 filtros reais** da planilha de cotação do
fornecedor UFI (`docs/export/2024.11.14 Cotação Turbo Diesel UFI.xlsx`, aba
"Cotação Turbo Diesel", 1.532 SKUs) como mock data do catálogo GALLO, **substituindo os
filtros sintéticos** do gerador determinístico. O gerador **mantém** a produção das outras
7 categorias (motor, freios, transmissão, suspensão, elétrica, arrefecimento,
lubrificantes). Resultado: catálogo misto — filtros reais + resto sintético — mais
convincente para demonstração, preservando a integridade referencial com pedidos,
orçamentos e histórico de serviço (que pegam peças via `ctx.pick(parts)`).

Por quê: a ficha de produto foi redesenhada (PR #20) e enriquecida com cross-references
(`94c2153`); falta povoá-la com dados reais densos para validar o mockup end-to-end e dar
base realista à busca, equivalências e verificador de compatibilidade.

## Não-objetivos (YAGNI)

- **Não** importar os 1.532 SKUs (só amostra de ~150).
- **Não** parsear o xlsx em runtime (traria dependência + esbarra no guard de 24h do
  `bunfig.toml`; é binário no browser).
- **Não** reformar o `PartForm` (rodada futura).
- **Não** tocar backend (Fase 1, mock-only).
- **Não** importar as outras abas da planilha (Pendência/Lançamentos/Reajuste).

## Arquitetura — 3 camadas

```
docs/export/*.xlsx ──(conversor offline, roda 1×)──▶ src/mocks/data/ufiPartsRaw.ts
                                                       (≈150 linhas CRUAS tipadas IUfiPartRow[])
                                                             │
                                       (runtime, seeded) buildUfiParts(ctx, now): IPart[]
                                                             │
                                                             ▼
                       bootstrap: parts = [...filtros reais UFI, ...7 categorias sintéticas]
```

Alinhada à filosofia seeded do projeto: o **dado real** vive num módulo versionado; os
**campos sintetizados** (estoque, SEFAZ, margem…) são derivados determinísticamente por
seed em runtime, exatamente como o gerador atual faz — não ficam congelados no arquivo.

### Camada 1 — Conversor offline

- **Arquivo:** `scripts/import-ufi-parts.py` (Python stdlib — `zipfile` + `xml.etree`;
  **sem dependência nova**, abordagem já validada nesta sessão).
- **Entrada:** o xlsx (caminho fixo, relativo à raiz do repo).
- **Saída:** sobrescreve `src/mocks/data/ufiPartsRaw.ts` exportando
  `export const UFI_PARTS_RAW: IUfiPartRow[] = [ … ]` (≈150 itens) com cabeçalho de aviso
  "arquivo gerado — não editar à mão" e a data/origem.
- **Relatório de sanidade:** imprime no stdout contagem por família/segmento, % com GTIN,
  média de cross-refs e de aplicações por peça — para conferência humana antes do commit.
- É um utilitário de desenvolvimento, **não** entra no bundle do app.

### Camada 2 — Builder runtime

- **Arquivo:** `src/mocks/generators/ufiPart.ts`.
- **Função:** `buildUfiParts(ctx: ISeededContext, now: Date): IPart[]` — mapeia cada
  `IUfiPartRow` → `IPart`, sintetizando os campos ausentes via `ctx` (seeded) e reusando
  `buildPriceTables`/`weightedAverageCost` de `@/features/catalog/utils/pricing`.
- Função pura auxiliar exportada para teste: `mapUfiRowToPart(ctx, row, now): IPart`.

### Camada 3 — Integração no bootstrap

- `src/mocks/generators/bootstrap.ts`:
  - O loop do gerador passa a **pular a categoria `filtros`** (as outras 7 seguem).
  - Injeta `buildUfiParts(ctx, now)` no array `parts`.
  - **Remove** `import { buildUfiSamplePart }` e a linha `parts.unshift(buildUfiSamplePart(now))`.
- **Remover** o arquivo `src/mocks/data/seedRealPart.ts` (a peça única `23.290.00` passa a
  fazer parte da amostra; mantê-la seria duplicata).

## Tipo `IUfiPartRow` (linha crua)

Só dado real normalizado, sem nada sintetizado:

```ts
export interface IUfiPartRow {
  commercialCode: string; // "23.290.00"
  description: string; // "Filtro Spin-On Do Óleo" (já title-cased)
  segment: string; // "Off Road" | "Linha Leve" | "Linha Pesada"
  family: string; // normalizada → subcategoria: "óleo" | "ar" | ...
  origin: string; // "Importado" | "Nacional"
  multiple: number; // múltiplo de venda (boxQuantity)
  ncm?: string; // "8421.23.00" (formatado com pontos)
  taxSubstitution?: boolean; // derivado do CST
  gtin?: string; // EAN-13 quando presente
  weightKg?: number; // Peso Líq, undefined se 0/-
  reference?: string; // Original UFI || OE
  oemCodes: string[]; // OE (split por separadores comuns)
  crossReferences: { brand: string; code: string }[];
  applications: {
    vehicleBrand: string;
    vehicleModel: string;
    yearStart: number;
    yearEnd: number;
  }[];
  applicationNotes: string; // texto cru de APLICAÇÃO (lossless)
  unitCost: number; // Preço c/ ICMS, Pis e Cofins
}
```

## Mapeamento de campos

### Dado real (planilha → IPart)

| `IPart`                     | Origem                                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sku`                       | `commercialCode`; `id` = `part-ufi-<slug(commercialCode)>`                                                                                                |
| `name`                      | `description`                                                                                                                                             |
| `brand` / `supplier`        | `"UFI"` / `"UFI Filters"`                                                                                                                                 |
| `category`                  | sempre `"filtro"`                                                                                                                                         |
| `subcategory`               | `family` normalizada (Air→`ar`, Oil→`óleo`, Fuel→`combustível`, Cabin→`cabine`, Hydraulic→`hidráulico`, Separator→`separador`); undefined se desconhecida |
| `segment` _(novo)_          | `segment`                                                                                                                                                 |
| `unitCost`                  | `unitCost`                                                                                                                                                |
| `gtin`                      | `gtin`                                                                                                                                                    |
| `weightKg`                  | `weightKg`                                                                                                                                                |
| `boxQuantity`               | `multiple`                                                                                                                                                |
| `fiscal.ncm`                | `ncm`                                                                                                                                                     |
| `fiscal.origin`             | `origin`                                                                                                                                                  |
| `fiscal.taxSubstitution`    | `taxSubstitution`                                                                                                                                         |
| `oemCodes`                  | `oemCodes`                                                                                                                                                |
| `reference`                 | `reference`                                                                                                                                               |
| `crossReferences`           | `crossReferences`                                                                                                                                         |
| `applications`              | `applications` (com ids `app-<partId>-<i>`)                                                                                                               |
| `applicationNotes` _(novo)_ | `applicationNotes`                                                                                                                                        |
| `supplierCode`              | `commercialCode`                                                                                                                                          |
| `group`                     | `"1-FILTRO"`                                                                                                                                              |
| `partType`                  | `"Filtro"` (constante)                                                                                                                                    |

### Sintetizado determinístico (seeded por sku)

| `IPart`                           | Regra                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `marginPercent`                   | `clamp(0.45 + (ctx.rng()-0.5)*0.18, 0.1, 0.7)` (igual a filtros no gerador)                                                          |
| `unitPrice`                       | `round(unitCost * (1 + marginPercent))`                                                                                              |
| `priceTables`                     | `buildPriceTables(unitCost, marginPercent)`                                                                                          |
| `fiscal.icmsPercent`              | `ctx.pick([4, 7, 12, 17])` (não há na planilha)                                                                                      |
| `sefazStatus` / `sefazCheckedAt`  | se tem GTIN: `validated` 70% / `not_checked` 25% / `invalid` 5%; `sefazCheckedAt` só quando validated                                |
| `stockAvailable` / `stockMinimum` | distribuição PRD-030: ~10% zero, ~20% baixo, ~70% normal; `stockMinimum = ctx.int(2,10)`                                             |
| `storageLocation`                 | `${pick(A..F)}-${int(1,40)}`                                                                                                         |
| `fractionable`                    | `ctx.bool(0.4)`                                                                                                                      |
| `unitOfMeasure`                   | `"PC"`                                                                                                                               |
| `suppliers`                       | 1 entrada: UFI Filters, `supplierCode = commercialCode`, `invoiceDate` = data da planilha, `cost = unitCost`, `quantity = int(1,60)` |
| `averageCost`                     | `weightedAverageCost(suppliers)`                                                                                                     |
| `isOriginal`                      | `false`                                                                                                                              |
| `division` / `storeId` / `active` | `"parts"` / `"store-matriz"` / `true`                                                                                                |
| `createdAt` / `updatedAt`         | seeded entre 2 anos atrás e `now`                                                                                                    |
| `equivalentPartIds`               | `[]` (linkagem opcional via `linkEquivalentParts` se na mesma categoria)                                                             |

### Novos campos no modelo (`src/shared/types/catalog.ts`)

```ts
/** Segmento de aplicação (Off Road | Linha Leve | Linha Pesada). */
segment?: string;
/** Texto livre de aplicação preservado da fonte (fallback lossless do parser). */
applicationNotes?: string;
```

Ambos opcionais/aditivos — não quebram consumidores existentes. Re-exportar nada novo
(são campos de `IPart`, já exportado).

## Algoritmo de seleção (~150)

1. Filtrar linhas com `commercialCode` e `description` não-vazios.
2. **Score de riqueza:** `+1` por cross-ref (máx 10) `+5` se GTIN `+3` se OE
   `+ min(len(aplicação)/40, 10)`.
3. **Cotas por família** proporcionais à distribuição real do arquivo
   (Ar ≈33%, Óleo ≈19%, Combustível ≈17%, Hidráulico ≈13%, Cabine ≈11%, demais ≈7%),
   somando ~150.
4. Dentro de cada cota, **estratificar por segmento** (Off Road / Linha Leve / Linha
   Pesada) e selecionar as de maior score.
5. **Forçar inclusão** de `23.290.00` (item já validado).
6. Ordenação final determinística por `commercialCode` (reprodutível entre execuções).

## Parser de aplicação (texto → IApplication[] + cru)

- Separar grupos por `" / "`; cada grupo `MARCA: itens` → marca (title-case) + itens (`;`).
- Por item: regex `\((\d{4})\s*-\s*(>|\d{4})\)` → `yearStart`/`yearEnd`
  (`>` ou aberto → cap **2025**); o resto, com espaços normalizados = `vehicleModel`.
- Item sem padrão de ano → `yearStart: 1990, yearEnd: 2025` (fallback).
- **`applicationNotes` recebe sempre o texto cru** (lossless).
- Fragmentos sem `MARCA:` (códigos soltos, listas CAT caóticas) **não viram chip**, mas
  ficam no `applicationNotes`.
- **Cap de ~60 chips por peça** (linhas CAT gigantescas não estouram a UI); o excedente
  permanece só no texto cru.

## Derivação CST → ST

- CST de 3 dígitos (`"110"`, `"000"`…): origem = 1º dígito (já temos a coluna Origem, que
  prevalece para `fiscal.origin`); tributação = 2 últimos dígitos.
- `taxSubstitution = true` quando tributação ∈ {`10`, `30`, `60`, `70`, `90`}; `false`
  para `00`/`20`/`40`/`41`/`50`/`51`; undefined se CST vazio.

## UI — exibição dos campos novos

- **`segment`:** chip em `PartIdentityCard` (ao lado de categoria/OEM badge). Só renderiza
  quando presente.
- **`applicationNotes`:** parágrafo no rodapé de `ApplicationsSection`, sob um rótulo
  discreto ("Texto original da aplicação"), com `whitespace-pre-line` e
  `text-muted-foreground`. Só renderiza quando presente. Tokens semânticos apenas.
- i18n: adicionar `detail.identity.segment` e `detail.applications.rawLabel` em
  `src/features/catalog/i18n/pt-BR.ts`.

## Edge cases

- **Sem GTIN** (~10%): `gtin` undefined → card "GTIN não cadastrado".
- **Múltiplo não-numérico:** `boxQuantity = 1`.
- **Peso `0`/`-`:** `weightKg` undefined.
- **CST vazio:** `taxSubstitution` undefined.
- **Família desconhecida:** `subcategory` undefined (`category` continua `"filtro"`).
- **Custo `0`** (não deve ocorrer): sem `priceTables` (empty state já tratado).
- **`oemCodes` vazio:** array vazio; `PartIdentityCard` mostra `OEM —`.

## Validação / testes

- Sem runner no projeto. Verificar funções puras (parser de aplicação, normalização de
  família, CST→ST) via **scratch `bun run`** temporário, removido após.
- **`bun run build`** (Vite + `tsc --noEmit`) é a verificação autoritativa de tipos.
- Relatório de sanidade do conversor conferido antes de commitar `ufiPartsRaw.ts`.
- Validação manual da UI pelo usuário (catálogo + 3 layouts; peça com/sem GTIN; chips de
  segmento; texto cru de aplicação).

## Não regredir

- Consumidores de `IPart` (lista, busca, orçamentos, pedidos, DRE PRD-048, comissões) —
  campos preservados; novos são opcionais.
- Pedidos/orçamentos/histórico continuam pegando peças de `parts` (real + sintético).
- `EquivalentsSection`/`ApplicationsSection`/`PartCrossReferenceSection` — reusados.
- Distribuição "custo ausente ~30%" do PRD-048 permanece nas 7 categorias sintéticas
  (filtros reais têm custo).

## Arquivos

- **Novo:** `scripts/import-ufi-parts.py` (conversor offline)
- **Novo (gerado):** `src/mocks/data/ufiPartsRaw.ts`
- **Novo:** `src/mocks/generators/ufiPart.ts` (builder + tipo `IUfiPartRow`)
- **Modificar:** `src/mocks/generators/bootstrap.ts` (skip filtros sintéticos + injeção)
- **Modificar:** `src/mocks/generators/part.ts` (opção de excluir categoria `filtros`)
- **Modificar:** `src/shared/types/catalog.ts` (`segment`, `applicationNotes`)
- **Modificar:** `src/features/catalog/components/detail/PartIdentityCard.tsx` (chip segmento)
- **Modificar:** `src/features/catalog/components/detail/ApplicationsSection.tsx` (texto cru)
- **Modificar:** `src/features/catalog/i18n/pt-BR.ts` (strings novas)
- **Remover:** `src/mocks/data/seedRealPart.ts` + desreferenciar no bootstrap

```

```
