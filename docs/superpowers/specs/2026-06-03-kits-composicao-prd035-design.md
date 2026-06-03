# Design — Kits de Composição por Modelo (PRD-035)

> **PRD:** PRD-035 · **Data:** 2026-06-03 · **Autor:** sessão Claude Opus 4.8 (1M context)
> **Status:** aguardando revisão do usuário
> **Épico:** Composição por Modelo (Kits) — **sub-projeto 2 de 3**

## Contexto

O épico "Composição por Modelo" entrega três sub-projetos sequenciais, cada um com seu
próprio ciclo spec → plano → implementação → versão:

1. **PRD-034** ✅ — catálogo canônico de modelos de veículo (`IVehicleModel`). Entregue
   na v0.63.0 "Catalog" (PR #25, aguardando merge). Deixou um **slot vazio honesto**
   "Kits deste modelo" na página de detalhe `/app/kits/$modelId`.
2. **PRD-035 (este)** — o conceito de **Kit** (composição curada de peças, foco em
   filtros) pendurado no modelo, gerenciado no detalhe do modelo, aplicável com um
   clique no orçamento, **consolidando** a feature antiga `IServiceKit`.
3. **Delta PRD-016** — `IVehicle.modelId` + aplicar Kit no detalhe do veículo (liga o
   matching por `modelId` que este sub-projeto deixa por string).

**Decisão estratégica já tomada (usuário, epic-level):** _consolidar_. Não haverá dois
conceitos de kit. O `IServiceKit` (entregue na v0.62.0) é **substituído** pelo
kit-pendurado-no-modelo — **recomeço limpo**, não coexistência.

### Achados da exploração que moldam este design

- **`IServiceKit` atual** (`src/shared/types/service-kit.ts`): store-scoped, com
  `vehicleApplication?: { brand; model }` (strings opcionais, **sem `modelId`, sem
  motor**), `category?: PartCategory` opcional, e itens simples `{ partId, quantity }`
  — **sem** `status` (rascunho/oficial), **sem** `isOptional`, **sem** `note`. Feature
  em `src/features/service-kits/`, rota `/app/catalogo/kits`, nav "Kits de revisão"
  (`mdi:toolbox-outline`, Owner/Gestor). Seed de **3 kits genéricos** em
  `src/mocks/data/seedServiceKits.ts`. Resource RBAC `serviceKit`.
- **Aplicação de kit já existe no orçamento:** `expandKitToItems(kit, partsById)`
  (`src/features/quotes/utils/kitExpansion.ts`) resolve itens e faz snapshot;
  `KitPicker` (`src/features/quotes/components/new/items/KitPicker.tsx`, popover) injeta
  direto via `handleAddKit` no `QuoteEditor` (linhas ~205-225). Será **evoluído** para
  o fluxo _pick → modal de preview → injeta_.
- **`IQuoteItem`** (`src/shared/types/commercial.ts`) já guarda snapshot
  (`partSku`, `partName`, `unitPrice`); `addOrIncrementItem`
  (`src/features/quotes/utils/quoteItemOps.ts`) é a operação atômica de inserção.
- **`IPart.applications`** (`src/shared/types/catalog.ts`): array de
  `IApplication { id; vehicleBrand; vehicleModel; yearStart; yearEnd; engine? }` — a
  base do cruzamento de drift. Busca de catálogo exposta via `usePartsProvider` /
  `usePartsIndex` (`partsById: Map<ID, IPart>`).
- **`IVehicle`** (`src/shared/types/customer.ts`) **NÃO tem `modelId`** ainda — é o
  delta PRD-016. Logo o matching deste sub-projeto é por **string** (ver §6).
- **Detalhe do veículo** (`src/features/vehicles/.../detail/MaintenanceRecommendations.tsx`):
  cards "Filtro/Freios/Correia/Revisão" com botão "Criar orçamento" hoje placeholder.
- **PRD-034 entregue:** `src/features/vehicle-models/` com `VehicleModelDetailPage`
  (slot vazio "Kits deste modelo"), resource `vehicleModel`, rota `/app/kits`,
  `IVehicleModel { id; brand; model; engine; yearStart?; yearEnd?; status; … }`.

## Objetivo

Permitir que uma **composição curada de peças** (foco em filtros no MVP) seja definida
por modelo de veículo e aplicada com um clique no orçamento — eliminando o retrabalho de
remontar orçamentos item a item para clientes com o mesmo caminhão. **Vendedor** cria
rascunho e aplica; **Gestor/Owner** curam (criam, editam, promovem, despromovem,
excluem). A composição é **propriedade do modelo, não do cliente**.

## Princípios e restrições

- **Fase 1 (Frontend First):** persistência mock in-memory (escritas valem na sessão).
  Stub Supabase lança `NotImplementedError`. Persistência real → Fase 2.
- **Provider Pattern:** a feature consome apenas `useModelKitsProvider`; nunca importa
  `impl/*` direto (bloqueado por ESLint).
- **TypeScript strict**, zero `any`; interfaces prefixadas com `I`; `category`/`status`
  via union literal.
- **Tokens semânticos apenas** (sem hex/cores Tailwind cruas/`--gallo-*`). Light + dark
  obrigatórios. WCAG 2.1 AA.
- **Kit é vivo, orçamento é snapshot:** itens do kit referenciam `partId`; o
  congelamento de preço/OEM acontece no `IQuoteItem` ao aplicar. Sem versionamento.
- **Não bloquear o fluxo principal:** sugestão e drift são auxiliares; orçamento manual
  continua funcionando.

## Decisões de produto (deste brainstorm)

| #   | Decisão              | Escolha                                                                                                                                                        |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Ponto de partida     | Só brainstorm/spec agora; decisão de branch fica para a implementação (pós-merge do PR #25).                                                                   |
| 2   | Migração de dados    | **Recomeçar limpo** — `IServiceKit` → `IVehicleModelKit`; seed novo de ~10 kits `filtros`; redirect `/app/catalogo/kits` → `/app/kits`; nav unificada.         |
| 3   | Curadoria            | **Filtro na lista de modelos** — a pílula "Kits N" indica rascunhos pendentes (`Kits 3 · ●1 rascunho`) + chip "Com rascunhos pendentes". Sem tela global nova. |
| 4   | Casca do editor      | **Página dedicada** (rotas aninhadas sob o modelo), consistente com o form de modelo do PRD-034.                                                               |
| 5   | Categoria no MVP     | `Select` expõe as 5 categorias; default `filtros`; **só `filtros` é semeado**; só o card "Filtros" do veículo aplica kit no MVP.                               |
| 6   | Matching até PRD-016 | Por **string** `brand+model+engine` (limitação conhecida); PRD-016 troca para `modelId`.                                                                       |
| 7   | Confirmação          | **Undo > confirmação** — aplicar injeta direto + toast `[Desfazer]`; `AlertDialog` só no destrutivo real.                                                      |

## Modelo de dados

`src/shared/types/model-kits.ts` (substitui `service-kit.ts`):

```ts
export type ModelKitCategory = "filtros" | "freios" | "correia" | "revisao" | "custom";
export type ModelKitStatus = "rascunho" | "oficial";

export interface IKitItem {
  partId: ID; // referência VIVA ao IPart (sem snapshot)
  defaultQuantity: number; // > 0 (combustível costuma vir em par: 2)
  isOptional: boolean; // false = base (pré-marcado no preview); true = sugestão
  note?: string; // ex.: "trocar a cada 30.000 km"
}

export interface IVehicleModelKit {
  id: ID;
  modelId: ID; // chave canônica do PRD-034 (obrigatória)
  storeId: ID;
  name: string; // "Kit Filtros — Scania R450 DC13"
  category: ModelKitCategory;
  status: ModelKitStatus;
  items: IKitItem[];
  createdBy: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
  updatedBy?: ID;
}
```

Re-exportar no barrel `src/shared/types/index.ts` (e remover o export de `service-kit`).

**Delta aditivo em `IQuote`** (`src/shared/types/commercial.ts`):

```ts
// adicionar a IQuote
appliedKitIds?: ID[];      // rastreabilidade para "% de orçamentos via Kit" (Bloco 4)
```

## Consolidação (recomeço limpo)

| Antes (`IServiceKit`)                             | Depois (`IVehicleModelKit`)                                  |
| ------------------------------------------------- | ------------------------------------------------------------ |
| `src/features/service-kits/`                      | `src/features/model-kits/`                                   |
| `src/shared/types/service-kit.ts`                 | `src/shared/types/model-kits.ts`                             |
| rota `/app/catalogo/kits` (lista plana)           | gerenciado em `/app/kits/$modelId`; redirect da rota antiga  |
| nav "Kits de revisão" (Owner/Gestor)              | **removido** — uma só nav "Kits por modelo" (PRD-034)        |
| resource RBAC `serviceKit`                        | resource `modelKit`                                          |
| provider `serviceKits` + `useServiceKitsProvider` | `modelKits` + `useModelKitsProvider`                         |
| `mocks/api/serviceKits.ts` + `seedServiceKits.ts` | `mocks/api/modelKits.ts` + `seedModelKits.ts`                |
| seed: 3 kits genéricos                            | seed: ~10 kits `filtros` ancorados em `modelId` real         |
| `expandKitToItems` + `KitPicker` (injeta direto)  | evoluem para _pick → modal de preview → injeta com snapshot_ |

O redirect de `/app/catalogo/kits` → `/app/kits` (rota mantida como `beforeLoad` →
`redirect`) preserva links/favoritos. A constante antiga `APP_CATALOGO_KITS` é removida
da nav mas a rota de redirect permanece até a Fase 2.

## Camada provider + mock

- **Contract** `src/providers/data/contracts/modelKits.ts`:
  ```ts
  export interface ICreateModelKitInput {
    modelId: ID;
    name: string;
    category: ModelKitCategory;
    status?: ModelKitStatus;
    items: IKitItem[];
  }
  export interface IUpdateModelKitPatch {
    name?: string;
    category?: ModelKitCategory;
    status?: ModelKitStatus;
    items?: IKitItem[];
  }
  export interface IListModelKitsParams {
    modelId?: ID;
    status?: ModelKitStatus;
    category?: ModelKitCategory;
    search?: string;
  }
  export interface IModelKitsProvider {
    list(params?: IListModelKitsParams): Promise<IVehicleModelKit[]>;
    get(id: ID): Promise<IVehicleModelKit>;
    create(input: ICreateModelKitInput): Promise<IVehicleModelKit>;
    update(id: ID, patch: IUpdateModelKitPatch): Promise<IVehicleModelKit>;
    delete(id: ID): Promise<void>;
  }
  ```
- **Mock api** `src/mocks/api/modelKits.ts`: store in-memory semeado; `runApi("modelKitsApi", …)`;
  validação via `MockValidationError` (`modelId` e `name` obrigatórios; ≥1 item;
  `defaultQuantity > 0` em cada item); `MockNotFoundError` em get/update/delete
  inexistente; id determinístico-incremental (`mkit-<n>`).
- **Impls:** `impl/mock/modelKits.ts` delega à api; `impl/supabase/modelKits.ts` stub
  com `NotImplementedError`.
- **Factory + hook:** registrar a slice `modelKits` em `factory.ts` (mock + supabase) e
  expor `src/providers/data/hooks/useModelKitsProvider.ts` via
  `useDataProviderSlice("modelKits", "useModelKitsProvider")`.
- **Seed** `src/mocks/data/seedModelKits.ts`: ~10 kits `filtros`, mix oficial/rascunho,
  3-5 itens cada, referenciando `partId` reais do catálogo de peças e `modelId` reais do
  catálogo de modelos. Documentar (comentário) o critério de seleção das peças por
  modelo.

## Arquitetura de informação e as 4 superfícies

**Idioma visual transversal** (consultoria de design):

- **`●` base / `○` opcional** repetido nas 4 superfícies — distinção pela _forma_, não
  só pela cor (cumpre WCAG de graça). Sempre acompanhado de micro-legenda
  `● N base · ○ N opcional` na primeira aparição da tela.
- **Ouro (`primary`) escasso de propósito:** só no CTA primário, no badge `oficial` e no
  total do modal de aplicação. Resto é `muted`/`secondary`/`outline`.
- **Rótulos descritivos:** `[Adicionar 3 itens ao orçamento]`, `[Salvar rascunho]`,
  `[Promover a oficial]` — o botão diz o que vai acontecer.
- **Undo > confirmação:** aplicar kit injeta direto + toast `sonner` com `[Desfazer]`
  (~6s); `AlertDialog` reservado ao destrutivo real (excluir kit, descartar edição).

### Superfície 1 — "Kits deste modelo" (slot no detalhe do modelo)

**Lista de cards** (não tabela — poucos itens, conteúdo heterogêneo, melhor no mobile).
Cada card: ícone+badge de categoria (`mdi:air-filter` filtros · `mdi:car-brake-alarm`
freios · `mdi:fan` correia · `mdi:wrench-clock` revisao · `mdi:package-variant` custom),
badge de status (`oficial` → `bg-primary/15 text-primary border-primary/30`; `rascunho`
→ `variant="outline"` + ícone `mdi:pencil-ruler`), nome, nº de itens, preview `●/○` dos
itens em bloco `bg-muted/50`, legenda `● N base · ○ N opcional`.

- Linha clicável = `<a>`; ações como **botões irmãos** (fora do anchor) — sem
  nested-interactive.
- Ações por papel: Vendedor `[Editar][Aplicar]`; Gestor/Owner +
  `[Promover/Despromover]` e `[Excluir]` no overflow `⋯` (`DropdownMenu`). `[Aplicar]` é
  o CTA primário (`variant="default"`, ouro); demais `outline`/`ghost`.
- **Estados:** vazio-com-permissão (ícone `mdi:tray-plus` + CTA `[+ Criar kit]`);
  vazio-sem-permissão (mesma copy, **sem** botão); carregando (2 skeletons de card);
  erro (`border-destructive/40` + `[Tentar novamente]`).

### Superfície 2 — Editor de kit (página dedicada)

Rotas aninhadas sob o modelo (namespaced para não colidir com o `/editar` do modelo):

```
app.kits.$modelId.kit.novo.tsx          # criar kit para este modelo
app.kits.$modelId.kit.$kitId.editar.tsx # editar kit
```

Layout (página, container confortável): **contexto do modelo fixo** no topo (read-only,
"Modelo: Scania R450 DC13"); campos **nome** (`Input`) + **categoria** (`Select` com
ícone+label); **status** como badge read-only (mudança de status é via promoção na
Superfície 1, não aqui — não confundir "salvar" com "promover"). **Editor de itens:**

- **Busca no catálogo** (`Command`/combobox com teclado): resultado mostra nome + código
  - `[+ Adicionar]`. Ao adicionar, anima a entrada (`animate-in fade-in
slide-in-from-top-1`, sob `motion-reduce:transition-none`).
- **Lista de itens** (`<ul>`/`<li>`): marcador `●/○`; `stepper` qtd `[− N +]` (botões
  ≥44px, `aria-live` no valor, min 1); `Switch` **Base/Opcional** com rótulo textual
  visível (default OFF = base); **nota** colapsável (`▸ Nota` → `Input`); `[🗑]` remover.
- **Botão "Sugerir composição (IA)" desabilitado:** `variant="outline" disabled`
  envolvido em `<span tabIndex={0}>` para o `Tooltip` "Disponível na Fase 2" funcionar
  (disabled não dispara tooltip) + micro-selo `ⓘ Fase 2` em `text-[10px]
text-muted-foreground` — indisponibilidade honesta sem depender de hover.
- **Banner de drift** abaixo da busca (ver Superfície 4a).
- **Footer:** `[Cancelar]` + `[Salvar rascunho]`/`[Salvar]` (texto conforme permissão);
  Salvar `disabled` até ≥1 item (tooltip "Adicione ao menos uma peça").
- **Estados:** lista vazia (placeholder `border-dashed`); busca sem resultado (ecoa o
  termo); salvando (spinner + `aria-busy`); erro (toast destrutivo, **não** sai da
  página — preserva o trabalho). Sair com mudanças não salvas → `AlertDialog`
  "Descartar alterações?".

### Superfície 3 — Modal "Aplicar Kit" no orçamento (`Dialog`)

Acionado por (a) `[Aplicar]` num card de kit, (b) botão "Aplicar Kit" no
`QuoteEditor` (evolução do `KitPicker`), ou (c) a sugestão automática (4b). `Dialog`
`max-w-xl`, corpo `max-h-[70vh] overflow-y-auto`:

- Subtítulo-âncora de mental model: **"Opcionais vêm desmarcados — são sugestões, você
  escolhe."**
- Cada linha: `Checkbox` + marcador `●/○` + nome + `stepper` qtd + unit + subtotal.
  **Base pré-marcado** (`defaultChecked`); **opcional desmarcado**, agrupados sob um
  divisor "opcionais (sugestões)". Item desmarcado → `opacity-60`, subtotal `R$ —`,
  `stepper` `disabled`.
- Selo honesto "preços do catálogo de hoje" (`text-xs text-muted-foreground`) — ancora
  o conceito de snapshot.
- Footer: contagem viva "N de M itens" + **Total estimado** (`aria-live="polite"`); CTA
  `[Adicionar N itens ao orçamento]` (contagem dinâmica; `disabled` se 0 marcados).
- **Ao confirmar:** injeta cada item como `IQuoteItem` via `addOrIncrementItem` com
  **snapshot** de preço/OEM (reusa `expandKitToItems` adaptado para respeitar
  seleção/qtd do preview); grava `kit.id` em `IQuote.appliedKitIds`; fecha + toast
  success "N itens adicionados" com `[Desfazer]`.
- **Item sem preço:** subtotal "—" + badge `Sem preço`, continua selecionável; rodapé
  avisa. **Acessibilidade:** `<fieldset>`/`<legend>`; cada linha um `Checkbox` rotulado.

### Superfície 4 — Drift e sugestão automática

**4a. Banner de drift** (no editor, abaixo da busca): tom **info, jamais alarme** —
`bg-muted/50 border-border`, ícone `mdi:information-outline text-muted-foreground`,
"N peças compatíveis com este modelo estão fora deste kit." + `[Ver peças ▾]`
(`variant="link"`) que expande o sub-bloco com `[+ Adicionar]` por peça (progressive
disclosure). Se 0 peças fora → banner **não renderiza** (ausência honesta).

**4b. Sugestão automática no orçamento:** faixa discreta (`bg-muted/50`, ícone
`mdi:truck-outline`), **não** modal: "Este cliente tem um Scania R450 — aplicar Kit de
filtros?" `[Aplicar]` (abre o modal da Superfície 3) + `[Agora não]` (dispensa e **não
repete** na mesma sessão/orçamento). No máximo **uma** sugestão por vez; **não** sugerir
se já há itens de filtro no orçamento. `role="region" aria-label="Sugestão de kit"`, não
rouba foco.

## Matching, drift e a limitação do `modelId`

- **Matching Kit↔veículo:** o alvo é `vehicle.modelId === kit.modelId`, mas `IVehicle`
  **não tem `modelId`** neste sub-projeto (delta PRD-016). Então o casamento da sugestão
  automática (RF-013) e do card "Filtros" do veículo (RF-014) é feito por **string**:
  o `kit.modelId` resolve para `{ brand, model, engine }` via catálogo de modelos
  (PRD-034) e compara com `vehicle.brand/model/engine`. **Limitação conhecida**,
  documentada; o PRD-016 troca para `modelId` (drop-in). Encapsular o matching numa
  função única (`findKitsForVehicle`) para o PRD-016 reescrever só o interior.
- **Drift:** `getCompatiblePartsNotInKit(kit)` resolve a tripla do modelo do kit e cruza
  contra `IPart.applications` (`vehicleBrand`/`vehicleModel`/`engine`); peças que casam e
  não estão em `kit.items` viram o banner.

## RBAC + navegação + rotas + auditoria

- **Resource:** renomear `serviceKit` → `modelKit` em `resources.ts`. Atualizar
  `RESOURCE_LABELS` (`RolesPage.tsx`) → `modelKit: "Kits por modelo"` (exaustivo, senão
  `tsc` quebra). Remover o label antigo `serviceKit`.
- **Matriz** (`matrix.ts`): Vendedor `["view","create"]/store` + ação de aplicar (a
  aplicação no orçamento valida `modelKit:view`; criar é sempre `rascunho` para
  Vendedor); Gestor `CRUD + promote/demote/store`; Owner `CRUD/all`. A distinção
  rascunho-vs-oficial no salvar é regra de UI/serviço (Vendedor só persiste `rascunho`).
- **Promoção/despromoção:** ação dedicada (Gestor/Owner) com **audit log**.
- **Audit log** (`recordAuditLogSync`) em criar/editar/promover/despromover/excluir/
  **aplicar** (autor, timestamp, kit; `quoteId` de destino quando aplicável).
- **Rotas:**
  ```
  app.kits.$modelId.kit.novo.tsx          # editor — criar
  app.kits.$modelId.kit.$kitId.editar.tsx # editor — editar
  app.catalogo.kits.tsx (mantida)         # beforeLoad → redirect("/app/kits")
  ```
- **Navegação:** remover o item "Kits de revisão". O item "Kits por modelo" (PRD-034)
  permanece como única porta de entrada.

## Validação, erros e casos de borda

- **zod + react-hook-form:** `name` obrigatório (trim não-vazio); `modelId` presente
  (do contexto da rota); `category` ∈ união; ≥1 item; cada `defaultQuantity` inteiro
  `> 0`.
- **Toasts (sonner):** sucesso em criar/editar/promover/despromover/excluir/aplicar;
  erro com mensagem amigável e dados preservados.
- **Estados:** skeleton no carregamento; empty states distintos (sem kits no modelo vs
  busca-sem-resultado no editor); item sem preço tratado honestamente no modal.
- **Acessibilidade:** `h1`/`h2` semânticos; linha de card navegável real (não `div`
  com `onClick`); chips `aria-pressed`; `aria-live` em contadores/totais; alvos ≥44px;
  foco-trap nativo de Dialog (shadcn/Radix); `prefers-reduced-motion` respeitado.
- **Responsivo:** cards empilham no mobile; editor single-column; modal full-width.

## Fora de escopo (deferido)

- **Seed real por IA** (busca + sugestão de composição) — Fase 2 (placeholder
  desabilitado no editor).
- **Versionamento de Kit** — desnecessário (snapshot no orçamento resolve).
- **Kits `freios`/`correia`/`revisao` como dado semeado** — modelo acomoda; MVP semeia
  só `filtros`. Categorias criáveis, mas só o card "Filtros" do veículo aplica kit.
- **`IVehicle.modelId` e vínculo veículo↔modelo** — delta PRD-016 (matching por string
  até lá).
- **Persistência Supabase** (stub `NotImplementedError`) — Fase 2.
- **Import/export de Kits; kit no e-commerce/portal B2B; sugestão por histórico de
  manutenção** — fora do MVP.

## Critério de "feito"

- `IVehicleModelKit`/`IKitItem` definidos; `appliedKitIds?` somado a `IQuote`; barrel
  atualizado; `service-kit.ts` removido.
- Feature antiga `service-kits` substituída por `model-kits`; redirect ativo; nav com
  um único item; resource `modelKit` na matriz e labels.
- Provider `useModelKitsProvider` funcional em mock; stub supabase lança erro.
- Seed de ~10 kits `filtros` consistente com catálogos de peças e de modelos.
- Detalhe do modelo lista os kits (cards, `●/○`, badges, ações por papel); curadoria
  via filtro "Com rascunhos pendentes" + indicador na pílula "Kits N".
- Editor (página dedicada) cria/edita kit com busca de catálogo, qtd, opcional, nota;
  IA desabilitada com tooltip; banner de drift funcional.
- "Aplicar Kit" no orçamento abre o modal de preview, injeta `IQuoteItem` com snapshot,
  grava `appliedKitIds`, e oferece `[Desfazer]`. Sugestão automática por string aparece
  quando casa e não é redundante.
- RBAC: Vendedor cria rascunho + aplica; Gestor/Owner curam; audit log nas mutações e na
  aplicação.
- `tsc --noEmit` filtrado pelos arquivos da feature = vazio; prettier por-arquivo limpo.
- Versão: MINOR, codinome **"Kit"**; CHANGELOG + CLAUDE.md + tag `vX.Y.0`;
  `PRD-035-kits-composicao_DONE.md`.

## Limitações conhecidas (registradas de propósito)

1. **Matching por string até o PRD-016** — sem `IVehicle.modelId`, sugestão automática e
   card do veículo casam por `brand+model+engine`. Encapsulado em `findKitsForVehicle`
   para troca drop-in no PRD-016.
2. **Categorias não-filtros sem dado/aplicação** — criáveis, mas sem seed e sem wiring de
   aplicação no detalhe do veículo no MVP.
3. **Bloqueio de exclusão por vínculo** (kit aplicado em orçamentos) — não implementado;
   o snapshot no orçamento já desacopla, então excluir um kit não afeta orçamentos
   passados. Documentar como decisão, não bug.

## Pendência de processo (fim do épico)

Ao concluir os 3 sub-projetos, **mesclar os dois deltas divergentes**
(`DELTAS-…md` = Copiloto/PRD-025 + `DELTAS-…(1).md` = Kits/PRD-034-035) num único
documento canônico **v1.3** (Kits **+** Copiloto), pois hoje nenhum é superconjunto do
outro.
