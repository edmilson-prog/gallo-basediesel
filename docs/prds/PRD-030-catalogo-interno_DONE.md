# PRD-030: Catálogo Interno de Peças

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                         |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                                              |
| **Objetivo**          | Construir o catálogo de peças como entidade central consumida por SDR (PRD-021), orçamentos (PRD-031), pedidos (PRD-032), ficha de veículo (PRD-016) e e-commerce (Bloco 5) — com aplicações peça↔veículo, equivalências, precificação simples, e estoque básico |
| **Tipo**              | Feature                                                                                                                                                                                                                                                          |
| **Complexidade**      | Alta                                                                                                                                                                                                                                                             |
| **Total de Fases**    | 5                                                                                                                                                                                                                                                                |
| **Prioridade**        | Alta                                                                                                                                                                                                                                                             |
| **Épico**             | Bloco 3 — Comercial Operacional                                                                                                                                                                                                                                  |
| **PRDs Relacionados** | PRD-016 (Veículos), PRD-021 (Identificação Peça), PRD-022 (Orçamento SDR), PRD-031 (Orçamento), PRD-032 (Pedido), PRD-063 (Ficha Produto e-commerce)                                                                                                             |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                               |
| **Padrão de código**  | Feature-based; código em `src/features/catalog/`; reutiliza `DetailLayout` do PRD-003                                                                                                                                                                            |

### Critérios de Complexidade

> **Justificativa de Alta:** entidade transversal consumida por **8+ PRDs** (PRD-021 identificação, PRD-016 veículos, PRD-022/031/032 orçamento e pedido, Bloco 5 e-commerce, PRD-052 estoque na Onda 2); modelagem rica com `IPart` + `IPartApplication` (peça↔veículo) + equivalências (peças originais vs alternativas); ~200 peças mockadas com aplicações realistas para Volvo/Scania/Mercedes/Ford/Iveco; listagem com 8 filtros combinados + busca textual em múltiplos campos; ficha de produto com 5 seções; permissões granulares (Owner/Gestor editam, Vendedor visualiza); gestão de estoque básica preparada para integração DINTEC; e arquitetura preparada para Fase 2 quando virá o catálogo real via ERP.

---

## Contexto do Problema

O catálogo é o **núcleo do negócio**. Sem ele, nada funciona — SDR não identifica peças (PRD-021 fica em stub), orçamento não tem itens (PRD-031 vazio), pedido não acontece (PRD-032 sem produto). Hoje, três problemas concretos sem catálogo:

**SDR responde no escuro.** PRD-021 tem stubs apontando para "catálogo placeholder". Sem catálogo real, identificação de peça vira teatro. **Vendedor cria orçamento manual com texto livre.** Sem busca estruturada, cada orçamento tem nome de peça digitado à mão — sem código OEM, sem aplicação garantida, sem preço atualizado. Erro de preço vira reclamação semanas depois. **Aplicações peça↔veículo não existem.** Sem saber "Filtro X serve em Volvo R450 motor DC13 anos 2018-2024", vendedor improvisa. Cliente recebe peça errada, devolve, custo alto.

Este PRD entrega: ~200 peças mockadas com aplicações realistas para as 5 marcas que GALLO atende, listagem poderosa com filtros, ficha de produto, equivalências, e estoque básico — destravando todos os stubs dos PRDs anteriores.

Importante: na Fase 2, catálogo virá do **ERP DINTEC** (integração mencionada no briefing). O modelo aqui prepara essa integração — campos e estrutura compatíveis para drop-in replacement.

---

## Conceito da Solução

### Entidade IPart (revisão do PRD-002)

```typescript
IPart {
  id: ID;
  // Identificação
  name: string;              // "Filtro de óleo Volvo FH"
  description?: string;       // descrição comercial
  oemCode: string;           // código OEM principal
  alternativeCodes: string[];// outros códigos conhecidos
  manufacturer: string;       // 'Volvo', 'Mann', 'Mahle' — quem produz a peça
  isOriginal: boolean;        // true = original da montadora; false = equivalente
  // Categoria
  category: PartCategory;    // 'filtro' | 'freio' | 'correia' | 'motor' | 'embreagem' | 'eletrica' | 'transmissao' | 'suspensao' | 'outros'
  subcategory?: string;       // 'oleo', 'ar', 'combustivel', 'cabine' para filtros
  // Aplicações (peça↔veículo)
  applications: IPartApplication[];
  // Equivalências
  equivalents: ID[];         // ids de outras IPart que são equivalentes
  // Comercial
  unitPrice: number;         // preço em BRL
  weight?: number;           // kg
  dimensions?: { length: number; width: number; height: number };  // cm
  // Estoque (simples no MVP)
  stockQuantity: number;
  stockMinThreshold: number; // alerta quando estoque < X
  // Mídia (placeholder MVP)
  imageUrl?: string;          // URL ou caminho — no MVP, ícones por categoria
  // Status
  isActive: boolean;          // se está no catálogo ativo
  storeId: ID;                // multi-loja (PRD-007)
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

IPartApplication {
  vehicleBrand: string;      // 'Volvo' | 'Scania' | 'Mercedes-Benz' | 'Ford' | 'Iveco'
  vehicleModel: string;       // 'R450', 'FH540', 'Actros 2651'
  yearStart: number;          // 2018
  yearEnd: number;            // 2024
  engine?: string;            // 'DC13', 'OM457LA'
  notes?: string;             // observações sobre a aplicação
}
```

### Categorias de peças no MVP

| Categoria       | Subcategorias                                 | Exemplos                        |
| --------------- | --------------------------------------------- | ------------------------------- |
| **Filtros**     | óleo, ar, combustível, cabine, separador água | Filtro óleo, filtro ar primário |
| **Freios**      | pastilha, disco, lonas, válvulas, mangueira   | Pastilha freio dianteiro        |
| **Correias**    | dentada, alternador, motor                    | Correia dentada                 |
| **Motor**       | óleo, juntas, retentores, válvulas            | Junta cabeçote                  |
| **Embreagem**   | disco, platô, rolamento                       | Kit embreagem completo          |
| **Elétrica**    | bateria, alternador, partida, lâmpadas        | Bateria 150Ah                   |
| **Transmissão** | óleo, sincronizadores, rolamentos             | Óleo câmbio 80W90               |
| **Suspensão**   | molas, amortecedores, buchas                  | Amortecedor traseiro            |
| **Outros**      | diversos                                      | Líquido arrefecimento           |

### Listagem `/app/catalogo`

Tabela paginada (50/página) com colunas:

- Imagem (ícone da categoria no MVP)
- Nome da peça
- Código OEM
- Categoria + subcategoria
- Fabricante (badge "Original" se aplicável)
- Aplicações (compacto: "Volvo R450, Scania R124..." + tooltip com lista completa)
- Preço unitário
- Estoque (com indicador visual: verde >= mínimo, amarelo abaixo, vermelho zerado)
- Status (Ativo/Inativo)
- Ações (visualizar, editar, duplicar)

**Filtros**:

- Categoria (multi-select)
- Subcategoria (dependente de categoria)
- Fabricante (multi-select)
- Original / Equivalente / Ambos
- Veículo compatível: marca + modelo + ano (filtra peças cuja aplicação casa)
- Faixa de preço (mín-máx)
- Estoque (em estoque / baixo / zerado)
- Status (ativo / inativo)
- Loja (Owner only)

**Busca textual**: nome, código OEM, códigos alternativos, descrição — debounce 300ms.

### Ficha de produto `/app/catalogo/:id`

Layout `DetailLayout` em 5 seções:

1. **Header**: imagem grande (placeholder por categoria), nome, código OEM, badges (categoria, original/equivalente), ações (editar, duplicar, desativar)
2. **Aplicações**: lista de `IPartApplication` agrupada por marca. Filtro de veículo para validar compatibilidade rapidamente
3. **Equivalências**: peças equivalentes (consultadas via `equivalents[]`), com preço comparativo e indicador de economia
4. **Comercial**: preço, peso, dimensões, vendedor responsável (opcional), histórico de mudança de preço (audit log)
5. **Estoque**: quantidade atual, mínimo, último movimento (Fase 2 com DINTEC), alerta se baixo

### Criação e edição

Modal/página de criação com formulário:

- Campos obrigatórios: nome, código OEM, categoria, manufacturer, isOriginal, unitPrice
- Campos opcionais: subcategoria, alternativeCodes (array), description, dimensões
- **Aplicações**: editor multi-row (adicionar/remover linhas com marca/modelo/anos/motor)
- **Equivalências**: autocomplete de IPart já existentes; permite adicionar lista
- **Imagem**: upload placeholder (Fase 2 com Supabase Storage)

Edição: mesma estrutura preenchida.

### Equivalências (importante para SDR)

Quando o SDR identifica peça (PRD-021), busca equivalentes para apresentar opções de economia. Estrutura:

- Peça A (original Volvo, R$ 95) → `equivalents: [B, C]`
- Peça B (Mann, R$ 65) → `equivalents: [A, C]`
- Peça C (Mahle, R$ 70) → `equivalents: [A, B]`

Equivalência é **bidirecional** — se A aponta para B, B também aponta para A. Editor garante consistência ao salvar.

### Aplicações e identificação (PRD-021)

Função `searchPartsByApplication(attributes)` (PRD-021 consome via stub) implementada aqui:

```typescript
function searchPartsByApplication({
  brand,
  model,
  year,
  engine,
  category,
  subcategory,
  oemCode,
}): IPart[] {
  // Se oemCode, busca direta
  if (oemCode) return findByOemCode(oemCode);
  // Filtra peças cujas applications matcham
  return allParts.filter((part) => {
    return part.applications.some((app) => {
      return (
        app.vehicleBrand === brand &&
        app.vehicleModel === model &&
        (!year || (year >= app.yearStart && year <= app.yearEnd)) &&
        (!engine || app.engine === engine) &&
        (!category || part.category === category) &&
        (!subcategory || part.subcategory === subcategory)
      );
    });
  });
}
```

### Estoque básico (preparação para Fase 2)

No MVP:

- `stockQuantity` é campo numérico no mock
- `stockMinThreshold` define quando alertar
- Indicador visual na listagem e ficha
- Sem mutations automáticas (no MVP, vendas não decrementam estoque)
- Fase 2: integração com DINTEC — `stockQuantity` virá via webhook ou polling

### Imagens (placeholder)

MVP usa ícones SVG por categoria (já no design system PRD-001). Fase 2 com Supabase Storage para upload real. Componente `<PartImage part>` abstrai isso:

- Se `imageUrl` existe → renderiza imagem
- Senão → ícone da categoria com cor temática

### Importação CSV (placeholder)

Botão "Importar CSV" no header da listagem mostra tooltip "Disponível na Fase 2". Em produção, dataset GALLO vai vir do ERP DINTEC via integração — CSV é fallback alternativo.

### Permissões

| Papel           | Lista         | Detalhe       | Criar | Editar         | Desativar |
| --------------- | ------------- | ------------- | ----- | -------------- | --------- |
| **Owner**       | ✅            | ✅            | ✅    | ✅             | ✅        |
| **Gestor**      | ✅            | ✅            | ✅    | ✅ (não preço) | ❌        |
| **Vendedor**    | ✅            | ✅            | ❌    | ❌             | ❌        |
| **SDR**         | (via API)     | (via API)     | ❌    | ❌             | ❌        |
| **Cliente B2B** | ✅ portal     | ✅ portal     | ❌    | ❌             | ❌        |
| **Cliente B2C** | ✅ e-commerce | ✅ e-commerce | ❌    | ❌             | ❌        |

### Alternativas Consideradas

| Alternativa                                    | Por que foi descartada                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| Catálogo apenas como tabela no banco sem ficha | Vendedor/cliente precisa de visualização rica                                    |
| Sem aplicações estruturadas                    | PRD-021 (identificação) vira impossível; vendedor improvisa                      |
| Sem equivalências                              | Perde oportunidade comercial (economia ao cliente, margem maior em alternativos) |
| Estoque integrado direto com DINTEC no MVP     | Complexidade alta; mock prepara                                                  |
| Upload de imagem real no MVP                   | Sem necessidade visual urgente; placeholder por categoria é coerente             |
| Importação CSV real                            | Risco de dados inconsistentes; placeholder até validar com cliente               |
| Categorias livres (texto)                      | Vira bagunça em filtros; union literal mantém consistência                       |
| Múltiplos preços por canal (atacado/varejo)    | Fase 2; MVP tem preço único                                                      |
| Variações de produto (cor, tamanho)            | Não aplicável a peças pesadas                                                    |

**Decisão consolidada:** **modelo rico com aplicações estruturadas e equivalências bidirecionais, listagem com 8 filtros + busca, ficha em 5 seções, estoque básico preparado para DINTEC, imagens via ícones de categoria no MVP, importação CSV placeholder.**

---

## Escopo

### Incluído

- ✅ Modelo `IPart` e `IPartApplication` em `src/shared/types/catalog.ts`
- ✅ Geradores de mock (PRD-004 update): ~200 peças com aplicações realistas para Volvo/Scania/Mercedes/Ford/Iveco
- ✅ Página `/app/catalogo` com tabela paginada e 8 filtros + busca
- ✅ Página de detalhe `/app/catalogo/:id` com 5 seções
- ✅ Modal/página de criação `<NewPartModal>` ou `<PartEditPage>`
- ✅ Modal/página de edição reusando mesma estrutura
- ✅ Editor de aplicações (multi-row add/remove)
- ✅ Editor de equivalências com autocomplete e bidirecionalidade automática
- ✅ Estoque básico (campo numérico + threshold + indicador visual)
- ✅ Componente `<PartImage>` abstraindo imagem/ícone
- ✅ Função `searchPartsByApplication(attributes)` consumida pelo PRD-021
- ✅ Função `findByOemCode(code)` consumida pelo PRD-021
- ✅ Função `getEquivalents(partId)` retornando peças equivalentes
- ✅ Placeholder de "Importar CSV" no header (tooltip Fase 2)
- ✅ Placeholder de upload de imagem (tooltip Fase 2)
- ✅ Histórico de mudanças de preço via audit log
- ✅ Permissões granulares (Owner edita preço; Gestor edita outros; Vendedor read-only)
- ✅ URL sync de filtros, busca, paginação
- ✅ Empty states contextuais
- ✅ Audit log em criação/edição/desativação

### Excluído

- ❌ Integração real com DINTEC — Fase 2 (estrutura preparada)
- ❌ Upload real de imagens — Fase 2 (placeholders)
- ❌ Importação CSV funcional — Fase 2
- ❌ Múltiplos preços por canal (atacado/varejo) — Fase 2
- ❌ Variações de produto — não aplicável
- ❌ Histórico de movimentação de estoque — Fase 2 (vem do DINTEC)
- ❌ Sugestões automáticas de equivalência via IA — Fase 2
- ❌ OCR de catálogo escaneado — Fase 2
- ❌ Aplicações via VIN/Chassi específico — Fase 2
- ❌ Promoções/cupons no catálogo — Fase 2
- ❌ Bundles (kits de peças) — Fase 2
- ❌ Reservas de estoque (cliente pode reservar X dias) — Fase 2
- ❌ Notificação de alerta de estoque baixo automático — Fase 2

---

## Requisitos Funcionais

### Modelo e mocks

- **RF-001:** Adicionar `IPart`, `IPartApplication`, `PartCategory`, `PartSubcategory` em `src/shared/types/catalog.ts`.
- **RF-002:** Atualizar mocks (PRD-004) para gerar ~200 peças:
  - 50+ filtros (óleo/ar/combustível/cabine) — alta rotação
  - 40+ freios (pastilhas/discos/lonas/válvulas)
  - 30+ correias e motor (juntas, retentores)
  - 20+ embreagem e suspensão
  - 30+ elétrica (baterias, alternadores)
  - 20+ transmissão
  - 10+ outros (líquidos, fluidos)
- **RF-003:** Cada peça tem 1-4 aplicações realistas; aplicações fazem sentido (Volvo R450 motor DC13 anos 2018-2024).
- **RF-004:** Equivalências bidirecionais entre original e 1-2 alternativos por peça importante.
- **RF-005:** Estoque mockado distribuído: 70% normal, 20% baixo, 10% zerado.

### Listagem `/app/catalogo`

- **RF-006:** Criar `CatalogListPage` em `src/features/catalog/pages/`, rota `/app/catalogo` substituindo placeholder do PRD-003.
- **RF-007:** Tabela paginada (50/página) com colunas obrigatórias + opcionais (toggle via ⚙):
  - **Obrigatórias**: imagem, nome, código OEM, categoria, fabricante, preço, estoque
  - **Opcionais**: subcategoria, isOriginal (badge), aplicações (compacto), dimensões, peso, status, data de cadastro
- **RF-008:** Header com:
  - Contador "X peças no catálogo"
  - Botão "+ Peça" (Owner/Gestor)
  - Botão "Importar CSV" com tooltip "Disponível na Fase 2"
  - Input de busca textual (debounce 300ms)
  - Botão ⚙ para configurar colunas

### Filtros

- **RF-009:** 8 filtros no header:
  1. Categoria (multi-select com checkboxes)
  2. Subcategoria (dependente — só ativa se 1 categoria selecionada)
  3. Fabricante (multi-select autocomplete)
  4. Original / Equivalente / Ambos (radio)
  5. Veículo compatível (3 dropdowns: marca → modelo → ano) — filtra peças cuja application casa
  6. Faixa de preço (range slider ou inputs mín-máx)
  7. Estoque (radio: em estoque / baixo / zerado / todos)
  8. Status (ativo / inativo)
- **RF-010:** Filtro "Loja" extra apenas para Owner (cross-store).
- **RF-011:** Filtros combinam via AND. Indicador "N filtros ativos" + "Limpar tudo".
- **RF-012:** URL sync de filtros, ordenação, página, busca.

### Busca textual

- **RF-013:** Input busca pesquisa em: `name`, `oemCode`, `alternativeCodes` (cada elemento), `description`.
- **RF-014:** Debounce 300ms; highlight do termo nas células onde aparece.
- **RF-015:** Match em qualquer campo conta para resultado.

### Ficha de produto

- **RF-016:** Criar `PartDetailPage` em `src/features/catalog/pages/`, rota `/app/catalogo/:id`.
- **RF-017:** Layout em 5 seções verticais (responsive: stack em mobile, grid em desktop):

**Seção 1 — Header:**

- Imagem grande (via `<PartImage>`)
- Nome em destaque
- Código OEM
- Badges: categoria (cor temática), subcategoria, isOriginal (dourado se sim)
- Ações: Editar, Duplicar, Desativar (com confirmação)

**Seção 2 — Aplicações:**

- Lista de `IPartApplication[]` agrupada por `vehicleBrand`
- Cada item: modelo + faixa de anos + motor (se aplicável) + notas
- Mini-filtro inline: "Compatível com: [marca] [modelo] [ano]" → destaca aplicação matching

**Seção 3 — Equivalências:**

- Lista de peças em `equivalents` (via `getEquivalents(partId)`)
- Cada item: nome, fabricante, preço comparativo, % economia se aplicável
- Indicador "Original" vs "Equivalente"
- Click leva para a ficha da peça equivalente

**Seção 4 — Comercial:**

- Preço atual (grande)
- Peso, dimensões
- Histórico de preço (audit log filtrado, últimos 10 changes) — expansível

**Seção 5 — Estoque:**

- Quantidade atual com badge colorido (verde/amarelo/vermelho)
- Threshold mínimo
- Indicador de status: "Em estoque", "Estoque baixo", "Zerado"
- Placeholder informativo: "Atualização automática via DINTEC disponível na Fase 2"

### Criação de peça

- **RF-018:** Modal ou página `<NewPartPage>` (decisão do agente — recomendação: página dedicada `/app/catalogo/novo` por complexidade do formulário).
- **RF-019:** Formulário em seções:
  - **Identificação**: nome, código OEM, alternativeCodes (array editável), manufacturer, isOriginal (toggle), descrição
  - **Categoria**: dropdown categoria → dropdown subcategoria dependente
  - **Aplicações**: editor multi-row (botão "+ Adicionar aplicação" cria linha; cada linha tem marca/modelo/anos/motor/notas; remover via ícone X)
  - **Equivalências**: autocomplete que busca outras peças por código OEM ou nome; adicionar como chip; bidirecionalidade aplicada ao salvar
  - **Comercial**: preço, peso (opcional), dimensões (opcional)
  - **Estoque**: quantidade inicial, threshold mínimo
  - **Imagem**: upload placeholder (Fase 2) — botão desabilitado com tooltip
- **RF-020:** Validações:
  - Nome, código OEM, manufacturer, categoria, preço — obrigatórios
  - Código OEM único globalmente (validação de duplicata)
  - Preço > 0
  - Pelo menos 1 aplicação (alerta amarelo se zero)
- **RF-021:** Ao salvar, `storeId = currentStoreId`, audit log, navegar para `/app/catalogo/:id`.

### Edição

- **RF-022:** Mesma estrutura de criação, formulário preenchido.
- **RF-023:** Mudança de `unitPrice` gera audit log especial com before/after — visível no histórico de preço.
- **RF-024:** Equivalências bidirecionais: se adiciono B em A.equivalents, sistema adiciona automaticamente A em B.equivalents (e vice-versa para remoção).

### Funções de busca consumidas por outros PRDs

- **RF-025:** Exportar de `src/features/catalog/api/search.ts`:
  - `searchPartsByApplication(attributes)`: filtra por aplicação matching
  - `findByOemCode(code)`: busca exata por OEM
  - `findByAlternativeCode(code)`: busca em `alternativeCodes`
  - `getEquivalents(partId)`: retorna peças equivalentes
  - `searchPartsByText(query)`: busca textual
- **RF-026:** PRD-021 consome essas funções via `catalogProvider`. Antes deste PRD, retornavam stubs; agora retornam dados reais do mock.

### Permissões

- **RF-027:** **Owner**: criar, editar (todos campos incluindo preço), desativar, ver cross-store
- **RF-028:** **Gestor**: criar, editar (NÃO preço — exceto se autorizado em settings), ver loja
- **RF-029:** **Vendedor**: apenas visualizar listagem e ficha
- **RF-030:** **Cliente B2B portal**: visualizar listagem e ficha simplificada (sem campos internos como threshold, stockQuantity exato — apenas "em estoque" / "sob consulta")
- **RF-031:** Validações via `<Can>` e `<GuardedRoute>` (PRD-006).

### Audit log

- **RF-032:** Audit em todas mutations:
  - Criação (`action='part_create'`)
  - Edição genérica (`action='part_update'`)
  - Edição de preço (`action='part_price_change'` — destacado)
  - Adição/remoção de aplicação (`action='part_application_update'`)
  - Adição/remoção de equivalência (`action='part_equivalent_update'`, incluindo a bidirecionalidade)
  - Desativação (`action='part_deactivate'`)

### Empty states

- **RF-033:** Catálogo vazio (sem peças): mensagem motivacional + botão "Cadastrar primeira peça" (Owner/Gestor) ou "Aguardando catálogo" (Vendedor).
- **RF-034:** Filtros sem resultado: mensagem + botão "Limpar filtros".
- **RF-035:** Aplicação sem peças compatíveis: "Nenhuma peça compatível com [veículo]" + sugestão de cadastrar.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Listagem com 200 peças + filtros aplicados renderiza em < 400ms.
- **RNF-002 (Busca):** `searchPartsByText()` em 200 peças < 50ms.
- **RNF-003 (Bidirecionalidade):** Adicionar/remover equivalência atualiza ambos os lados atomicamente.
- **RNF-004 (Acessibilidade):** WCAG 2.1 AA; tabela com headers acessíveis; filtros navegáveis por teclado.
- **RNF-005 (Tipagem):** Zero `any`; aplicações tipadas.
- **RNF-006 (Compatibilidade Fase 2):** Modelo compatível com schema esperado do DINTEC para drop-in replacement.

---

## Critérios de Aceitação

### Listagem e filtros

```gherkin
DADO que sou Owner e acesso /app/catalogo
QUANDO a página carrega
ENTÃO vejo tabela paginada com 50 peças
  E header mostra "200 peças no catálogo"
  E todos os filtros disponíveis (incluindo Loja)

DADO que aplico filtro Categoria=filtro + Veículo compatível=Volvo R450 2020
QUANDO os filtros aplicam
ENTÃO tabela mostra apenas filtros cuja aplicação casa com Volvo R450 2020
  E URL atualiza com query params
  E indicador "2 filtros ativos"

DADO que busco "21380488" (código OEM)
QUANDO 300ms passam
ENTÃO peça com esse código aparece destacada
  E código está em highlight amarelo
```

### Ficha de produto

```gherkin
DADO uma peça com 4 aplicações em 2 marcas
QUANDO abro /app/catalogo/:id
ENTÃO seção Aplicações mostra agrupado por marca (Volvo: 2, Scania: 2)
  E posso usar mini-filtro para validar compatibilidade rapidamente

DADO peça original Volvo (R$ 95) com equivalentes Mann (R$ 65) e Mahle (R$ 70)
QUANDO observo seção Equivalências
ENTÃO vejo Mann com "-32%" e Mahle com "-26%"
  E posso clicar para abrir ficha do equivalente

DADO mudo preço de R$ 95 para R$ 100 via edição
QUANDO salvo
ENTÃO audit log especial registra (action='part_price_change')
  E histórico de preço na ficha mostra a mudança
```

### Aplicações e equivalências (bidirecionalidade)

```gherkin
DADO peça A (original) e peça B (equivalente)
QUANDO adiciono B em A.equivalents e salvo
ENTÃO A.equivalents inclui B
  E automaticamente B.equivalents inclui A
  E audit log registra ambas as mudanças

DADO peça A.equivalents = [B, C]
QUANDO removo B de A.equivalents
ENTÃO B.equivalents também é atualizado removendo A
  E C.equivalents mantém A
```

### Busca por aplicação (consumido por PRD-021)

```gherkin
DADO peça "Filtro óleo Volvo" com application {brand:Volvo, model:R450, yearStart:2018, yearEnd:2024, engine:DC13}
QUANDO searchPartsByApplication({brand:Volvo, model:R450, year:2020, engine:DC13, category:filtro}) executa
ENTÃO retorna a peça (match completo)

QUANDO searchPartsByApplication({brand:Volvo, model:R450, year:2025}) executa
ENTÃO peça NÃO retorna (year fora do range)

DADO peça com oemCode="21380488"
QUANDO findByOemCode("21380488") executa
ENTÃO retorna a peça
```

### Criação e edição

```gherkin
DADO que sou Owner e clico "+ Peça"
QUANDO abro o formulário
ENTÃO vejo todas as seções (identificação, categoria, aplicações, equivalências, comercial, estoque)
  E posso adicionar múltiplas aplicações via "+ Adicionar"
  E posso buscar equivalências via autocomplete

DADO tento salvar com OEM duplicado
QUANDO validação processa
ENTÃO alerta: "Código OEM já existe — [link para peça existente]"
  E save bloqueado

DADO sou Gestor e edito peça
QUANDO tento mudar campo "Preço unitário"
ENTÃO campo está disabled com tooltip "Edição de preço requer permissão de Owner"

DADO sou Vendedor
QUANDO acesso ficha de peça
ENTÃO botões Editar/Desativar não aparecem
  E tudo é read-only
```

### Estoque

```gherkin
DADO peça com stockQuantity=5 e stockMinThreshold=10
QUANDO observo na listagem
ENTÃO indicador "Estoque baixo" em amarelo

DADO peça com stockQuantity=0
QUANDO observo
ENTÃO indicador "Zerado" em vermelho

DADO peça com stockQuantity=50 e threshold=10
QUANDO observo
ENTÃO indicador verde "Em estoque (50)"
```

### Cenários de erro

```gherkin
DADO provider falha
QUANDO useCatalogProvider().list() rejeita
ENTÃO tabela mostra estado de erro + botão "Tentar novamente"

DADO peça desativada (isActive=false)
QUANDO listagem default (sem filtro de status)
ENTÃO peça NÃO aparece
  E só aparece com filtro "Status=Inativo"

DADO clico "Desativar" em peça com pedidos ativos
QUANDO confirmação
ENTÃO alerta: "Esta peça tem 3 pedidos pendentes. Confirma desativar?"
  E se confirmar, desativa mas mantém histórico
```

---

## Fases de Implementação

| Fase | Objetivo                                                              | Arquivos Estimados |
| ---- | --------------------------------------------------------------------- | ------------------ |
| 1    | Modelo + mocks (~200 peças) + funções de busca consumidas por PRD-021 | 6-8                |
| 2    | Listagem com filtros, busca, paginação                                | 5-6                |
| 3    | Ficha de produto com 5 seções                                         | 6-7                |
| 4    | Criação/edição com editor de aplicações e equivalências bidirecionais | 5-6                |
| 5    | Permissões, audit log, polish, integração com PRD-016/021             | 3-4                |

### Detalhamento das Fases

#### Fase 1: Modelo e Mocks

- [ ] Tipos `IPart`, `IPartApplication`, `PartCategory`, `PartSubcategory`
- [ ] Geradores de mock para ~200 peças com aplicações realistas e equivalências bidirecionais
- [ ] Funções de busca em `src/features/catalog/api/search.ts`:
  - `searchPartsByApplication`, `findByOemCode`, `findByAlternativeCode`, `getEquivalents`, `searchPartsByText`
- [ ] Substituir stubs do PRD-021 pela implementação real
- [ ] Validar via PRD-020 simulador: identificação agora retorna peças reais

**Validação:** SDR simulador (PRD-020) identifica peças corretas via aplicações.

#### Fase 2: Listagem

- [ ] `CatalogListPage` em `/app/catalogo`
- [ ] Tabela paginada com 7 colunas obrigatórias + opcionais via ⚙
- [ ] 8 filtros + busca textual com debounce
- [ ] URL sync de filtros/busca/ordenação/página
- [ ] Empty states contextuais

**Validação:** filtrar por veículo compatível retorna peças certas; busca por OEM funciona.

#### Fase 3: Ficha de Produto

- [ ] `PartDetailPage` em `/app/catalogo/:id`
- [ ] 5 seções implementadas
- [ ] Mini-filtro inline em "Aplicações" para validar compatibilidade
- [ ] Link cruzado entre equivalentes (click em uma vai para ficha)
- [ ] Histórico de preço expansível
- [ ] Indicadores visuais de estoque

**Validação:** ficha completa, navegação entre equivalentes, mini-filtro funcional.

#### Fase 4: Criação/Edição

- [ ] Página `/app/catalogo/novo` ou modal robusto
- [ ] Editor multi-row de aplicações
- [ ] Editor de equivalências com autocomplete
- [ ] Bidirecionalidade automática (adicionar B em A.equivalents propaga para B)
- [ ] Validações de duplicata OEM
- [ ] Audit log especial para mudança de preço

**Validação:** criar peça com 3 aplicações + 2 equivalentes; equivalentes refletidos em ambos lados.

#### Fase 5: Permissões, Audit, Polish

- [ ] `<Can>` e `<GuardedRoute>` em todas as actions
- [ ] Botões/campos desabilitados conforme permissão
- [ ] Audit log padronizado (6 tipos de action)
- [ ] Mobile responsivo
- [ ] Integração com PRD-016 (tab Veículos da ficha do cliente consome `searchPartsByApplication`)
- [ ] Documentação `docs/catalog.md`

**Validação:** Gestor não edita preço; Vendedor read-only; PRD-016 mostra peças compatíveis com veículo cadastrado.

---

## Dependências

### PRDs Anteriores

| PRD                                  | Status      |
| ------------------------------------ | ----------- |
| PRD-002 (modelo IPart)               | 📝 Redigido |
| PRD-003 (DetailLayout)               | 📝 Redigido |
| PRD-005 (Provider)                   | 📝 Redigido |
| PRD-006 (RBAC)                       | 📝 Redigido |
| PRD-007 (multi-loja)                 | 📝 Redigido |
| PRD-016 (consumido)                  | 📝 Redigido |
| PRD-021 (consumido — destrava stubs) | 📝 Redigido |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

| Ordem  | PRD          | Status       |
| ------ | ------------ | ------------ |
| 1-15   | PRDs 010-024 | 📝           |
| **16** | **PRD-030**  | **🔄 ATUAL** |
| 17     | PRD-031      | ⏳           |
| 18     | PRD-032      | ⏳           |
| 19     | PRD-033      | ⏳           |

---

## Considerações de Segurança

### Preço é dado sensível

Mudanças de preço afetam comissões (PRD-047), faturamento, margem. Audit log especial; permissão restrita a Owner por default.

### Estoque exato é restrito

Cliente vê "em estoque" / "sob consulta" / "esgotado" no portal — não o número exato (protege estratégia comercial). Vendedor vê números reais.

### Integração futura com DINTEC

Estrutura compatível para receber dados do ERP. Conflitos (mock vs DINTEC) precisarão de estratégia de merge na Fase 2.

---

## Fluxos de Usuário

### Fluxo Principal — Vendedor consulta peça durante atendimento

1. Carlos está atendendo cliente que pediu filtro óleo
2. Abre `/app/catalogo` em nova aba
3. Filtra: categoria=filtro, subcategoria=óleo, veículo compatível=Volvo R450 2020
4. Vê 3 opções: original Volvo R$ 95, Mann R$ 65, Mahle R$ 70
5. Volta à conversa, informa cliente sobre opções
6. Cliente escolhe Mann (economia 32%)

### Fluxo Alternativo — Owner cadastra peça nova

1. Chegou nova peça importada no estoque
2. Owner acessa `/app/catalogo` → "+ Peça"
3. Preenche: nome "Filtro de ar Volvo FH", OEM 21380999, categoria filtro/ar, preço R$ 180
4. Adiciona 2 aplicações: Volvo FH 2018-2024 motor MX-13 e Volvo FH 2018-2024 motor MX-11
5. Busca equivalentes via autocomplete: encontra "Filtro Mann WK-XX"
6. Adiciona Mann como equivalente
7. Salva → peça criada; Mann automaticamente recebe esta como equivalente
8. Audit log gerado

### Fluxo de Integração — SDR identifica peça

1. Cliente pelo WhatsApp: "preciso de filtro óleo Volvo R450 2020"
2. PRD-021 chama `searchPartsByApplication` (deste PRD)
3. Retorna 3 candidatos (original + 2 equivalentes)
4. SDR formata mensagem ao cliente com 3 opções
5. Cliente escolhe → segue para PRD-022 (orçamento)

### Fluxo Mobile

1. Marina em campo, abre `/app/catalogo` no celular
2. Tabela com colunas essenciais (scroll horizontal se necessário)
3. Toca em peça → ficha em tela cheia
4. Seções stack verticalmente
5. Mini-filtro de aplicação funciona touch

---

## Convenções de Código

| Elemento             | Convenção           | Exemplo                                                              |
| -------------------- | ------------------- | -------------------------------------------------------------------- |
| **Página**           | PascalCase + `Page` | `CatalogListPage`, `PartDetailPage`                                  |
| **Componentes**      | PascalCase          | `<PartImage>`, `<ApplicationEditor>`, `<EquivalentsList>`            |
| **Funções de busca** | camelCase           | `searchPartsByApplication`, `findByOemCode`                          |
| **Pasta**            | kebab-case          | `catalog/`, `api/`, `components/`                                    |
| **Git commits**      | Conventional        | `feat(catalog): add parts catalog with applications and equivalents` |

---

## Notas para o Agente Desenvolvedor

### Princípios

| Princípio                        | Descrição                                                           |
| -------------------------------- | ------------------------------------------------------------------- |
| **Catálogo é núcleo**            | Sem ele, nada funciona — qualidade dos mocks aqui importa           |
| **Aplicações estruturadas**      | PRD-021 depende; sem estrutura, identificação vira teatro           |
| **Bidirecionalidade automática** | Equivalência B em A propaga A em B — sem isso, dados inconsistentes |
| **Compatível com DINTEC**        | Schema preparado para drop-in replacement na Fase 2                 |
| **Permissões granulares**        | Preço é Owner-only; outros campos Gestor pode                       |
| **Estoque básico no MVP**        | Campo numérico mockado; integração real na Fase 2                   |

### O que NÃO Fazer

| ❌ Evitar                                             |
| ----------------------------------------------------- |
| Implementar upload de imagem real — Fase 2            |
| Implementar importação CSV — Fase 2 placeholder       |
| Categorias livres em string — usar union literal      |
| Esquecer bidirecionalidade de equivalências           |
| Permitir Gestor editar preço sem permissão específica |
| Esquecer audit log especial em mudança de preço       |
| Mostrar estoque exato para Cliente — apenas status    |
| Hardcodar peças no front — usar mocks via PRD-004     |
| Implementar promoções/bundles — fora do MVP           |

---

## Status de Implementação

| Campo      | Valor                                         |
| ---------- | --------------------------------------------- |
| **Status** | ✅ CONCLUÍDO — v0.22.0 (Catalog) · 2026-05-26 |

---

## Histórico

| Data       | Versão | Alteração                                                                                                               |
| ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — catálogo com aplicações estruturadas, equivalências bidirecionais, estoque básico, 200 peças mockadas |

---

**AILA - Sistemas Inteligentes**
