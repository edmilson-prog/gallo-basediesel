# PRD-004: Geradores de Dados Fictícios e Camada de Mocks

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                           |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                |
| **Objetivo**          | Construir camada completa de mocks (`src/mocks/`) com geradores determinísticos, store em memória e API assíncrona — estabelecendo o contrato exato que o `SupabaseProvider` da Fase 2 vai cumprir |
| **Tipo**              | Feature                                                                                                                                                                                            |
| **Complexidade**      | Alta                                                                                                                                                                                               |
| **Total de Fases**    | 5                                                                                                                                                                                                  |
| **Prioridade**        | Alta                                                                                                                                                                                               |
| **Épico**             | Bloco 0 — Fundação                                                                                                                                                                                 |
| **PRDs Relacionados** | PRD-002 (Modelo Conceitual), PRD-005 (Provider Pattern), PRD-006 (RBAC), PRD-007 (Multi-Loja)                                                                                                      |
| **Implementação**     | 🔵 Claude Code CLI (sobre o scaffold do Lovable)                                                                                                                                                   |
| **Padrão de código**  | Tudo em `src/mocks/`; geradores e store internos; apenas APIs em `src/mocks/api/` são consumidas externamente                                                                                      |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios                                                       |
| ------------ | --------------------------------------------------------------- |
| **Baixa**    | 1 arquivo, sem dependências externas, < 100 linhas              |
| **Média**    | 2-5 arquivos, banco OU integração, funcionalidade isolada       |
| **Alta**     | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** geração determinística de ~32 entidades respeitando relações cruzadas (uma `IOrder` referencia `ICustomer`, `ISeller`, `IPart`); volumes realistas e coerentes (50 clientes B2B + 20 B2C, 200 peças, 120 pedidos, 80 conversas, ~500 mensagens, 30 orçamentos, 80 leads); store em memória com mutações simulando CRUD; API assíncrona com latência e cenários de erro; contrato idêntico ao futuro `SupabaseProvider` para drop-in replacement; é a "fundação invisível" que todos os PRDs do Bloco 1 em diante consomem para funcionar.

---

## Contexto do Problema

A estratégia Frontend First exige que toda a plataforma seja desenvolvida e validada com dados fictícios antes de qualquer linha de backend ser escrita. Isso significa que **a UI inteira precisa funcionar como se fosse real** — listar clientes, abrir conversas, criar orçamentos, calcular metas, exibir gráficos — tudo movido por uma camada de mocks que se comporta exatamente como um backend de verdade vai se comportar depois.

Três tipos de problema emergem se essa camada não for bem projetada:

**Dados inconsistentes ou irreais.** Se cada componente gerar seus próprios dados ad-hoc, o cliente João Gallo da tela de Atendimento não é o mesmo João Gallo da tela de Pedidos. O sistema parece desconectado, e validar fluxos cruzados (lead vira customer, customer cria pedido, pedido aparece na ficha) fica impossível. **Mocks sem contrato com o backend futuro.** Se a função `listCustomers()` no mock retornar diferente do que o Supabase vai retornar, na Fase 2 cada serviço precisa ser refatorado, cada componente ajustado. O drop-in replacement vira retrabalho de meses. **Apresentação visual sem profundidade de dado.** Uma plataforma comercial com 5 clientes mockados parece brinquedo. Para validar BI, gestão, positivação, é preciso volume mínimo realista (dezenas de clientes, centenas de pedidos) e _padrões_ nesses dados (alguns clientes ativos, alguns dormentes, alguns A na curva ABC).

Este PRD resolve os três: estabelece uma camada de mocks com **geração determinística** (mesmo seed = mesmos dados), **integridade referencial** (relações entre entidades sempre coerentes), **volumes realistas e padronizados**, **API com assinatura idêntica ao Supabase futuro** e **store em memória** que permite CRUD durante a sessão.

---

## Conceito da Solução

### Situação Atual (As-Is)

PRD-002 entrega as interfaces TypeScript. Nada produz dados que respeitem essas interfaces. Sem mocks, qualquer feature do Bloco 1+ é impossível de implementar.

### Situação Desejada (To-Be)

Uma camada `src/mocks/` estruturada em cinco subpastas com responsabilidades claras:

```
src/mocks/
├── data/         ← Datasets de seed (constantes fixas: lojas, vendedores base, categorias, estágios de pipeline)
├── generators/   ← Funções de geração determinística por seed
├── store/        ← Zustand store em memória com todos os dados runtime
├── api/          ← Funções públicas (listCustomers, getOrder, createQuote, etc.) — contrato drop-in
└── index.ts      ← Barrel: apenas as APIs públicas são exportadas
```

**Características fundamentais:**

- **Determinismo por seed**: dado o mesmo seed (constante global ou variável de ambiente), o sistema gera **exatamente o mesmo dataset** — reproduz bugs, valida testes, mantém demonstrações consistentes
- **Integridade referencial**: nenhum `IOrder.customerId` aponta para cliente inexistente; nenhuma `IConversation.assignedSellerId` aponta para vendedor fora da loja
- **Volumes realistas**: dataset gerado por padrão tem dezenas a centenas de itens em cada entidade, suficiente para validar telas de listagem, paginação, filtros, gráficos
- **API assíncrona com latência simulada**: cada função retorna `Promise` com 50-200ms de delay (configurável) — força a UI a lidar com loading states desde o MVP
- **Cenários de erro simulados**: em modo dev, pequena probabilidade (configurável) de falha em cada chamada para validar tratamento de erros na UI
- **CRUD funcional em memória**: criar/editar/deletar atualiza o store; dados persistem durante a sessão (refresh limpa — comportamento esperado no MVP)
- **Imagens placeholder**: avatares via `https://i.pravatar.cc/`, imagens de peças via Unsplash com query temática, logos de marcas via SVGs estáticos
- **Reset/reseed**: hook administrativo (acessível via `/design-system`) que repopula o store com seed novo

### Alternativas Consideradas

| Alternativa                                           | Por que foi descartada                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| MSW (Mock Service Worker) interceptando fetch         | Excessivo para Fase 1; melhor para mocks de testes ou apps já com APIs reais. Aqui não há fetch nenhum ainda |
| JSON Server local                                     | Subir processo separado; complicação operacional desnecessária; não é "drop-in" para Supabase                |
| Hard-coded arrays espalhados pelas features           | Duplicação inevitável; sem integridade referencial; impossível garantir consistência                         |
| Faker.js direto em cada feature                       | Cada feature gera "seus dados", quebrando integridade; impossível reproduzir bugs                            |
| JSON estático carregado uma vez (sem CRUD em memória) | UI não consegue criar/editar/deletar, quebra fluxos de validação                                             |

**Decisões consolidadas:**

- **Faker.js** (`@faker-js/faker`) para geração de textos (nomes, endereços, descrições) — com locale `pt_BR`
- **Zustand** como store em memória (já será usado para auth em PRD-003; reaproveitar)
- **Seeded random** via [seedrandom](https://www.npmjs.com/package/seedrandom) para determinismo
- **Imagens externas** sob demanda (avatar via pravatar, peças via picsum/unsplash) — sem armazenar binários no projeto
- **Volumes default ajustáveis** via `src/mocks/config.ts`

---

## Volumes e Composição do Dataset

Volumes pensados para serem **realistas o suficiente** para validar todas as features sem inflar o bundle/store em memória além do necessário.

| Entidade                 | Quantidade | Distribuição/Notas                                                                                                              |
| ------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **IStore**               | 1          | "GALLO BASE DIESEL — Matriz" (Frederico Westphalen/RS); multi-loja real entra no PRD-007                                        |
| **ITeam**                | 0          | Dormente no MVP                                                                                                                 |
| **ISeller**              | 4          | 1 Owner ("João Gallo") + 3 Vendedores internos ("Carlos Santos", "Marina Cardoso", "Rafael Lima")                               |
| **IRole**                | 7          | Owner, Gestor, Vendedor, SDR, Cliente, VendedorExterno, Financeiro (cadastros completos com permissões coerentes)               |
| **IAuditLog**            | 40         | Variados, distribuídos nos últimos 30 dias, cobrindo todas as `actions` principais                                              |
| **ICustomer (B2B)**      | 50         | Transportadoras, frotas, oficinas; 30 ativos / 10 dormentes / 5 recuperação / 5 perdidos; variados em curva ABC                 |
| **ICustomer (B2C)**      | 20         | Pessoa física; mistura de ticket alto e baixo                                                                                   |
| **ICustomerNote**        | ~120       | 1-3 notas por cliente em média                                                                                                  |
| **IVehicle**             | 60         | Veículos pertencentes a 25 clientes B2B (frotas: 2-5 veículos); marcas distribuídas (Volvo, Scania, Mercedes, Ford, Iveco)      |
| **IVehicleServiceEntry** | ~80        | Histórico de manutenção por veículo                                                                                             |
| **ILead**                | 80         | Distribuídos pelos 5 estágios; 30 novos, 20 em qualificação, 15 com orçamento enviado, 10 em negociação, 5 convertidos/perdidos |
| **ICustomerSegment**     | 6          | Filtros salvos exemplificando uso (ex: "Clientes Volvo recência > 60 dias")                                                     |
| **ICarteiraTransfer**    | 8          | 3 temporary (1 ativa, 2 revertidas), 4 permanent_individual, 1 permanent_batch                                                  |
| **IRecommendation**      | 25         | Apenas dos 3 tipos do MVP (dormant, predictable_maintenance, expected_purchase_missing)                                         |
| **IConversation**        | 80         | 15 aguardando, 30 em_andamento, 10 aguardando_cliente, 20 resolvida, 5 arquivada                                                |
| **IMessage**             | ~600       | Média de 7-8 mensagens por conversa (algumas com 1-2, outras com 30+)                                                           |
| **IWhatsAppAccount**     | 2          | 1 Meta Cloud (oficial) + 1 Evolution (campanhas)                                                                                |
| **IPart**                | 200        | Distribuídas por categoria: motor, freios, transmissão, suspensão, elétrica, filtros, etc. Todas com `division: 'parts'`        |
| **IApplication**         | ~600       | 2-4 aplicações por peça em média                                                                                                |
| **IQuote**               | 30         | Variados em status; 10 rascunho, 10 enviado, 5 aceito, 3 recusado, 1 expirado, 1 convertido                                     |
| **IOrder**               | 120        | Espalhados nos últimos 12 meses para alimentar BI; variados em status de pagamento e fulfillment                                |
| **IOrderItem**           | ~400       | Média de 3-4 itens por pedido                                                                                                   |
| **ICommission**          | 40         | Comissões do mês corrente + 2 meses anteriores                                                                                  |
| **IGoal**                | 8          | 2 metas de loja (revenue + positivacao) + 6 metas individuais (2 por vendedor: revenue + tickets)                               |
| **IGamificationBadge**   | 20         | Diversos badges por vendedor                                                                                                    |
| **IRanking**             | 1          | Período mês corrente                                                                                                            |
| **IPositivation**        | 1          | Período mês corrente, com todos os clientes categorizados                                                                       |
| **IABCClassification**   | 70         | Uma por cliente (B2B + B2C), distribuídas ~20 A, ~20 B, ~30 C                                                                   |

> **Total**: ~2200 itens em memória. Volume confortável para Zustand store e nada pesado para o navegador.

---

## Escopo

### Incluído

- ✅ Estrutura `src/mocks/` em 5 subpastas (`data`, `generators`, `store`, `api`, com `index.ts` raiz)
- ✅ Configuração centralizada em `src/mocks/config.ts` (seed default, volumes default, latência mín/máx, taxa de erro simulada)
- ✅ Datasets de seed estáticos em `data/` (loja matriz, 3 vendedores fixos, 7 papéis, estágios de pipeline, motivos de perda, tags sugeridas)
- ✅ Geradores determinísticos para todas as ~32 entidades em `generators/`
- ✅ Integridade referencial garantida entre todas as entidades relacionadas
- ✅ Store Zustand em `store/mockStore.ts` mantendo o dataset em memória
- ✅ Bootstrap automático: ao app iniciar, store é populada via geradores se vazia
- ✅ APIs públicas em `api/` (uma por agregado: `customersApi`, `ordersApi`, `quotesApi`, etc.)
- ✅ Cada API simula latência configurável (default 80-180ms) e cenário de erro (default 0.5% de falha em dev, 0% em demo)
- ✅ Assinatura das APIs documentada como **contrato drop-in** para `SupabaseProvider` futuro
- ✅ Imagens placeholder via URLs externas (pravatar para avatares, picsum para imagens genéricas)
- ✅ Faker.js com locale `pt_BR` para textos em português
- ✅ Hook administrativo `useResetMocks()` que repopula com novo seed
- ✅ Botão "Reset mocks" na página `/design-system`
- ✅ Logs de mocks no console em dev mode (cada chamada de API logada de forma compacta para debug)

### Excluído

- ❌ Persistência real em IndexedDB ou localStorage do dataset completo (refresh limpa — comportamento aceitável no MVP; persistência leve apenas para auth e preferências de tema)
- ❌ WebSockets simulados para realtime (push de novas mensagens) — Fase 2; no MVP, refresh manual
- ❌ Geração de imagens próprias de peças (SVG ou foto stock embutida) — uso de placeholder externo é suficiente
- ❌ Sincronização entre múltiplas abas/sessões — fora do MVP
- ❌ Migração automática quando interfaces de tipo evoluem — gerador é regerado quando schema muda
- ❌ MSW para interceptar requests reais — Fase 2 quando houver Supabase para apontar
- ❌ Backup/export do dataset gerado — não é necessidade do MVP
- ❌ Componente UI para gerenciar mocks (editor visual de dados) — fora do escopo
- ❌ Replay de cenários (gravar e repetir interações) — fora do escopo

---

## Estrutura de Arquivos

```
src/mocks/
│
├── index.ts                        ← Barrel: exporta APIs públicas
├── config.ts                       ← Seed, volumes, latência, taxa de erro
│
├── data/                           ← Datasets fixos (seeds estáticos)
│   ├── seedStore.ts                ← Loja matriz GALLO
│   ├── seedSellers.ts              ← 3 vendedores fixos
│   ├── seedRoles.ts                ← 7 papéis + permissões
│   ├── seedPipelineStages.ts       ← Estágios do pipeline de leads
│   ├── seedLossReasons.ts          ← Motivos de perda
│   ├── seedTags.ts                 ← Tags sugeridas
│   ├── seedVehicleModels.ts        ← Catálogo de modelos de veículos
│   └── index.ts
│
├── generators/                     ← Geração determinística
│   ├── customer.ts                 ← generateCustomer(seed, refs)
│   ├── vehicle.ts                  ← generateVehicle(seed, refs)
│   ├── lead.ts
│   ├── conversation.ts
│   ├── message.ts
│   ├── part.ts
│   ├── quote.ts
│   ├── order.ts
│   ├── commission.ts
│   ├── goal.ts
│   ├── recommendation.ts
│   ├── audit.ts
│   ├── transfer.ts
│   ├── segment.ts
│   ├── bootstrap.ts                ← orquestra a geração completa de todo o dataset
│   └── utils/                      ← seededRandom, pickWeighted, ranges
│
├── store/                          ← Estado runtime
│   ├── mockStore.ts                ← Zustand store
│   ├── selectors.ts                ← funções de leitura puras
│   └── mutations.ts                ← funções de mutação (create/update/delete)
│
└── api/                            ← Contrato público (drop-in)
    ├── customers.ts                ← customersApi
    ├── vehicles.ts
    ├── leads.ts
    ├── conversations.ts
    ├── messages.ts
    ├── parts.ts
    ├── quotes.ts
    ├── orders.ts
    ├── commissions.ts
    ├── goals.ts
    ├── recommendations.ts
    ├── transfers.ts
    ├── segments.ts
    ├── sellers.ts
    ├── stores.ts
    ├── settings.ts
    ├── utils/                      ← simulateLatency, simulateError
    └── index.ts                    ← exports unificados
```

---

## Contrato das APIs (drop-in para Supabase)

Cada API por agregado expõe um conjunto consistente de operações CRUD + queries específicas. Exemplo do `customersApi`:

```typescript
// src/mocks/api/customers.ts

interface IListCustomersParams {
  storeId?: ID;
  status?: ICustomer["status"];
  sellerId?: ID;
  search?: string; // busca em nome/cnpj/cpf
  tags?: string[];
  segmentId?: ID;
  page?: number;
  pageSize?: number;
  orderBy?: "name" | "lastPurchaseAt" | "ticketMedio";
  orderDir?: "asc" | "desc";
}

interface IPaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const customersApi = {
  list: (params?: IListCustomersParams): Promise<IPaginatedResult<ICustomer>> => {
    /* ... */
  },
  get: (id: ID): Promise<ICustomer | null> => {
    /* ... */
  },
  create: (input: Omit<ICustomer, "id" | "createdAt">): Promise<ICustomer> => {
    /* ... */
  },
  update: (id: ID, patch: Partial<ICustomer>): Promise<ICustomer> => {
    /* ... */
  },
  delete: (id: ID): Promise<void> => {
    /* ... */
  },
  // específicas do domínio
  addNote: (customerId: ID, content: string, authorId: ID): Promise<ICustomerNote> => {
    /* ... */
  },
  listNotes: (customerId: ID): Promise<ICustomerNote[]> => {
    /* ... */
  },
};
```

A **mesma assinatura** será implementada pelo `SupabaseProvider` na Fase 2. Componentes não saberão quem está respondendo.

---

## Requisitos Funcionais

### Configuração e bootstrap

- **RF-001:** Criar `src/mocks/config.ts` com configurações editáveis:
  - `DEFAULT_SEED: number` (default: `42`)
  - `VOLUMES: Record<EntityName, number>` (todos os valores da seção "Volumes e Composição")
  - `LATENCY_MIN_MS: number` (default: `80`)
  - `LATENCY_MAX_MS: number` (default: `180`)
  - `ERROR_RATE: number` (default `0.005` em dev, `0` em demo/staging — controlado por `import.meta.env`)
  - `MOCK_LOGS_ENABLED: boolean` (default `true` em dev)
- **RF-002:** Implementar `bootstrap()` em `generators/bootstrap.ts` que orquestra a geração completa de todo o dataset respeitando integridade referencial:
  - Primeiro: entidades sem dependências (lojas, papéis, vendedores, peças, estágios)
  - Depois: entidades que dependem das primeiras (clientes, leads, conversas, orçamentos, pedidos, comissões, metas)
  - Por fim: entidades derivadas/calculadas (positivação, curva ABC, ranking, recomendações)
- **RF-003:** No primeiro acesso ao `mockStore`, se vazio, o sistema deve executar `bootstrap()` automaticamente.
- **RF-004:** O hook `useResetMocks()` deve permitir resetar o store e re-bootstrar com um seed específico ou aleatório.

### Determinismo

- **RF-005:** Toda geração deve usar `seedrandom` (ou equivalente) instanciado com a seed atual. Mesma seed deve produzir o **mesmo dataset bit-a-bit**.
- **RF-006:** Geradores que precisam de aleatoriedade devem receber a instância de RNG como parâmetro, nunca usar `Math.random()` direto.
- **RF-007:** Quando a seed muda (via `useResetMocks(novaSeed)`), todos os dados são regenerados; refs entre entidades devem ser refeitos.

### Integridade referencial

- **RF-008:** Nenhum ID referenciado por outra entidade pode apontar para entidade inexistente. Validação implícita: bootstrap quebra build em modo dev se gerar inconsistência.
- **RF-009:** Pedidos só podem referenciar clientes da mesma loja (`order.storeId === customer.storeId`).
- **RF-010:** Conversas com `customerId` preenchido devem ter `leadId` vazio e vice-versa.
- **RF-011:** Veículos pertencem a clientes B2B principalmente (≥ 80% dos veículos têm dono B2B no dataset gerado).
- **RF-012:** Comissões só existem para pedidos com `status: 'pago'`.

### Volumes e distribuição

- **RF-013:** Bootstrap deve respeitar os volumes especificados na seção "Volumes e Composição do Dataset" com tolerância de ±10%.
- **RF-014:** A distribuição de status (ex: status dos clientes 30/10/5/5) deve ser proporcional, não exata, garantindo realismo estatístico.
- **RF-015:** Distribuição temporal: dados históricos devem estar espalhados em janela apropriada (pedidos: 12 meses, conversas: 30 dias, leads: 60 dias, comissões: 3 meses).

### Store em memória

- **RF-016:** Implementar `mockStore` com Zustand contendo todas as ~32 entidades em arrays/maps tipados.
- **RF-017:** O store deve expor seletores puros (`getById`, `listByStore`, `listBySeller`, etc.) e mutations (`upsert`, `remove`, `addRelation`).
- **RF-018:** Componentes **não devem importar** diretamente do `mockStore` — apenas via APIs em `src/mocks/api/`.
- **RF-019:** Mutations devem manter integridade referencial: deletar um cliente não deixa pedidos órfãos (cascata semântica; no MVP, soft delete via `deletedAt` ou bloqueio se há referências, conforme regra de cada entidade — detalhar caso a caso).

### APIs públicas (contrato drop-in)

- **RF-020:** Cada agregado da pasta `api/` deve implementar pelo menos: `list`, `get`, `create`, `update`, `delete` quando aplicável, + operações específicas do domínio.
- **RF-021:** Toda função em `api/` deve:
  - Retornar `Promise<T>`
  - Simular latência via `simulateLatency()` antes de retornar
  - Simular erro via `simulateError()` que ocasionalmente rejeita a promise com erro tipado
- **RF-022:** Operações de `list` devem suportar paginação (`page`, `pageSize`), filtros e ordenação relevantes ao domínio.
- **RF-023:** Operações de `create` devem gerar `id` (`crypto.randomUUID()`), preencher `createdAt: new Date().toISOString()`, e adicionar ao store.
- **RF-024:** Operações de `update` devem fazer patch (merge superficial), preservando campos não enviados.
- **RF-025:** Erros simulados devem ser instâncias de classes tipadas: `MockNotFoundError`, `MockValidationError`, `MockNetworkError` — todas herdando de `MockError` base.
- **RF-026:** Log no console (quando `MOCK_LOGS_ENABLED`) deve mostrar: emoji + nome da API + parâmetros + ms de latência simulada + resultado/erro.

### Faker e textos em português

- **RF-027:** Instalar `@faker-js/faker` e configurar locale `pt_BR` global.
- **RF-028:** Nomes de pessoas, endereços, telefones, CNPJs/CPFs devem ser gerados via Faker com locale brasileiro.
- **RF-029:** Descrições de peças, motivos de perda, conteúdo de notas devem usar Faker com vocabulário coerente ao domínio (catálogo de palavras específicas mantido em `data/`).

### Imagens placeholder

- **RF-030:** Avatares de pessoas via `https://i.pravatar.cc/150?u={id}` (parâmetro `u` garante avatar determinístico por id).
- **RF-031:** Imagens de peças via `https://picsum.photos/seed/{partId}/400/300` (determinístico).
- **RF-032:** Logos de marcas (Volvo, Scania, etc.) como SVGs estáticos em `public/brands/`.

### Reset administrativo

- **RF-033:** Hook `useResetMocks(seed?: number)` que:
  - Aceita seed opcional (omitido = usa seed timestamp atual)
  - Limpa o store
  - Re-executa `bootstrap()` com a seed
  - Retorna informação do reset (seed usada, contagem de itens gerados)
- **RF-034:** Página `/design-system` (do PRD-001) deve ter seção "Mocks" com botão "Reset" e input para seed customizada.

---

## Requisitos Não-Funcionais

- **RNF-001 (Determinismo):** Mesma seed deve produzir dataset idêntico em qualquer execução, em qualquer máquina.
- **RNF-002 (Performance):** Bootstrap completo (~2200 itens) deve executar em menos de 500ms em dev mode.
- **RNF-003 (Tipagem):** Zero `any` em qualquer parte do módulo; todas as APIs públicas devem retornar tipos do PRD-002 sem mapeamento adicional.
- **RNF-004 (Compatibilidade Fase 2):** Assinatura das APIs em `src/mocks/api/` deve ser **idêntica** à futura assinatura do `SupabaseProvider`. Comentários `@todo` indicam onde Supabase fará algo diferente (ex: paginação via range header).
- **RNF-005 (Isolamento):** Imports do `mockStore` devem estar restritos a `src/mocks/`. Tentar importar de fora deve disparar aviso/erro de lint (regra configurável).
- **RNF-006 (Bundle):** Bibliotecas pesadas (Faker pesa ~500KB minificado) devem ser tree-shaken via imports específicos; nunca `import { faker } from '@faker-js/faker'` direto.
- **RNF-007 (Observabilidade):** Logs de API devem ser desabilitáveis via config para não poluir console em demos ao cliente.

---

## Critérios de Aceitação

### Bootstrap e determinismo

```gherkin
DADO que estou em dev mode e o mockStore está vazio
QUANDO o app carrega e chama qualquer API pela primeira vez
ENTÃO o bootstrap deve rodar automaticamente
  E o store deve conter aproximadamente 2200 itens (±10%)
  E não deve haver inconsistências referenciais (todos os IDs referenciados existem)

DADO que rodo bootstrap com seed=42 duas vezes em runs separados
QUANDO comparo os datasets gerados
ENTÃO devem ser bit-a-bit idênticos (mesma quantidade, mesmos IDs, mesmos nomes)

DADO que troco a seed para 1337
QUANDO bootstrap roda novamente
ENTÃO o dataset deve ser completamente diferente
  E ainda assim respeitar integridade referencial
```

### Integridade referencial

```gherkin
DADO que pego um IOrder aleatório do store
QUANDO inspeciono customerId, sellerId, items[*].partId
ENTÃO todas as entidades referenciadas devem existir no store
  E customer.storeId deve ser igual a order.storeId

DADO que pego uma IConversation aleatória
QUANDO ela tem customerId preenchido
ENTÃO leadId deve ser undefined (e vice-versa)

DADO que crio um novo cliente via customersApi.create(input)
QUANDO consulto customersApi.get(novoId)
ENTÃO devo receber o cliente recém-criado
  E o cliente deve aparecer em customersApi.list()
```

### Latência e erros simulados

```gherkin
DADO que ERROR_RATE é 0 (modo demo)
QUANDO chamo customersApi.list() 100 vezes
ENTÃO todas as chamadas devem ter sucesso
  E cada uma deve demorar entre 80ms e 180ms

DADO que ERROR_RATE é 0.5 (50%)
QUANDO chamo customersApi.list() 100 vezes
ENTÃO aproximadamente 50 chamadas devem rejeitar com MockNetworkError
  E o erro deve ser uma instância tipada (não string genérica)
```

### API contract drop-in

```gherkin
DADO um componente que consome customersApi
QUANDO o SupabaseProvider for implementado na Fase 2 com a mesma assinatura
ENTÃO o componente deve continuar funcionando sem nenhuma alteração de código
  E o switch entre mock e supabase deve ser apenas via VITE_DATA_SOURCE
```

### Reset e administração

```gherkin
DADO que estou em /design-system e clico em "Reset mocks"
QUANDO informo seed 999
ENTÃO o store deve ser limpo e re-populado com seed 999
  E todas as telas que dependiam de dados antigos devem se atualizar reativamente

DADO que reseto mocks sem informar seed
QUANDO o reset executa
ENTÃO uma seed baseada em timestamp deve ser usada
  E a nova seed deve aparecer no console + no design-system
```

### Cenários de erro

```gherkin
DADO que uma API simula um MockNotFoundError
QUANDO o componente chamador trata o erro
ENTÃO deve ser possível distinguir o tipo via instanceof MockNotFoundError
  E exibir mensagem amigável apropriada

DADO que tento criar um pedido com customerId inexistente
QUANDO chamo ordersApi.create(input)
ENTÃO deve rejeitar com MockValidationError
  E a mensagem deve indicar qual referência inválida
```

---

## Fases de Implementação

| Fase | Objetivo                                                     | Arquivos Estimados |
| ---- | ------------------------------------------------------------ | ------------------ |
| 1    | Configuração base, seeds estáticos e utils                   | 8-10               |
| 2    | Geradores das entidades principais (sem dependências)        | 6-8                |
| 3    | Geradores das entidades dependentes + bootstrap orquestrador | 8-10               |
| 4    | Store Zustand + APIs públicas (CRUD básico)                  | 15-18              |
| 5    | Reset, logs, integração com /design-system, validação final  | 3-4                |

### Detalhamento das Fases

#### Fase 1: Configuração Base, Seeds e Utils

**Objetivo:** ter a infraestrutura compartilhada de mocks pronta

**Ações:**

- [ ] Instalar dependências: `@faker-js/faker`, `seedrandom`, `zustand` (se não instalado pelo PRD-003)
- [ ] Criar `src/mocks/config.ts` com volumes, latência, taxa de erro
- [ ] Criar `src/mocks/data/` com 7 arquivos de seeds estáticos (store matriz, vendedores, papéis, estágios, motivos de perda, tags, modelos de veículos)
- [ ] Criar `src/mocks/generators/utils/` com helpers: `createSeededRandom`, `pickWeighted`, `randomDate`, `randomCNPJ`, `randomCPF`
- [ ] Criar `src/mocks/api/utils/` com `simulateLatency`, `simulateError` e classes `MockError`/`MockNotFoundError`/`MockValidationError`/`MockNetworkError`

**Validação:** seeds estáticos importáveis; utils retornam valores corretos; classes de erro têm instanceof funcionando.

#### Fase 2: Geradores Independentes

**Objetivo:** gerar entidades que não dependem de outras (catálogo, peças, papéis ampliados)

**Ações:**

- [ ] Implementar `generators/part.ts` (gera IPart com applications, oemCodes, etc.)
- [ ] Implementar `generators/customer.ts` (gera ICustomer B2B e B2C distinguidos por seed)
- [ ] Implementar `generators/seller.ts` (estende seeds fixos com campos calculados — availability, etc.)
- [ ] Implementar `generators/audit.ts` (gera IAuditLog distribuídos no tempo)

**Validação:** chamar cada gerador isoladamente produz entidades válidas que passam pela tipagem TypeScript.

#### Fase 3: Geradores Dependentes + Bootstrap

**Objetivo:** gerar tudo que depende de outras entidades + orquestrar

**Ações:**

- [ ] Implementar `generators/vehicle.ts` (vincula a clientes B2B)
- [ ] Implementar `generators/lead.ts`, `generators/conversation.ts`, `generators/message.ts`
- [ ] Implementar `generators/quote.ts`, `generators/order.ts` (com items, snapshots de preço)
- [ ] Implementar `generators/commission.ts` (deriva de orders pagos)
- [ ] Implementar `generators/goal.ts`, `generators/recommendation.ts`, `generators/transfer.ts`, `generators/segment.ts`
- [ ] Implementar `generators/bootstrap.ts` que orquestra a geração na ordem correta respeitando dependências

**Validação:** chamar `bootstrap(seed=42)` produz dataset completo, sem inconsistências referenciais, em < 500ms.

#### Fase 4: Store e APIs Públicas

**Objetivo:** expor o contrato drop-in para o resto do app consumir

**Ações:**

- [ ] Criar `store/mockStore.ts` com Zustand contendo todas as entidades
- [ ] Implementar seletores em `store/selectors.ts` e mutations em `store/mutations.ts`
- [ ] Implementar bootstrap automático no primeiro acesso ao store
- [ ] Implementar cada API em `api/` (customers, vehicles, leads, conversations, messages, parts, quotes, orders, commissions, goals, recommendations, transfers, segments, sellers, stores, settings) seguindo o contrato CRUD + específicas
- [ ] Adicionar simulação de latência e erro em todas as APIs
- [ ] Adicionar logs de console em dev mode
- [ ] Criar `src/mocks/index.ts` barrel exportando apenas as APIs

**Validação:** importar `customersApi` em uma feature qualquer e chamar `list()` retorna `Promise<IPaginatedResult<ICustomer>>` tipado corretamente após 80-180ms.

#### Fase 5: Reset, Documentação e Integração

**Objetivo:** ferramentas de administração + integração com /design-system

**Ações:**

- [ ] Implementar hook `useResetMocks()` em `src/mocks/hooks/`
- [ ] Adicionar seção "Mocks" na página `/design-system` (PRD-001) com botão de reset e input de seed
- [ ] Documentar contrato das APIs em comments JSDoc
- [ ] Adicionar regra de lint que impede import de `mockStore` fora de `src/mocks/`
- [ ] Validar volumes finais e integridade referencial em uma execução completa

**Validação:** botão "Reset mocks" em /design-system funciona; logs aparecem ordenados no console; volumes ±10% dos especificados.

---

## Dependências

### PRDs Anteriores

| PRD     | Descrição                                | Status                                |
| ------- | ---------------------------------------- | ------------------------------------- |
| PRD-002 | Modelo Conceitual de Domínio e Glossário | ⏳ Pendente (deve estar pronto antes) |

### Serviços Externos

| Serviço                      | Tipo                   | Status                                    |
| ---------------------------- | ---------------------- | ----------------------------------------- |
| Faker.js (`@faker-js/faker`) | Lib                    | A instalar                                |
| Zustand                      | Lib                    | A instalar (pode já ter vindo do PRD-003) |
| seedrandom                   | Lib                    | A instalar                                |
| pravatar.cc                  | CDN externo (avatares) | Disponível                                |
| picsum.photos                | CDN externo (imagens)  | Disponível                                |

### Decisões Pendentes

Nenhuma — todas as decisões críticas estão tomadas neste PRD e no briefing v1.1.

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Bloco 0 — Fundação"**.

| Ordem | PRD         | Título                                             | Status       | Relação                                        |
| ----- | ----------- | -------------------------------------------------- | ------------ | ---------------------------------------------- |
| 1     | PRD-001     | Identidade Visual GALLO e Design System Base       | ⏳           | —                                              |
| 2     | PRD-002     | Modelo Conceitual de Domínio e Glossário           | ⏳           | Pré-requisito (tipos consumidos)               |
| 3     | PRD-003     | Shell do App, Navegação e Layouts Base             | ⏳           | Paralelo (Zustand compartilhado)               |
| **4** | **PRD-004** | **Geradores de Dados Fictícios e Camada de Mocks** | **🔄 ATUAL** | Depende de PRD-002                             |
| 5     | PRD-005     | Arquitetura de Provedores de Dados                 | ⏳           | Depende de PRD-004 (abstrai mocks vs supabase) |
| 6     | PRD-006     | Sistema de Roles, Permissões e Auditoria           | ⏳           | Consome mocks                                  |
| 7     | PRD-007     | Multi-Loja                                         | ⏳           | Consome mocks                                  |

> **Nota:** PRD-004 é pré-requisito de todos os PRDs do Bloco 1 em diante. Sem mocks funcionando, nenhuma feature do app interno consegue ser implementada de forma demonstrável.

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### Dados fictícios — sem PII real

Todos os dados gerados são sintéticos (Faker). Não há e nunca pode haver qualquer dado real de cliente, vendedor, fornecedor, ou outra pessoa real envolvida na operação da GALLO BASE DIESEL no dataset de mocks.

### CNPJs e CPFs gerados

CNPJs e CPFs gerados via Faker são matematicamente válidos (passam no algoritmo de validação) mas **não são reais**. Cuidado para nunca trocar a função geradora por uma que extraia de base real.

### Console logs em produção

`MOCK_LOGS_ENABLED` deve ser `false` em build de produção e em demos ao cliente. Logs no console podem expor estrutura interna que não deve ser visível.

### URLs de imagens externas

`pravatar.cc` e `picsum.photos` são serviços públicos. Não enviar nenhum dado sensível como query parameter — apenas IDs aleatórios.

### Acesso ao reset

A página `/design-system` (e portanto o reset de mocks) é **dev-only** (PRD-001 RF-028). Em produção, o reset não está acessível. Mesmo assim, em demo ao cliente, ocultar o botão para evitar resets acidentais.

---

## Fluxos de Usuário

> Este PRD é estrutural, sem fluxos diretos de usuário final. Os fluxos relevantes são os do **desenvolvedor** e do **demonstrador da plataforma**:

### Fluxo Principal — Desenvolvedor consome a API em uma feature

1. Dev importa: `import { customersApi } from '@/mocks'`
2. Em um componente, chama: `const result = await customersApi.list({ storeId, page: 1, pageSize: 20 })`
3. Aguarda promise (80-180ms simulando latência real)
4. Recebe `IPaginatedResult<ICustomer>` tipado
5. Renderiza os clientes na tela

### Fluxo Alternativo — Demonstração ao cliente

1. Demonstrador abre o app
2. Mocks bootstram automaticamente com seed default
3. Cliente final navega como se fosse a plataforma real
4. Todas as listas, filtros, gráficos têm dados realistas e coerentes
5. Cliente cria um orçamento, abre uma conversa, deleta um lead — tudo funciona em memória
6. Refresh limpa as alterações; bootstrap roda de novo idêntico (mesma seed)

### Fluxo de Erro Simulado — Validação de tratamento na UI

1. Em dev mode, `ERROR_RATE` é elevado para `0.5` temporariamente
2. Dev navega no app
3. ~50% das chamadas falham com `MockNetworkError`
4. UI deve mostrar mensagens de erro amigáveis, botões de retry, fallbacks
5. Dev valida que todos os pontos de falha estão tratados antes de baixar `ERROR_RATE` de volta

### Fluxo de Reset — Teste de cenário específico

1. Dev quer reproduzir um bug que só aparece com 100 conversas pendentes
2. Acessa `/design-system` > "Mocks" > muda volume de conversas para 100 + status preponderante = aguardando
3. Clica "Reset mocks"
4. Bootstrap regera dataset com novos parâmetros
5. Dev consegue reproduzir o bug consistentemente

---

## Convenções de Código (Referência Rápida)

> **Consulte a Seção 5 do `guia-prd.md` para a versão completa.**

| Elemento                       | Convenção                            | Exemplo                                                |
| ------------------------------ | ------------------------------------ | ------------------------------------------------------ |
| **Geradores**                  | camelCase, prefixo `generate`        | `generateCustomer()`, `generateOrder()`                |
| **APIs**                       | camelCase, sufixo `Api`              | `customersApi`, `ordersApi`                            |
| **Seletores do store**         | camelCase, prefixo `select` ou `get` | `selectCustomersByStore()`, `getOrderById()`           |
| **Mutations do store**         | camelCase, verbo + entidade          | `upsertCustomer()`, `removeOrder()`                    |
| **Constantes de configuração** | UPPER_SNAKE_CASE                     | `DEFAULT_SEED`, `LATENCY_MIN_MS`                       |
| **Classes de erro**            | PascalCase, sufixo `Error`           | `MockNotFoundError`, `MockValidationError`             |
| **Arquivos**                   | kebab-case dentro de `src/mocks/`    | `bootstrap.ts`, `customers.ts`                         |
| **Imports do faker**           | Específicos                          | `import { faker } from '@faker-js/faker/locale/pt_BR'` |
| **Git commits**                | Conventional Commits                 | `feat: add gallo mock data generators`                 |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Você é o Claude Opus 4.7 operando via Claude Code CLI v2.1.3. Este PRD foi criado pelo Agente Arquiteto (Claude Opus 4.7 na plataforma web). Este PRD é implementado **após** o scaffold Lovable do PRD-001 e PRD-003 estar pronto, no clone local do repositório.

### Esclarecimento de Dúvidas

> **💬 Antes de implementar, faça perguntas para esclarecer qualquer ambiguidade sobre: requisitos funcionais, restrições técnicas, dependências, comportamentos esperados e critérios de aceitação.**

### Instruções Obrigatórias

> **⚠️ 1. ANTES DE IMPLEMENTAR:**
> "Lembre-se: explore a estrutura dos dados, planeje primeiro cada passo, analise, investigue a fundo, pense e revise tudo antes de realizar qualquer atualização ou implementação."

> **⚠️ 2. APÓS IMPLEMENTAR:**
>
> - Incrementar a versão do app seguindo [SemVer](https://semver.org/)
> - Atualizar o `CHANGELOG.md` seguindo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
> - Renomear este arquivo adicionando `_DONE` ao final
>   Ex: `PRD-004-mocks-geradores-dados_DONE.md`
> - Atualizar a seção "Status de Implementação"

### Guia de Versionamento (SemVer)

| Tipo de Mudança      | Ação                 | Exemplo       |
| -------------------- | -------------------- | ------------- |
| Correção de bug      | PATCH +1             | 0.1.0 → 0.1.1 |
| Nova funcionalidade  | MINOR +1, PATCH = 0  | 0.1.0 → 0.2.0 |
| Mudança incompatível | MAJOR +1, outros = 0 | 0.x.x → 1.0.0 |

🔗 Referência: https://semver.org/

### Princípios de Implementação

| Princípio                           | Descrição                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Determinismo é sagrado**          | Mesma seed = mesmo dataset sempre. Nunca usar `Math.random()` direto; sempre via RNG instanciada                                      |
| **Integridade referencial é regra** | Nenhuma entidade referencia ID inexistente. Validar em bootstrap                                                                      |
| **API é o contrato com Supabase**   | Cada operação em `api/` precisa ter assinatura que Supabase consiga implementar igual. Adicionar `@todo` quando previsível que mudará |
| **Isolamento do store**             | Store é interna ao módulo de mocks. Nenhuma feature deve importar `mockStore`, apenas APIs                                            |
| **Latência simula real**            | Sem latência simulada, devs esquecem de tratar loading states; UI nasce frágil                                                        |
| **Erros são tipados**               | Nunca rejeitar `Promise.reject('algo')`. Sempre uma classe de erro com instanceof funcional                                           |
| **Volumes realistas**               | Volumes baixos demais escondem problemas; volumes altos demais inflam o store. Os valores especificados são intencionais              |

### Orientações Gerais

| Aspecto                         | Orientação                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Faker locale**                | Sempre `pt_BR`. Import específico: `import { faker } from '@faker-js/faker/locale/pt_BR'`           |
| **Seeded random**               | Usar `seedrandom(seed)` para criar instância única passada como contexto aos geradores              |
| **Pesos em distribuições**      | Usar `pickWeighted` para garantir proporções (ex: 60% pedidos pagos, 30% pendentes, 10% cancelados) |
| **Datas históricas**            | Usar `faker.date.between` ou helper `randomDate(start, end)` para distribuir em janelas adequadas   |
| **CNPJ e CPF válidos**          | Implementar dígito verificador matematicamente válido (a maioria de validadores brasileiros checa)  |
| **Mensagens de chat realistas** | Templates de mensagens curtas (5-15 palavras) com ocasional anexo simulado (mediaType: 'image')     |
| **Avatares determinísticos**    | URL contendo o `id` do registro para consistência entre renders                                     |
| **Lint para isolamento**        | Configurar ESLint com `import/no-restricted-paths` para barrar `mockStore` fora de `src/mocks/`     |

### O que NÃO Fazer

| ❌ Evitar                                                                                          |
| -------------------------------------------------------------------------------------------------- |
| Usar `Math.random()` direto em qualquer gerador                                                    |
| Importar `mockStore` em features (`src/features/*/`) — apenas APIs                                 |
| Hardcodar IDs (`'customer-1'`) — sempre `crypto.randomUUID()`                                      |
| Misturar `snake_case` no modelo de mocks — modelo é `camelCase` (PRD-002)                          |
| Persistir o dataset completo em `localStorage` (refresh deve limpar; apenas auth e tema persistem) |
| Usar Faker sem locale `pt_BR`                                                                      |
| Esquecer `simulateLatency` ou `simulateError` em uma API                                           |
| Criar entidade não prevista no PRD-002 sem aprovação do Arquiteto                                  |
| Importar Faker inteiro (`import * as faker`) — quebra tree-shaking                                 |
| Logs verbosos em produção ou demo ao cliente (`MOCK_LOGS_ENABLED` em false)                        |
| Acoplar APIs a componentes via tipos custom — usar sempre tipos do PRD-002                         |
| Ignorar erros simulados (não tratar `MockNetworkError` na UI)                                      |

---

## Status de Implementação

| Campo                     | Valor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**                | ✅ IMPLEMENTADO                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Data de Implementação** | 25/05/2026                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Versão do App**         | v0.3.0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Codinome**              | Genesis (mantido — Hub abre quando a Onda 1 fechar)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Implementado por**      | Claude Opus 4.7 (Claude Code CLI)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Observações**           | Camada de mocks completa entregue: 5 subpastas (`config`, `data`, `generators`, `store`, `api`, `hooks`), ~32 geradores determinísticos, store Zustand com bootstrap automático, 22 APIs públicas com contrato drop-in, paginação genérica, simulação de latência (80–180ms) e erros tipados (`MockError` + 4 subclasses). Reset administrativo em `/design-system`. Lint rule `no-restricted-imports` bloqueia importações internas. Build limpo: 0 erros de lint, type-check passa, dataset gerado em < 500ms em dev. PRD-005 pronto para iniciar. |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                     |
| ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — camada de mocks completa, geradores determinísticos, store Zustand, APIs com contrato drop-in para Supabase |
| 25/05/2026 | v1.1   | Implementação concluída em v0.3.0 Genesis. Renomeado para `_DONE.md`.                                                         |
| 31/05/2026 | delta  | PRD-025 adiciona Copiloto de Vendas. O resumo mockado (quando não há escalonamento SDR) e as sugestões baseadas em regras são gerados **em runtime** pelo `mockCopilotProvider` — **não há gerador estático** em `src/mocks/` para essas entidades. Os arquivos responsáveis são `src/providers/data/impl/mock/copilot.ts` (provider mock: monta `ICopilotPanelData` com `ICopilotBriefing`, `ICopilotSummary` e `ICopilotSuggestion[]`) e `src/providers/data/impl/mock/copilotRules.ts` (motor de regras: avalia o contexto e produz sugestões baseadas em regras). |

---

**AILA - Sistemas Inteligentes**
