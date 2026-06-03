# PRD-035: Kits de Composição por Modelo

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                                          |
| **Repositório**       | (repositório do projeto GALLO BASE DIESEL)                                                                                                                                                                                                                                        |
| **Objetivo**          | Permitir que uma composição curada de peças (foco em filtros) seja definida por modelo de veículo e aplicada com um clique no orçamento, no SDR e a partir do detalhe do veículo — eliminando o retrabalho de remontar orçamentos item a item para clientes com o mesmo caminhão. |
| **Tipo**              | Feature                                                                                                                                                                                                                                                                           |
| **Complexidade**      | Alta                                                                                                                                                                                                                                                                              |
| **Total de Fases**    | 5                                                                                                                                                                                                                                                                                 |
| **Prioridade**        | Alta                                                                                                                                                                                                                                                                              |
| **Épico**             | Composição por Modelo (Kits)                                                                                                                                                                                                                                                      |
| **PRDs Relacionados** | PRD-034 (Catálogo de Modelos), PRD-030 (Catálogo de Peças), PRD-031 (Orçamento), PRD-022 (Orçamento via SDR), PRD-016 (Veículos), PRD-006 (RBAC), PRD-004 (Mocks), PRD-005 (Provider Pattern), PRD-002 (Modelo Conceitual)                                                        |
| **Padrão de código**  | Feature-based; código em `src/features/model-kits/`; tipos em `src/shared/types/model-kits.ts`                                                                                                                                                                                    |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios                                                       |
| ------------ | --------------------------------------------------------------- |
| **Baixa**    | 1 arquivo, sem dependências externas, < 100 linhas              |
| **Média**    | 2-5 arquivos, banco OU integração, funcionalidade isolada       |
| **Alta**     | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** entidade nova (`IVehicleModelKit` + `IKitItem`) com curadoria (rascunho/oficial), itens como referência viva, e flag de opcionalidade; lógica de matching Kit↔veículo via `modelId`; detecção de drift (peças compatíveis fora do Kit); três superfícies de aplicação (detalhe do veículo via cards de recomendação do PRD-016, orçamento PRD-031 com modal de preview e snapshot, SDR PRD-022); ajuste em `IQuote` (`appliedKitIds`); placeholder de seed por IA (Fase 2); permissões granulares + audit log. Consome PRD-034, PRD-030, PRD-031, PRD-022 e PRD-016.

---

## Contexto do Problema

A GALLO atende frotas de caminhões pesados. Um mesmo modelo de caminhão (ex.: Scania R450 DC13) aparece em vários clientes diferentes. Hoje, ao montar um orçamento, o vendedor seleciona peça a peça no catálogo — e repete exatamente a mesma sequência de filtros toda vez que atende outro cliente com o mesmo modelo. O trabalho é redundante porque **a composição de filtros é propriedade do modelo, não do cliente**.

A dor é concreta e recorrente: para os itens de revisão mais comuns (filtros de óleo, ar, combustível, separador de água), o conjunto é praticamente sempre o mesmo por modelo+motor. A composição típica é conhecida e estável — a pesquisa de mercado e o próprio catálogo (PRD-030) confirmam as subcategorias de filtro por modelo. Falta a camada que **reúne esse conjunto numa unidade curada e reutilizável**.

Este PRD entrega o Kit: uma composição curada de peças pendurada no modelo canônico (PRD-034), aplicável com um clique. Reduz drasticamente o tempo de orçamento repetitivo, padroniza recomendações e captura conhecimento tácito do vendedor (o que sempre entra, o que é opcional). É a entrega central do épico de composição por modelo.

---

## Conceito da Solução

### Situação Atual (As-Is)

- O orçamento (PRD-031) monta itens individualmente via `<AddItemModal>` → busca catálogo → adiciona peça → quantidade.
- Para clientes com o mesmo modelo, a sequência é integralmente repetida.
- No detalhe do veículo (PRD-016), os cards de "Recomendações de manutenção" (Filtros, Freios, Correia, Revisão) têm botão "Criar orçamento" que hoje abre um orçamento vazio.
- A relação peça↔modelo existe apenas via `IPart.applications` (sem curadoria nem agrupamento por modelo).

### Situação Desejada (To-Be)

- Existe `IVehicleModelKit`: composição curada de peças por modelo (foco em filtros no MVP).
- O Kit é gerenciado em `/app/kits`, dentro da navegação por modelo (espinha entregue no PRD-034).
- O vendedor aplica o Kit com um clique em três superfícies: detalhe do veículo, orçamento e SDR.
- No orçamento, "Aplicar Kit" abre um **modal de preview** (itens não-opcionais pré-marcados, opcionais a confirmar, quantidades editáveis); ao confirmar, os itens entram como `IQuoteItem` com **snapshot** de preço/OEM no ato.
- O sistema detecta **drift** (peças compatíveis com o modelo que não estão no Kit) e oferece adicioná-las.
- `IQuote` registra `appliedKitIds` para a métrica "% de orçamentos via Kit" (Bloco 4).

**Entidades:**

```typescript
interface IVehicleModelKit {
  id: ID;
  modelId: ID; // referência ao IVehicleModel (PRD-034)
  name: string; // "Kit Filtros — Scania R450 DC13"
  category: "filtros" | "freios" | "correia" | "revisao" | "custom"; // MVP foca 'filtros'
  items: IKitItem[];
  status: "rascunho" | "oficial";
  storeId: ID;
  createdBy: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
  updatedBy?: ID;
}

interface IKitItem {
  partId: ID; // referência VIVA ao IPart (PRD-030) — NÃO snapshot
  defaultQuantity: number; // ex.: 1; combustível costuma vir em par (2)
  isOptional: boolean; // false = pré-marcado no preview; true = sugestão a confirmar
  note?: string; // ex.: "trocar a cada 30.000 km"
}
```

**Ajuste em `IQuote` (delta PRD-002/PRD-031):**

```typescript
// adicionar a IQuote
appliedKitIds?: ID[];          // rastreabilidade leve para métrica de adoção
```

**Lógica essencial:**

- **Matching Kit↔veículo:** `vehicle.modelId === kit.modelId`. Fallback por marca+modelo quando `vehicle.modelId` for nulo (veículo ainda não vinculado). Retorna lista; oficiais antes de rascunhos.
- **Drift:** `getCompatiblePartsNotInKit(kit)` cruza `IPart.applications` que casam com o modelo do Kit contra `kit.items`; o que faltar é exibido em banner com ação de adicionar.
- **Categoria ↔ cards de recomendação:** `category` mapeia 1:1 com os cards do detalhe do veículo (Filtros/Freios/Correia/Revisão). O botão "Criar orçamento" de cada card aplica o Kit da categoria correspondente.
- **Snapshot:** o Kit é vivo; o congelamento de preço/OEM acontece somente no `IQuoteItem` ao aplicar (padrão de snapshots do projeto). Isso dispensa versionamento do Kit — orçamentos antigos não mudam porque já fizeram snapshot.

### Alternativas Consideradas

| Alternativa                                                 | Por que foi descartada                                                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Kit derivado automaticamente das aplicações (sem curadoria) | Não escolhe entre equivalentes, não captura conhecimento tácito (opcional/quantidade), traria ruído de catálogo. |
| Snapshot de preço/OEM dentro do Kit                         | Kit é definição viva; snapshot pertence ao orçamento. Snapshot no Kit exigiria versionamento e desatualizaria.   |
| Kit como SKU "virtual" no catálogo de peças                 | Poluiria o catálogo; perderia a flexibilidade de opcionalidade e quantidade no momento do orçamento.             |
| Gerenciar Kit dentro de um veículo específico               | Perderia o reuso (o objetivo do PRD): voltaria ao trabalho item a item por veículo. Kit é por modelo.            |
| Casar Kit por strings de marca/modelo/motor                 | Frágil (variações divergentes). Resolvido pela chave canônica `modelId` do PRD-034.                              |

---

## Escopo

### Incluído

- ✅ Entidades `IVehicleModelKit` e `IKitItem` em `src/shared/types/model-kits.ts`
- ✅ Campo `appliedKitIds?: ID[]` adicionado a `IQuote`
- ✅ Mocks (PRD-004): ~10 Kits de categoria `filtros` para modelos comuns das 5 marcas, mix oficial/rascunho, 3-5 itens cada
- ✅ `useModelKitsProvider` (Provider Pattern) com interface estável
- ✅ Gestão de Kits em `/app/kits` (dentro da navegação por modelo do PRD-034): listar, criar, editar, promover, despromover, excluir
- ✅ Editor de Kit: busca no catálogo (PRD-030), quantidade, toggle `isOptional`, nota
- ✅ Curadoria: Vendedor cria `rascunho`; Gestor promove a `oficial` (padrão de promoção de tags)
- ✅ Detecção de drift com banner "N peças compatíveis fora do Kit" + ação de adicionar
- ✅ Aplicação no orçamento (PRD-031): botão "Aplicar Kit" + modal de preview + snapshot em `IQuoteItem`
- ✅ Sugestão automática no orçamento quando o cliente tem veículo com `modelId` que casa
- ✅ Aplicação a partir do detalhe do veículo (PRD-016): card "Filtros" → "Criar orçamento" aplica o Kit (parte coberta pelo delta PRD-016)
- ✅ Aplicação via SDR (PRD-022): placeholder coerente no mockup
- ✅ Botão "Sugerir composição (IA)" desabilitado com tooltip "Disponível na Fase 2"
- ✅ Permissões (PRD-006) + audit log em criar/editar/promover/excluir/aplicar
- ✅ Empty states contextuais

### Excluído

- ❌ Seed real por IA (busca + sugestão automática de composição) — Fase 2 (LangChain/n8n)
- ❌ Versionamento de Kit — desnecessário (snapshot no orçamento resolve)
- ❌ Kits de categorias `freios`, `correia`, `revisao` — modelo acomoda, mas MVP entrega apenas `filtros`
- ❌ Kit no e-commerce / portal B2B (Bloco 5/6) — fora do MVP deste PRD
- ❌ Import/export de Kits — Fase 2
- ❌ Sugestão de Kit baseada em histórico de manutenção do veículo — fora do MVP

---

## Requisitos Funcionais

### Modelo e mocks

- **RF-001:** Definir `IVehicleModelKit` e `IKitItem` em `src/shared/types/model-kits.ts`.
- **RF-002:** Adicionar `appliedKitIds?: ID[]` a `IQuote` (delta do PRD-002/PRD-031).
- **RF-003:** Gerar mocks (PRD-004): ~10 Kits de categoria `filtros` para modelos comuns das 5 marcas, mix oficial/rascunho, 3-5 itens cada, referenciando `partId` reais do catálogo (PRD-030) e `modelId` reais do catálogo de modelos (PRD-034).

### Provider

- **RF-004:** Criar `useModelKitsProvider` com interface estável (`list`, `get`, `create`, `update`, `delete`), preparado para drop-in replacement Mock → Supabase na Fase 2.

### Gestão e editor (em /app/kits)

- **RF-005:** Dentro da navegação por modelo (PRD-034), exibir os Kits de cada modelo (nome, categoria como badge, nº de itens, status como badge).
- **RF-006:** Editor de Kit (`/app/kits` — criação/edição) com: seleção de modelo (`modelId`), nome, categoria, e editor de itens (busca no catálogo PRD-030, quantidade, toggle `isOptional`, nota).
- **RF-007:** Validações: `modelId` e nome obrigatórios; ≥ 1 item; `defaultQuantity` > 0.
- **RF-008:** Salvar como `rascunho` ou `oficial` conforme permissão. Vendedor salva apenas `rascunho`; Gestor/Owner pode salvar/promover a `oficial`.
- **RF-009:** Promoção (`rascunho`→`oficial`) e despromoção (`oficial`→`rascunho`) por Gestor/Owner, com audit log.

### Drift de catálogo

- **RF-010:** `getCompatiblePartsNotInKit(kit)` cruza `IPart.applications` que casam com o modelo do Kit contra `kit.items`; exibir banner "N peças compatíveis fora do Kit" com ação de adicionar item ao Kit.

### Aplicação no orçamento (PRD-031)

- **RF-011:** Botão "Aplicar Kit" na criação/edição de orçamento. Ao acionar, abrir **modal de preview** listando os itens do Kit: não-opcionais pré-marcados, opcionais desmarcados, quantidades editáveis.
- **RF-012:** Ao confirmar o preview, injetar os itens selecionados como `IQuoteItem` com **snapshot** de preço/OEM no ato (padrão PRD-031). Registrar o `kit.id` em `IQuote.appliedKitIds`.
- **RF-013:** Sugestão automática: quando o orçamento tem cliente com veículo cujo `modelId` casa com um ou mais Kits oficiais, exibir sugestão ("Este cliente tem um [modelo] — aplicar Kit de filtros?"). Se houver mais de um Kit aplicável, listar as opções.

### Aplicação no detalhe do veículo (PRD-016) e SDR (PRD-022)

- **RF-014:** A partir do detalhe do veículo, o card de recomendação "Filtros" → "Criar orçamento" aplica o Kit de categoria `filtros` do modelo do veículo (comportamento detalhado no delta do PRD-016).
- **RF-015:** No SDR (PRD-022), permitir anexar Kit ao montar orçamento — placeholder coerente no mockup (sem automação de IA).

### Seed por IA (placeholder) e permissões

- **RF-016:** Botão "Sugerir composição (IA)" no editor, **desabilitado**, com tooltip "Disponível na Fase 2".
- **RF-017:** Permissões (PRD-006): Vendedor cria `rascunho` + aplica; Gestor cria/edita/promove/despromove/exclui; Owner cross-store. Audit log em criar/editar/promover/excluir/aplicar.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Aplicação de Kit (preview → injeção no orçamento) responde em < 1s sobre o dataset mockado.
- **RNF-002 (Snapshots):** Itens aplicados ao orçamento preservam preço/OEM no momento da aplicação, independentemente de mudanças posteriores no catálogo ou no Kit.
- **RNF-003 (Tipagem):** Zero `any`; `category` e `status` tipados via union literal.
- **RNF-004 (Drop-in replacement):** Provider preparado para troca Mock → Supabase via `VITE_DATA_SOURCE`.
- **RNF-005 (Acessibilidade):** WCAG 2.1 AA; light + dark mode obrigatórios.

---

## Critérios de Aceitação

### RF-011 / RF-012: Aplicar Kit no orçamento

```gherkin
DADO que estou criando um orçamento e existe o Kit oficial "Kit Filtros — Scania R450 DC13"
QUANDO clico em "Aplicar Kit" e seleciono esse Kit
ENTÃO abre um modal de preview com os itens do Kit
  E os itens não-opcionais aparecem pré-marcados
  E os itens opcionais aparecem desmarcados
  E posso editar as quantidades

DADO que confirmo o preview com os itens marcados
QUANDO o modal fecha
ENTÃO os itens entram no orçamento como IQuoteItem com snapshot de preço/OEM
  E o id do Kit é registrado em IQuote.appliedKitIds
```

### RF-013: Sugestão automática

```gherkin
DADO um orçamento cujo cliente tem um veículo com modelId que casa com um Kit oficial
QUANDO a seção de itens carrega
ENTÃO o sistema sugere aplicar o Kit do modelo
  E se houver mais de um Kit aplicável, lista as opções
```

### RF-010: Drift de catálogo

```gherkin
DADO um Kit cujo modelo tem 5 peças compatíveis no catálogo, das quais 3 estão no Kit
QUANDO abro o editor do Kit
ENTÃO vejo o banner "2 peças compatíveis fora do Kit"
  E posso adicioná-las ao Kit
```

### RF-008 / RF-009: Curadoria

```gherkin
DADO que sou Vendedor
QUANDO crio um Kit
ENTÃO só consigo salvá-lo como rascunho

DADO que sou Gestor e existe um Kit em rascunho
QUANDO clico em "Promover a oficial"
ENTÃO o status muda para oficial
  E o audit log registra autor e timestamp
```

### Cenários de Erro

```gherkin
DADO que tento salvar um Kit sem itens
QUANDO confirmo
ENTÃO o sistema bloqueia e exibe "Adicione ao menos um item ao Kit"

DADO que clico em "Sugerir composição (IA)"
QUANDO o botão está desabilitado
ENTÃO vejo o tooltip "Disponível na Fase 2"
  E nenhuma ação é executada
```

---

## Fases de Implementação

| Fase | Objetivo                                               | Arquivos Estimados |
| ---- | ------------------------------------------------------ | ------------------ |
| 1    | Modelo + mocks + `appliedKitIds`                       | 3-4                |
| 2    | Provider + permissões + gestão/editor em /app/kits     | 4-5                |
| 3    | Drift + curadoria (promoção/despromoção)               | 2-3                |
| 4    | Aplicação no orçamento (preview + snapshot + sugestão) | 3-4                |
| 5    | Veículo/SDR + placeholder IA + polish                  | 3-4                |

### Detalhamento das Fases

#### Fase 1: Modelo e mocks

**Objetivo:** entidades e dados de Kit disponíveis.

**Ações:**

- [ ] Definir `IVehicleModelKit` e `IKitItem`
- [ ] Adicionar `appliedKitIds?` a `IQuote`
- [ ] Gerar ~10 Kits `filtros` mockados (referências reais de `partId` e `modelId`)

**Validação:** Kits mockados consistentes com catálogo de peças e de modelos.

#### Fase 2: Provider, permissões e gestão

**Objetivo:** CRUD de Kit operacional e seguro.

**Ações:**

- [ ] `useModelKitsProvider` com interface estável
- [ ] Permissões `model_kit.*` (PRD-006) + matriz de auditoria
- [ ] Listagem de Kits por modelo + editor (busca catálogo, qtd, opcional, nota)

**Validação:** Gestor cria/edita Kit; Vendedor cria rascunho; permissões aplicadas.

#### Fase 3: Drift e curadoria

**Objetivo:** Kit curado vivo.

**Ações:**

- [ ] `getCompatiblePartsNotInKit` + banner de drift
- [ ] Promoção/despromoção com audit log

**Validação:** drift exibido corretamente; promoção registrada.

#### Fase 4: Aplicação no orçamento

**Objetivo:** o clique que elimina o retrabalho.

**Ações:**

- [ ] Botão "Aplicar Kit" + modal de preview (opcionais/quantidade)
- [ ] Injeção como `IQuoteItem` com snapshot + registro em `appliedKitIds`
- [ ] Sugestão automática por `modelId` do veículo do cliente

**Validação:** Kit aplicado vira itens com snapshot; sugestão aparece quando casa.

#### Fase 5: Veículo, SDR, IA placeholder e polish

**Objetivo:** demais superfícies e acabamento.

**Ações:**

- [ ] Integração com card "Filtros" do detalhe do veículo (coordenar com delta PRD-016)
- [ ] Anexar Kit no SDR (placeholder)
- [ ] Botão "Sugerir composição (IA)" desabilitado + tooltip
- [ ] Mobile responsivo + dark mode

**Validação:** card do veículo aplica Kit; SDR coerente; placeholder IA visível.

---

## Dependências

### PRDs Anteriores

| PRD     | Descrição                             | Status                                      |
| ------- | ------------------------------------- | ------------------------------------------- |
| PRD-002 | Modelo Conceitual (registry de tipos) | ✅ Concluído                                |
| PRD-004 | Mocks e geradores                     | ✅ Concluído                                |
| PRD-005 | Provider Pattern                      | ✅ Concluído                                |
| PRD-006 | RBAC e auditoria                      | ✅ Concluído                                |
| PRD-016 | Veículos                              | ✅ Concluído (recebe delta)                 |
| PRD-022 | Orçamento via SDR                     | ✅ Concluído                                |
| PRD-030 | Catálogo de Peças                     | ✅ Concluído                                |
| PRD-031 | Orçamento                             | ✅ Concluído (recebe delta `appliedKitIds`) |
| PRD-034 | Catálogo de Modelos                   | ⏳ Pendente — **pré-requisito direto**      |

### Serviços Externos

| Serviço                     | Tipo        | Status                      |
| --------------------------- | ----------- | --------------------------- |
| Seed por IA (LangChain/n8n) | LLM + busca | Fase 2 — placeholder no MVP |

### Decisões Pendentes

- [ ] Nenhuma. Decisões consolidadas: termo "Kit"; rota `/app/kits`; `appliedKitIds` incluído; granularidade modelo+motor via `modelId`; foco em filtros no MVP; três superfícies de aplicação.

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Composição por Modelo (Kits)"**.

| Ordem | PRD           | Título                                | Status       | Relação                      |
| ----- | ------------- | ------------------------------------- | ------------ | ---------------------------- |
| 1     | PRD-034       | Catálogo de Modelos                   | ⏳           | Base do épico                |
| **2** | **PRD-035**   | **Kits de Composição por Modelo**     | **🔄 ATUAL** | Depende de PRD-034           |
| 3     | Delta PRD-016 | `IVehicle.modelId` + aplicação de Kit | ⏳           | Depende de PRD-034 e PRD-035 |

> **Nota:** Implemente na ordem indicada. PRD-034 deve estar ✅ antes de iniciar este. O delta do PRD-016 é aplicado após ambos.

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### Dados Sensíveis

| Dado                                   | Classificação       | Proteção                                                       |
| -------------------------------------- | ------------------- | -------------------------------------------------------------- |
| Composição de Kit (peças, quantidades) | Interno (comercial) | Controle de escrita por RBAC; leitura para papéis autenticados |
| `appliedKitIds` em `IQuote`            | Interno             | Segue as proteções do orçamento (PRD-031)                      |

### Autenticação e Autorização

Leitura e aplicação de Kit para papéis autenticados. Criação de rascunho: Vendedor+. Edição/promoção/despromoção/exclusão: Gestor/Owner. Cross-store: Owner. Permissões `model_kit.*` (PRD-006).

### Auditoria

Logar criação, edição, promoção, despromoção, exclusão e **aplicação** de Kit (autor, timestamp, Kit, orçamento de destino quando aplicável), conforme padrão do PRD-006.

---

## Fluxos de Usuário

### Fluxo Principal — Aplicar Kit no orçamento

1. Vendedor cria orçamento e seleciona o cliente "Aurora" (que tem um Scania R450 DC13 cadastrado)
2. Sistema sugere: "Este cliente tem um Scania R450 DC13 — aplicar Kit de filtros?"
3. Vendedor clica em "Aplicar Kit"
4. Abre o modal de preview (não-opcionais marcados, opcionais desmarcados, quantidades editáveis)
5. Vendedor ajusta e confirma
6. Itens entram no orçamento como `IQuoteItem` com snapshot; `appliedKitIds` registra o Kit

### Fluxo — Gestor cria e promove Kit

1. Gestor acessa `/app/kits` e navega até o modelo Scania R450 DC13
2. Cria "Kit Filtros — Scania R450 DC13" adicionando filtro de óleo (1), combustível (2), ar (1), cabine (1, opcional), separador (1)
3. Salva como `oficial` (ou Vendedor salva `rascunho` e Gestor promove depois)
4. Banner de drift indica se há peças compatíveis ainda fora do Kit

### Fluxos de Exceção

- **Veículo sem `modelId`:** matching cai no fallback por marca+modelo; se nada casar, "Aplicar Kit" permite busca manual de Kit.
- **Múltiplos Kits aplicáveis:** a sugestão lista as opções para o vendedor escolher.

### Fluxos de Erro

- **Kit sem itens / quantidade inválida:** validação inline bloqueia o salvamento.
- **Seed por IA acionado:** botão desabilitado; tooltip informa Fase 2.

---

### Convenções de Código (Referência Rápida)

| Elemento                    | Convenção                  | Exemplo                                         |
| --------------------------- | -------------------------- | ----------------------------------------------- |
| **Componentes React**       | PascalCase                 | `KitPreviewModal.tsx`                           |
| **Hooks**                   | camelCase + `use`          | `useModelKitsProvider.ts`                       |
| **Pastas**                  | kebab-case                 | `model-kits/`                                   |
| **Variáveis/Funções**       | camelCase                  | `appliedKitIds`, `getCompatiblePartsNotInKit()` |
| **Interfaces**              | PascalCase + `I`           | `IVehicleModelKit`, `IKitItem`                  |
| **Tabelas (banco, Fase 2)** | snake_case (plural)        | `vehicle_model_kits`, `kit_items`               |
| **Colunas (banco, Fase 2)** | snake_case                 | `model_id`, `default_quantity`, `is_optional`   |
| **Env vars (frontend)**     | `VITE_` prefix             | `VITE_DATA_SOURCE`                              |
| **Estrutura de pastas**     | Feature-based              | `src/features/model-kits/`                      |
| **Ícones**                  | Iconify (`@iconify/react`) | `<Icon icon="mdi:filter-variant" />`            |
| **Tema**                    | Light + Dark obrigatório   | CSS variables para cores                        |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Este PRD foi criado pelo Agente Arquiteto. Você é o Desenvolvedor operando via Claude Code CLI.

### Esclarecimento de Dúvidas

> **💬 Antes de implementar, faça perguntas para esclarecer qualquer ambiguidade sobre: requisitos funcionais, restrições técnicas, dependências, comportamentos esperados e critérios de aceitação.**

### Instruções Obrigatórias

> **⚠️ 1. ANTES DE IMPLEMENTAR:** explore como o orçamento (PRD-031) cria itens e faz snapshot, como o catálogo (PRD-030) expõe busca e aplicações, e como o modelo canônico (PRD-034) expõe `modelId`. Planeje cada passo e revise antes de implementar.

> **⚠️ 2. APÓS IMPLEMENTAR:**
>
> - Incrementar a versão do app (SemVer)
> - Atualizar o CHANGELOG.md (Keep a Changelog)
> - Renomear este arquivo para `PRD-035-kits-composicao_DONE.md`
> - Atualizar a seção "Status de Implementação"
> - Confirmar que os deltas do PRD-002/PRD-031 (`appliedKitIds`) e a coordenação com o delta do PRD-016 foram aplicados

### Guia de Versionamento (SemVer)

| Tipo de Mudança      | Ação                 | Exemplo       |
| -------------------- | -------------------- | ------------- |
| Correção de bug      | PATCH +1             | 1.0.0 → 1.0.1 |
| Nova funcionalidade  | MINOR +1, PATCH = 0  | 1.0.1 → 1.1.0 |
| Mudança incompatível | MAJOR +1, outros = 0 | 1.1.0 → 2.0.0 |

**Codinome sugerido:** "Kit" (composição por modelo).

### Princípios de Implementação

| Princípio                            | Descrição                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| **Kit é vivo, orçamento é snapshot** | Itens do Kit referenciam `partId`; o congelamento acontece no `IQuoteItem` ao aplicar |
| **Curadoria humana**                 | Rascunho/oficial espelha promoção de tags; IA é seed (Fase 2), nunca verdade          |
| **Reuso por modelo**                 | Kit pendura em `modelId`, nunca em strings nem em veículo individual                  |
| **Não bloquear fluxo principal**     | Sugestão e drift são auxiliares; orçamento manual continua funcionando                |

### Orientações Gerais

| Aspecto                     | Orientação                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Modal de preview**        | Opcionais desmarcados por padrão; quantidades editáveis antes de injetar                                                       |
| **Coordenação com PRD-016** | A aplicação a partir do card "Filtros" do veículo é especificada no delta do PRD-016 — alinhe a função de aplicação para reuso |
| **Métrica de adoção**       | `appliedKitIds` habilita "% de orçamentos via Kit" no Bloco 4; registrar de forma consistente                                  |

### O que NÃO Fazer

| ❌ Evitar                                                    |
| ------------------------------------------------------------ |
| Fazer snapshot de preço/OEM dentro do Kit                    |
| Versionar Kit (snapshot no orçamento já resolve)             |
| Casar Kit por strings de marca/modelo/motor (usar `modelId`) |
| Gerenciar Kit dentro de um veículo específico                |
| Implementar seed por IA agora (apenas placeholder Fase 2)    |
| Implementar Kits de freios/correia/revisão (MVP só filtros)  |

---

## Status de Implementação

| Campo                     | Valor       |
| ------------------------- | ----------- |
| **Status**                | ⏳ PENDENTE |
| **Data de Implementação** | -           |
| **Versão do App**         | -           |
| **Implementado por**      | -           |
| **Observações**           | -           |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                  |
| ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| 03/06/2026 | v1     | Criação inicial — Kits de composição por modelo (`IVehicleModelKit`), foco em filtros, aplicáveis em orçamento/SDR/veículo |

---

**AILA - Sistemas Inteligentes**
