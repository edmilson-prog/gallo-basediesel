# Design — Catálogo de Modelos de Veículos (PRD-034)

> **PRD:** PRD-034 · **Data:** 2026-06-03 · **Autor:** sessão Claude Opus 4.8 (1M context)
> **Status:** aguardando revisão do usuário
> **Épico:** Composição por Modelo (Kits) — **sub-projeto 1 de 3**

## Contexto

O épico "Composição por Modelo" entrega três sub-projetos sequenciais, cada um com
seu próprio ciclo spec → plano → implementação → versão:

1. **PRD-034 (este)** — catálogo canônico de modelos de veículo (`IVehicleModel`).
2. **PRD-035** — kits de peças pendurados no modelo (`IVehicleModelKit`), com a
   **consolidação** da feature de "Kits de revisão" (`IServiceKit`) já entregue na
   v0.62.0.
3. **Delta PRD-016** — `IVehicle.modelId` + aplicar Kit no detalhe do veículo.

**Decisão estratégica já tomada (usuário):** *consolidar*. Não haverá dois conceitos
de kit. O `IServiceKit` atual evolui para o kit-pendurado-no-modelo no sub-projeto 2.
Este sub-projeto 1 **não toca** no `IServiceKit`; apenas cria a base (catálogo de
modelos) sobre a qual os kits passarão a se apoiar.

### Achados da exploração que moldam este design

- **Já existe `SEED_VEHICLE_MODELS`** (`src/mocks/data/seedVehicleModels.ts`): 18
  modelos-base (`IVehicleModelEntry`) das 5 marcas, usados pelo gerador para criar os
  ~60 veículos. É praticamente o catálogo canônico que o PRD-034 pede — será
  **promovido** a fonte do `IVehicleModel`, não recriado do zero.
- **Já existe convenção marca→ícone mdi** em `src/shared/types/storefront.ts`
  (`volvo→mdi:truck`, `scania→mdi:truck-fast`, `mercedes-benz→mdi:car-estate`,
  `ford-cargo→mdi:truck-cargo-container`, `iveco→mdi:tow-truck`). Será reusada (e
  promovida a helper compartilhado `getBrandIcon`) para os avatares de marca — sem
  depender de logos proprietários.
- **`/app/veiculos`** é a *frota de clientes* (veículos-instância com dono/histórico).
  O catálogo de modelos é o oposto: uma *taxonomia de referência* sem dono. O design
  deve parecer uma **biblioteca de referência**, distinta de `/app/veiculos` e de
  `/app/catalogo` (peças).
- **Tipos de domínio** vivem em `src/shared/types/<dominio>.ts` (arquivo por domínio),
  com barrel em `index.ts` — confirma o caminho `src/shared/types/vehicle-models.ts`
  assumido pelo PRD.
- **RBAC** usa resources em **camelCase** no array `RESOURCES as const`
  (`src/features/rbac/permissions/resources.ts`) e método de exclusão **`delete`** nos
  providers. Logo o PRD `vehicle_model.*` vira o resource **`vehicleModel`**.

## Objetivo

Permitir que **Owner/Gestor** mantenham um catálogo canônico de modelos
(marca + modelo + motor + faixa de anos + status) pela interface, eliminando strings
livres divergentes e criando a **chave estável (`modelId`)** sobre a qual os Kits
(PRD-035) e a frota (delta PRD-016) vão se apoiar. **Vendedor** vê o catálogo em
leitura. Esta entrega cobre apenas o catálogo de modelos (a "espinha" de `/app/kits`);
a gestão de kits dentro de cada modelo chega no PRD-035.

## Princípios e restrições

- **Fase 1 (Frontend First):** persistência mock in-memory (escritas valem na sessão,
  se perdem no reload). Stub Supabase lança `NotImplementedError`. Persistência real
  fica para a Fase 2.
- **Provider Pattern:** a feature consome apenas `useVehicleModelsProvider`; nunca
  importa `impl/*` direto (bloqueado por ESLint).
- **TypeScript strict**, zero `any`; interfaces de domínio prefixadas com `I`;
  `status` via union literal.
- **Tokens semânticos apenas** (sem hex/cores Tailwind cruas/`--gallo-*`). Light +
  dark obrigatórios. WCAG 2.1 AA.
- **Consistência:** seguir os padrões já existentes (provider/mock de `serviceKits`,
  RBAC via matriz, navegação em `navigation.ts`/`routes.ts`).
- **Não orfanar a v0.62.0:** os "Kits de revisão" atuais permanecem funcionais em
  `/app/catalogo/kits` durante este sub-projeto.

## Decisões de produto

| Decisão | Escolha |
|---|---|
| Rota da área | **`/app/kits`** (espinha = lista de modelos) |
| Rótulo do menu | **"Kits por modelo"** (novo item no grupo "Comercial") |
| Layout | **Lista agrupada por marca → página de detalhe `/app/kits/$modelId`** |
| Avatar de marca | Ícone mdi de `storefront.ts`, monocromático sobre `bg-muted` |
| Agrupamento | Por marca, cabeçalho de grupo sticky com contador |
| Status inativo | "Arquivado": badge `muted` + linha esmaecida; filtro esconde por padrão |
| Fonte dos mocks | Promover `SEED_VEHICLE_MODELS` (18 base) + dobrar combos de `applications` |
| Quem gerencia | **Owner/Gestor** (Vendedor só lê) |
| Resource RBAC | **`vehicleModel`** (camelCase), ações `view/create/edit/delete` |

## Arquitetura de informação e layout

**Lista agrupada por marca → detalhe em rota própria.** Descartados: split-pane
(espaço morto com ~20–60 modelos; sufoca a sub-tabela de kits da fase seguinte) e
grid-de-cards como layout primário (não comporta kits; ar de vitrine). A rota de
detalhe dá ao modelo um container de crescimento — consistente com `/app/veiculos/$id`
e `/app/clientes`.

```
Modelos · 47                                          [+ Novo modelo]
🔍 Buscar marca, modelo ou motor…
Marca: [Todas][⚡Scania][🚛Volvo][🚐Mercedes][📦Ford][🛻Iveco]   [ ] Mostrar inativos
                                                       (container max-w-5xl)
┌─ ⚡ SCANIA · 12 modelos ───────────────────────────────────────┐
│ (•) R450   DC13   2018–atual    ● Kits 0    ⋮                   │ ← linha clicável
│ (•) P320   DC09   2016–2022     ● Kits 0    ⋮                   │
│ (•) G410   DC13   2015–2021  ·Inativo·  Kits 0  ⋮   (esmaecida) │
└────────────────────────────────────────────────────────────────┘
┌─ 🚛 VOLVO · 9 modelos ─────────────────────────────────────────┐ …

(•) = avatar de marca (mdi)   ⋮ = ações (Editar / Inativar) — só Owner/Gestor
```

**Diferenciação do catálogo de peças (denso):** densidade confortável (`py-3`+),
agrupamento por marca com cabeçalho sticky, avatar de marca, **sem** menu de
colunas/resize/paginação, container `max-w-5xl`, linha inteira clicável
(`hover:bg-muted/50`). Motor tratado como **herói tipográfico** (desambiguador
crítico — DC13 ≠ DC09 = peças distintas): chip/sub-rótulo forte `tabular-nums`, não
texto cinza qualquer.

**Antecipação da hierarquia (sem poluir):** pílula **"Kits N"** presente em cada linha
exibindo `0` hoje (mesmo componente passa a `3` no PRD-035). No detalhe, seção "Kits
deste modelo" com empty state honesto ("Em breve você poderá montar kits…"). **Sem**
abas desabilitadas com cadeado, **sem** números fake.

**Página de detalhe `/app/kits/$modelId` (entrega 034):** cabeçalho do modelo (avatar
+ modelo/motor/anos/status + ações Editar/Inativar para Owner/Gestor) + breadcrumb
`Kits por modelo / Scania R450 (DC13)` + seção "Kits deste modelo" como slot vazio.
No PRD-035 essa seção recebe a `KitsTable`/`KitForm` migradas.

## Modelo de dados

`src/shared/types/vehicle-models.ts`:

```ts
export type VehicleModelStatus = "ativo" | "inativo";

export interface IVehicleModel {
  id: ID;
  brand: string;            // "Scania"
  model: string;            // "R 450"
  engine: string;           // "DC13 143 Euro 5"
  yearStart?: number;
  yearEnd?: number;
  status: VehicleModelStatus;
  createdBy: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
  updatedBy?: ID;
}
```

Re-exportar no barrel `src/shared/types/index.ts`.

### Consolidação / seed

- **Fonte primária:** `SEED_VEHICLE_MODELS` (18 `IVehicleModelEntry`). Cada entry tem
  uma **lista de motores** (o gerador sorteia um por veículo). A consolidação
  **expande cada variante de motor em uma entrada canônica distinta** de
  `IVehicleModel` (ex.: Scania R 450 com DC13 143 Euro 5 e DC13 143 Euro 6 → duas
  entradas corretas e distintas).
- **Reforço por aplicações:** dobrar combinações `brand+model+engine` distintas
  presentes nas `IPart.applications` que ainda não existam após a expansão acima.
- **Normalização:** não fundir motores legitimamente distintos; documentar (em
  comentário no gerador) as regras de normalização aplicadas. Garantir cobertura das
  5 marcas.
- **Não alterar** o gerador de veículos nesta entrega — apenas derivar o catálogo de
  modelos a partir da mesma fonte. (O vínculo `IVehicle.modelId` é do delta PRD-016.)

## Camada de provider + mock

- **Contract** `src/providers/data/contracts/vehicleModels.ts`:
  ```ts
  export interface ICreateVehicleModelInput {
    brand: string; model: string; engine: string;
    yearStart?: number; yearEnd?: number;
  }
  export interface IListVehicleModelsParams {
    brand?: string; status?: VehicleModelStatus; search?: string;
  }
  export interface IVehicleModelsProvider {
    list(params?: IListVehicleModelsParams): Promise<IVehicleModel[]>;
    get(id: ID): Promise<IVehicleModel>;
    create(input: ICreateVehicleModelInput): Promise<IVehicleModel>;
    update(id: ID, patch: Partial<ICreateVehicleModelInput> & { status?: VehicleModelStatus }): Promise<IVehicleModel>;
    delete(id: ID): Promise<void>;
  }
  ```
- **Mock api** `src/mocks/api/vehicleModels.ts`: store in-memory semeado pela
  consolidação; `runApi("vehicleModelsApi", …)`; validação (`MockValidationError`:
  marca/modelo/motor obrigatórios; duplicata marca+modelo+motor); `MockNotFoundError`
  em get/update/delete inexistente; id determinístico-incremental
  (`vmodel-<slug>-<n>`).
- **Impls:** `impl/mock/vehicleModels.ts` delega à api; `impl/supabase/vehicleModels.ts`
  stub com `NotImplementedError`.
- **Factory + hook:** registrar a slice `vehicleModels` em `factory.ts` (mock +
  supabase) e expor `src/providers/data/hooks/useVehicleModelsProvider.ts` via
  `useDataProviderSlice("vehicleModels", "useVehicleModelsProvider")`.
- **Inativar vs excluir:** "Inativar" é `update({ status: "inativo" })`. `delete`
  físico só é oferecido quando o modelo não tem vínculos (nesta fase não há kits nem
  `modelId` em veículos, então `delete` é permitido livremente; a regra de bloqueio
  por vínculo entra de fato no PRD-035/016 — documentar como ponto de evolução).

## RBAC + navegação + rotas

- **Resource:** adicionar `"vehicleModel"` a `RESOURCES`
  (`src/features/rbac/permissions/resources.ts`).
- **Matriz** (`matrix.ts`): Owner `CRUD/all`; Gestor `CRUD/store`; Vendedor
  `["view"]`. (Demais papéis sem acesso.)
- **`RESOURCE_LABELS`** (`RolesPage.tsx`): `vehicleModel: "Modelos de veículo"`.
- **Audit log** em criar/editar/inativar (autor, timestamp, valores alterados),
  conforme padrão do projeto.
- **Rotas (TanStack Router file-based):**
  ```
  app.kits.tsx            # wrapper <Outlet> + guard de role (view)
  app.kits.index.tsx      # VehicleModelsListPage
  app.kits.novo.tsx       # form de criação (modo página)
  app.kits.$modelId.tsx   # VehicleModelDetailPage (cabeçalho + slot de kits)
  app.kits.$modelId.editar.tsx  # form de edição (modo página)
  ```
  Constante `APP_KITS = "/app/kits"` em `routes.ts`.
- **Navegação:** novo `INavItem` `{ label: "Kits por modelo", icon: "mdi:truck-outline", to: ROUTES.APP_KITS, roles: ["Owner","Gestor","Vendedor"] }`
  no grupo "Comercial" (ícone distinto do "Kits de revisão", que usa
  `mdi:toolbox-outline`). O item antigo "Kits de revisão" permanece nesta entrega.

## Estrutura da feature

```
src/features/vehicle-models/
  pages/
    VehicleModelsListPage.tsx   # lista agrupada por marca + busca + filtros + contador
    VehicleModelFormPage.tsx    # casca "página" (rotas /novo e /$modelId/editar)
    VehicleModelDetailPage.tsx  # cabeçalho do modelo + slot "Kits deste modelo"
  components/
    BrandGroup.tsx              # cabeçalho de marca sticky + lista de linhas
    VehicleModelRow.tsx         # avatar + modelo/motor + anos + status + pílula Kits + ações
    VehicleModelForm.tsx        # campos: marca(select 5+Outro), modelo, motor, anos
    BrandFilterChips.tsx        # chips das 5 marcas (aria-pressed)
    BrandAvatar.tsx             # avatar mdi por marca (getBrandIcon)
    DeleteVehicleModelDialog.tsx# confirmação de inativar/excluir
  hooks/
    useVehicleModels.ts         # query lista — key ["vehicle-models", params]
    useVehicleModelMutations.ts # create/update(inativar)/delete + invalidate + toast
  utils/
    consolidateModels.ts        # (gerador) expansão de motores + dobra de applications
    brandIcon.ts                # getBrandIcon(brand) — promove a fonte de storefront.ts
  index.ts
```

A URL sincroniza busca + filtros (padrão do projeto). Busca com debounce 300ms.

## Validação, erros e casos de borda

- **Validação** (zod + react-hook-form): `brand`, `model`, `engine` obrigatórios
  (trim não-vazio); `yearStart`/`yearEnd` opcionais, inteiros, `yearStart ≤ yearEnd`
  quando ambos presentes.
- **Duplicata:** combinação `brand+model+engine` única — bloquear criação/edição com
  feedback inline "Modelo já existe no catálogo".
- **Inativo:** linha esmaecida + badge textual "Inativo" (não só cor; contraste
  AA preservado via `text-muted-foreground`, não só `opacity`). Toggle "Mostrar
  inativos" (default off).
- **Toasts (sonner):** sucesso em criar/editar/inativar/reativar/excluir; erro com
  mensagem amigável, dados do formulário preservados.
- **Estados:** skeleton no carregamento; empty state inicial ("Nenhum modelo
  cadastrado ainda" + CTA "Cadastrar primeiro modelo" só Owner/Gestor; Vendedor vê
  mensagem neutra sem CTA); estado busca-sem-resultado distinto do empty inicial.
- **Acessibilidade:** `h1` "Modelos", cabeçalho de marca `h2` em `<section
  aria-labelledby>`; linha navegável como `<a>`/`<button>` real (não `onClick` em
  `div`), com o menu de ações como botão irmão (sem nested interactive); chips
  `aria-pressed`; contador com `aria-live="polite"`; avatar `aria-hidden` (nome
  textual carrega a semântica); alvos de toque ≥ 44px.
- **Responsivo:** pilha vertical no mobile (avatar + modelo/motor à esquerda; status +
  menu à direita); chips em scroll horizontal ou Sheet "Filtros"; detalhe single-column.

## Fora de escopo (deferido)

- **Gestão de kits dentro do modelo** — PRD-035 (slot vazio honesto nesta entrega).
- **`IVehicle.modelId` e vínculo de veículos a modelos** — delta PRD-016.
- **Bloqueio de exclusão por vínculo** (kits/veículos) — efetiva no PRD-035/016.
- **Migração dos "Kits de revisão" atuais e redirect `/app/catalogo/kits`** — PRD-035.
- **Persistência Supabase** (stub lança `NotImplementedError`) — Fase 2.
- **Importação DINTEC/base externa, imagens do modelo, specs estruturadas** — Fase 2.

## Critério de "feito"

- Owner/Gestor cria, edita, inativa/reativa e exclui modelos em `/app/kits`
  (formulário em **modo página**, rotas `/novo` e `/$modelId/editar`). A escolha de
  casca de UX (página/dialog/drawer) pertence ao formulário de **kit** e fica para o
  PRD-035 — o formulário de modelo, com 4 campos, é só página.
- Lista agrupada por marca, com busca, filtro por marca (chips) e toggle de inativos;
  contador "N modelos" reativo; avatares de marca; detalhe `$modelId` com slot de kits.
- Catálogo semeado por consolidação (motores expandidos; 5 marcas cobertas; sem
  duplicatas para a mesma combinação real).
- Provider `useVehicleModelsProvider` funcional em mock; stub supabase lança erro.
- RBAC: Vendedor em leitura (sem "Novo modelo"/menu de ações); audit log em mutações.
- `tsc --noEmit` filtrado pelos arquivos da feature = vazio; prettier/eslint limpos
  por-arquivo.
- Versão: MINOR, codinome **"Catalog"**; CHANGELOG + CLAUDE.md + tag `vX.Y.0`.

## Pendência de processo (fim do épico)

Ao concluir os 3 sub-projetos, **mesclar os dois deltas divergentes**
(`DELTAS-...md` = Copiloto/PRD-025 + `DELTAS-...(1).md` = Kits/PRD-034-035) num único
documento canônico **v1.3** (Kits **+** Copiloto), pois hoje nenhum é superconjunto do
outro.
