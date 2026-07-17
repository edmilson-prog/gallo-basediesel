# DINTEC — Camada de providers de importação (PRD-121)

> Status: entregue no PRD-121 (interface + mock + factory). A implementação
> CSV real chega no PRD-122; o engine de processamento no PRD-123.

## Por que CSV?

O ERP DINTEC **não expõe API** e **não dá acesso ao banco** (briefing v1.3
§10 — confirmado com o cliente). O único caminho viável no MVP é o operador
GALLO exportar CSVs manualmente do DINTEC e subi-los na plataforma. Toda a
Onda 6 (PRDs 121–126) constrói o pipeline sobre esse fluxo.

A longo prazo (Fases 4–5 — substituição do DINTEC) podem surgir outras
fontes: um banco-espelho mantido pela GALLO, uma API interna de transição,
múltiplas fontes coexistindo. Por isso a camada aplica o **Provider
Pattern**: interface estável, implementação trocável.

## Arquitetura

```
src/providers/dintec/
├── IDintecImportProvider.ts   # interface estável (RNF-002: mudar = refactor downstream)
├── types.ts                   # DintecRow, DintecImportBatch, validação, capabilities
├── errors.ts                  # DintecProviderError (falhas de provider, não de validação)
├── factory.ts                 # getDintecProvider(storeId) + cache por store
├── index.ts                   # ÚNICO barrel público — consumidores importam daqui
├── mock/
│   └── MockDintecProvider.ts  # dados sintéticos determinísticos
└── csv/                       # CsvDintecProvider (PRD-122)
```

### Contrato (`IDintecImportProvider`)

| Método                       | Responsabilidade                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadBatch(source, context)` | Carrega a batch e devolve rows normalizadas. **Não toca banco.**                                                                                                    |
| `validateStructure(batch)`   | Validação **estrutural** (encoding, delimitador, colunas obrigatórias, ≥1 linha). Sem semântica — FKs e duplicatas contra dados existentes são do engine (PRD-123). |
| `healthCheck()`              | CSV: sempre `healthy`; DB espelho/API: ping real.                                                                                                                   |

Mais duas propriedades estáticas: `providerName` (`'csv' | 'mirror_db' |
'api' | 'mock'`) e `capabilities` (matriz de features — incremental, orders,
detecção de encoding, tamanho máximo).

### Garantias que os consumidores assumem

1. **`rawRecord` é sempre `Record<string, string>`** — o provider nunca
   converte tipos. Decimal brasileiro (`125,90`), data `dd/mm/yyyy` e flags
   `S/N` chegam crus; a conversão é responsabilidade do engine (PRD-123).
2. **Chaves do `rawRecord` chegam normalizadas** — lowercase, snake_case,
   sem acentos (`"Razão Social"` → `razao_social`). Variações de layout são
   absorvidas pelo provider; o engine nunca lida com layouts.
3. **Providers não persistem nada** — carregam e validam em memória. Quem
   escreve no banco é o engine.

### Contexto de batch (desvio documentado do PRD)

O PRD-121 esboçava `loadBatch(source)`, mas `DintecImportBatch` exige
`batchId`, `storeId`, `uploadedBy` e `entityKind` — campos que a `source`
(um path no Storage, um CSV inline) não carrega. Esses metadados vivem na
tabela `dintec_import_batches` (PRD-122) e o chamador já os conhece, então
viajam como segundo argumento explícito: `loadBatch(source, context)` com
`DintecBatchContext`.

### Entity kinds

`customer`, `part`, `order` e `order_item` são os kinds do MVP (CSVs
separados — o DINTEC exporta pedidos e itens em arquivos distintos).
`price` e `stock` estão **reservados** no union para a Fase 4+: declarados
para estabilidade de tipo, mas nenhum provider MVP os carrega (o mock
devolve batch vazio).

## Factory

```ts
import { getDintecProvider } from "@/providers/dintec";

const provider = await getDintecProvider(storeId);
```

- Resolução por **store** (futuro: `stores.dintec_provider_config` pode
  apontar stores diferentes para fontes diferentes). Instâncias cacheadas
  por `storeId`; `invalidateDintecProviderCache(storeId?)` derruba o cache.
- `VITE_DINTEC_PROVIDER=mock` **ou** fonte de dados ativa `mock` (default do
  build) → `MockDintecProvider` para qualquer store.
- Fonte `supabase` → `CsvDintecProvider`. Até o PRD-122 entregar a classe, a
  factory lança `DintecProviderError("NOT_IMPLEMENTED")` nomeando o PRD —
  mesmo staging usado nos engines WhatsApp.

> **Desvio documentado (RF-030):** o PRD pedia um método no
> `ProviderFactory` central do PRD-104. O repo não tem essa classe — a
> factory de dados (`src/providers/data/factory.ts`) monta o set
> `IDataProviders`, e camadas de integração (WhatsApp, DINTEC) vivem como
> módulos irmãos com factory própria. A camada DINTEC segue o precedente
> `src/providers/whatsapp/`.

## MockDintecProvider

Dados sintéticos **determinísticos** (constantes fixas — sem faker, sem
relógio), seguindo os layouts canônicos do PRD-122:

| Kind         | Rows | dintecIds                              |
| ------------ | ---- | -------------------------------------- |
| `customer`   | 3    | `C001`–`C003`                          |
| `part`       | 5    | `P001`–`P005`                          |
| `order`      | 2    | `P12345`, `P12346`                     |
| `order_item` | 4    | `numero_pedido:codigo_peca` (composto) |

`validateStructure` sempre retorna válido; `healthCheck` sempre `healthy`.
O mock existe para destravar o desenvolvimento dos PRDs 122–126 antes de
existir CSV real.

## Como adicionar um provider novo (ex.: `MirrorDbDintecProvider`)

1. Criar pasta `src/providers/dintec/mirror-db/` com a classe implementando
   `IDintecImportProvider` (use `mock/MockDintecProvider.ts` como template).
2. Declarar `providerName: "mirror_db"` e a matriz real de `capabilities`
   (ex.: `supportsIncremental: true`).
3. Adicionar o caso na resolução do `factory.ts` (config por store via
   `stores.dintec_provider_config`, a definir quando necessário).
4. Exportar a classe no barrel `index.ts`.
5. Testes co-localizados (`*.test.ts`) cobrindo o contrato.

Nenhum consumidor (engine, UI de upload, syncs) deve mudar — se mudar, a
interface vazou especificidade da fonte (bug de design).

## Limitações conhecidas

- **Batch inteira em memória** — `rows` é array (cap de 50MB por arquivo).
  Streaming via async iterator fica para quando houver necessidade real.
- **Sem incremental** — DINTEC só exporta snapshot completo; o diff é feito
  pelo engine via `dintec_version_hash` (PRD-123).
- **`order` depende de `customer`** — FKs são resolvidas pelo engine na
  ordem de processamento, não pelo provider.
- **Validação estrutural ≠ semântica** — um CSV estruturalmente válido ainda
  pode falhar no processamento (cliente inexistente, preço inválido etc.).

## Normalização de telefone em cargas DINTEC (obrigatória)

O import assistido de 2026-07-12 gravou telefones **crus do ERP** (10–11 dígitos, sem o DDI 55) em ~1.411 clientes novos. Consequência: o envio WhatsApp montava o JID do país errado (`49988184540@c.us` = Alemanha) e falhava com HTTP 500 — correção via backfill assistido, conduzido conforme `docs/superpowers/plans/2026-07-17-customers-phone-country-code-fix.md`. Toda carga futura DEVE aplicar a regra do PRD-124 RF-011 antes de gravar `customers.phone`:

1. Reduzir a dígitos; se o valor original tem `+` inicial, é E.164 explícito — gravar `'+' + dígitos` sem mais transformação (protege números estrangeiros: Chile/Bolívia também têm 10–11 dígitos).
2. Sem `+`: se `length ∈ {10, 11}`, sem zero-tronco e com DDD BR válido (Anatel), gravar `'+55' + dígitos`. A decisão é por **comprimento**, nunca por `startsWith('55')` — DDD 55 é a região da loja.
3. **NUNCA inserir o 9º dígito** (lição PR #302 — só o WhatsApp confirma essa variante).
4. Gravar sempre `'+' + dígitos` **sem pontuação** — o attach do webhook usa `LIKE` textual nos últimos 8 dígitos da coluna crua.
5. Antes de gravar, checar colisão com cliente existente da mesma loja (`phone_digits` igual ou variante de 9º dígito) e tratar caso a caso, não sobrescrever.

Helper de referência no código: `normalizeBrDialDigits` em `src/providers/whatsapp/phoneBr.ts`.
