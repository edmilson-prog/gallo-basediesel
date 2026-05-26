# PRD-012: Ficha Unificada do Cliente

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                             |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                  |
| **Objetivo**          | Construir a "visão 360 do cliente" — coluna direita do `ConversationLayout` que costura dados cadastrais, conversas, pedidos, orçamentos, veículos, notas, recomendações e configurações do portal em uma única superfície navegável |
| **Tipo**              | Feature                                                                                                                                                                                                                              |
| **Complexidade**      | Alta                                                                                                                                                                                                                                 |
| **Total de Fases**    | 5                                                                                                                                                                                                                                    |
| **Prioridade**        | Alta                                                                                                                                                                                                                                 |
| **Épico**             | Bloco 1 — Central de Atendimento e CRM                                                                                                                                                                                               |
| **PRDs Relacionados** | PRD-010 (Inbox), PRD-011 (Conversa), PRD-015 (Lista Clientes), PRD-016 (Veículos), PRD-017 (Pipeline Leads), PRD-018 (Carteira), PRD-031 (Orçamentos), PRD-032 (Pedidos), PRD-071 (Portal Cliente)                                   |
| **Implementação**     | 🔵 Claude Code CLI (sobre o scaffold do Lovable)                                                                                                                                                                                     |
| **Padrão de código**  | Feature-based; código em `src/features/customers/`; componente raiz `<CustomerProfile>`; tabs em `src/features/customers/components/tabs/`                                                                                           |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios                                                       |
| ------------ | --------------------------------------------------------------- |
| **Baixa**    | 1 arquivo, sem dependências externas, < 100 linhas              |
| **Média**    | 2-5 arquivos, banco OU integração, funcionalidade isolada       |
| **Alta**     | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** 7 tabs distintas consumindo 6 providers diferentes (customers, orders, quotes, vehicles, conversations, recommendations + notes interno do customer); discriminated union B2B/B2C com campos diferentes; métricas comerciais derivadas (ticket médio, LTV, recência, ABC); badge condicional de "histórico pré-conversão"; tags com mecânica de promoção pelo gestor; configurações do Portal do Cliente em 7 toggles granulares; comportamento responsivo (drawer no tablet, tela cheia no mobile); ações contextuais com permissões granulares (PRD-006); e integração com Veículos (PRD-016) que ainda não está implementado mas precisa de placeholder navegável.

---

## Contexto do Problema

A ficha é o "cérebro" do CRM. Sem ela, o vendedor responde mensagens no escuro: não sabe se é cliente A da curva ABC, quantos pedidos já comprou, quais veículos ele tem, qual o histórico de orçamentos recusados. Cada resposta vira "espera aí, deixa eu buscar no sistema" — quebrando a fluidez do atendimento.

A GALLO BASE DIESEL atende frotas. Um cliente B2B com 30 caminhões tem informações **muito diferentes** de um B2C com um Hilux. Sem uma ficha que distingue isso e mostra os veículos do cliente, o vendedor não consegue rapidamente verificar "essa peça é compatível com o caminhão dele?". O resultado: o vendedor pede ao cliente que mande o modelo de novo, e o cliente que mandou semana passada se sente desvalorizado.

Três problemas concretos:

**Contexto disperso.** Dados do cliente em uma tela, pedidos em outra, conversas em outra, veículos em outra. Vendedor abre 4 abas só para entender o que está conversando. **Falta de "memória organizacional".** Se o cliente foi atendido por outro vendedor antes (transferência de carteira) ou veio de um lead frio que demorou 3 meses para fechar, esse histórico se perde. A ficha precisa preservar e expor esse contexto. **Decisões comerciais sem informação.** Ofereço desconto pra esse cliente? Ele é A ou C? Tem ticket médio alto ou baixo? Sem essas métricas na ponta, vendedor decide no feeling — e erra.

Este PRD resolve: ficha unificada em coluna direita do ConversationLayout (drawer no tablet, tela cheia no mobile), com 7 tabs cobrindo todas as dimensões do cliente, métricas comerciais visíveis no topo, badge de "histórico pré-conversão" para preservar memória organizacional, tags com mecânica de promoção pelo gestor, e ações contextuais para o que o vendedor faz mais (criar orçamento, adicionar nota, etc).

---

## Conceito da Solução

### Layout

A ficha aparece em três modos conforme viewport:

| Viewport   | Modo             | Anatomia                                                                        |
| ---------- | ---------------- | ------------------------------------------------------------------------------- |
| ≥ 1280px   | **Coluna fixa**  | Largura 360px à direita do `ConversationLayout`                                 |
| 768-1279px | **Drawer**       | Abre/fecha via botão "Ficha" no header da conversa; overlay deslizante de 360px |
| < 768px    | **Tela inteira** | Botão "Ficha" no header navega para `/app/clientes/:id` (rota dedicada PRD-015) |

Estrutura interna:

```
┌──────────────────────────────────────────┐
│ Header (h: variável, ~120px)              │
│  Avatar (large)                           │
│  Nome cliente   [B2B] [⭐ A]              │
│  📞 (55) 99999-9999   ✉ contato@x.com    │
│  [Criar orçamento] [⋮]                   │
├──────────────────────────────────────────┤
│ Tabs                                      │
│  Visão  Pedidos  Orçam.  Veículos  Conv. │
│  Notas  Recomend.                         │
├──────────────────────────────────────────┤
│                                          │
│ Conteúdo da tab ativa (scroll)            │
│                                          │
└──────────────────────────────────────────┘
```

### As 7 tabs

| #   | Tab               | Conteúdo principal                                                                           | Dependência       |
| --- | ----------------- | -------------------------------------------------------------------------------------------- | ----------------- |
| 1   | **Visão geral**   | Métricas + dados cadastrais + status + vendedor responsável + tags + portal                  | `customers`       |
| 2   | **Pedidos**       | Lista resumida dos pedidos (paginada), link para detalhe (PRD-032)                           | `orders`          |
| 3   | **Orçamentos**    | Lista resumida dos orçamentos, link para detalhe (PRD-031)                                   | `quotes`          |
| 4   | **Veículos**      | Lista de veículos do cliente, histórico de manutenção (PRD-016)                              | `vehicles`        |
| 5   | **Conversas**     | Histórico de todas as conversas (não só a atual)                                             | `conversations`   |
| 6   | **Notas**         | Cronológica; campo para adicionar nova; tags @vendedor                                       | `customers.notes` |
| 7   | **Recomendações** | Lista de `IRecommendation` ativas (cliente dormente, manutenção previsível, compra esperada) | `recommendations` |

### Header da ficha — informação primária

| Elemento                        | Detalhamento                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| Avatar                          | Foto (ou iniciais com cor consistente baseada em hash do id)                         |
| Nome                            | `customer.razaoSocial` ou `customer.fullName` (truncado em 2 linhas)                 |
| Badge tipo                      | "B2B" (cor `--brand-industrial`) ou "B2C" (neutro)                                   |
| Badge ABC                       | "⭐ A" / "B" / "C" — cor varia: A dourado, B prata, C neutro                         |
| Badge ciclo de vida             | "Ativo" (verde) / "Dormente" (amarelo) / "Recuperação" (azul) / "Perdido" (vermelho) |
| Badge "Histórico pré-conversão" | Quando `customer.convertedFromLeadId` é preenchido — cor `--brand-parts`             |
| Linhas de contato               | Telefone, email — com ícones clicáveis (telefone abre tel:, email abre mailto:)      |
| Botão "Criar orçamento"         | Atalho idêntico ao do PRD-011                                                        |
| Menu ⋮                          | Ações contextuais (lista abaixo)                                                     |

### Tab Visão Geral — anatomia detalhada

Cards verticais:

**Card Métricas:**

- Ticket médio: R$ X (últimos 12 meses)
- LTV: R$ Y (total histórico)
- Recência: "Há N dias" (última compra)
- Frequência: N pedidos no período
- Classificação ABC + percentual de share

**Card Cadastrais (B2B):**

- Razão social, nome fantasia
- CNPJ
- Contato principal
- Endereço completo

**Card Cadastrais (B2C):**

- Nome completo
- CPF
- Endereço completo

**Card Status e Carteira:**

- Status atual do ciclo de vida (com possível ação "Marcar como dormente" para Owner/Gestor)
- Vendedor responsável (avatar + nome + botão "Transferir carteira" link para PRD-018)
- Loja vinculada (badge `<StoreBadge>` do PRD-007)
- Primeira compra: data
- Última compra: data

**Card Tags:**

- Tags atuais do cliente (chips removíveis se user tem permissão)
- Input de adicionar tag com autocomplete:
  - Sugestões pré-aprovadas (`IPlatformSettings.tagSuggestions`)
  - Tags livres (criadas por vendedores) marcadas com ícone "rascunho"
  - Botão "Promover" no autocomplete: vendedor sugere promoção ao gestor (placeholder no MVP — apenas marca a tag com flag pending)

**Card Portal do Cliente:**

- 7 toggles granulares (read-only no MVP; edição em PRD-019):
  - Portal habilitado
  - Pode ver histórico de pedidos
  - Pode criar orçamento
  - Pode aprovar orçamento
  - Pode ver tabela de preços
  - Pode baixar NF
  - Pode ver limite de crédito
- Visualização clara: ✅ habilitado / ❌ desabilitado

### Tab Pedidos — anatomia

Lista paginada (10 por página) com:

- Número do pedido (ex: "#OP-2026-0042")
- Data
- Valor total
- Status visual (paymentStatus + fulfillmentStatus combinados)
- Item-síntese: "5 itens" ou nome da peça principal
- Click no item leva para detalhe (PRD-032)

Header da tab: filtros rápidos por período (30d / 90d / 12m / tudo) + ordenação (data desc default).

### Tab Orçamentos — anatomia

Similar à de Pedidos, mas para `IQuote`:

- Número
- Data
- Valor total + desconto aplicado
- Status: rascunho / enviado / aceito / recusado / expirado / convertido
- Origin: SDR / vendedor / cliente portal / e-commerce
- Click leva para detalhe (PRD-031)

### Tab Veículos — anatomia

Para B2B com frota, esta tab é central. Lista:

- Card por veículo: marca + modelo + ano + motor + placa (se houver) + km atual
- Foto/ícone do tipo de veículo
- Histórico de manutenção embaixo de cada (últimos 3 itens, link para "ver tudo" PRD-016)
- Botão "Adicionar veículo" (se user tem permission; modo manual/aprovação/automático conforme `IPlatformSettings.vehicleCadastroMode`)

Para B2C, tipicamente 1-2 veículos.

### Tab Conversas — anatomia

Lista das conversas históricas com este cliente (incluindo a atual em destaque):

- Avatar canal
- Vendedor que atendeu (avatar)
- Data início e fim (se resolvida)
- Status (resolvida/arquivada/etc.)
- Click navega para `/app/atendimento/:conversationId`

Útil quando vendedor atual quer ver "como ficou a última conversa que outro vendedor teve com esse cliente?".

### Tab Notas — anatomia

Linha do tempo de `ICustomerNote`:

- Avatar do autor + nome
- Timestamp relativo
- Conteúdo
- Sem opção de editar nem deletar no MVP (notas são compartilhadas e imutáveis após criação)

No fundo da tab: textarea para nova nota + botão "Adicionar" + Cmd/Ctrl+Enter envia.

### Tab Recomendações — anatomia

Cards de `IRecommendation` ativas para este cliente, com tipo, mensagem, prioridade visual e botão "Dispensar":

Tipos visíveis no MVP (apenas 3):

- **Cliente dormente** (não compra há 90+ dias)
- **Manutenção previsível** (frota deveria fazer revisão em breve)
- **Compra esperada faltando** (cliente recorrente que devia ter comprado já)

Outros 7 tipos (birthday, cross_sell, etc.) ficam dormentes — Fase 2 quando houver dados reais.

### Ações no menu ⋮ do header

| Ação                          | Permissão                        | Comportamento                                                             |
| ----------------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| Editar dados                  | `customer.edit`                  | Modal de edição (placeholder ou simples no MVP)                           |
| Marcar como dormente          | `customer.edit:store`            | Muda status manualmente; útil para casos especiais                        |
| Transferir carteira           | `transfer.create` (Owner/Gestor) | Link para PRD-018 com cliente pré-preenchido                              |
| Bloquear cliente              | `customer.delete`                | Mostra confirmação; muda status para "perdido" (não delete físico no MVP) |
| Adicionar veículo             | `vehicle.create`                 | Modal rápido ou link para PRD-016                                         |
| Ver no Pipeline (se foi lead) | sempre                           | Quando `convertedFromLeadId` existe, navega para o lead original          |
| Exportar dados (LGPD)         | Owner only                       | Placeholder com tooltip "Disponível na Fase 2"                            |

### Histórico pré-conversão

Quando `customer.convertedFromLeadId` é preenchido:

- Badge "Histórico pré-conversão" no header
- Tab "Conversas" inclui mensagens da fase de lead com banner sutil: "Anterior à conversão (lead frio em jan/2026)"
- Métricas começam a partir da data de conversão (não da criação do lead)
- Click no badge abre detalhes: data de criação como lead, dias até conversão, qual SDR/vendedor converteu

### Alternativas Consideradas

| Alternativa                              | Por que foi descartada                                        |
| ---------------------------------------- | ------------------------------------------------------------- |
| Tudo em uma tela rolável (sem tabs)      | Dificulta scan; tabs organizam mental model                   |
| Tabs em accordion (expandir/colapsar)    | Mais clicks para acessar; tabs são padrão CRM consagrado      |
| Ficha como modal/dialog                  | Bloqueia ConversationLayout; coluna lateral é o padrão        |
| Métricas em gráficos coloridos           | Espaço apertado; números brutos são mais úteis                |
| Histórico de conversas em outra rota     | Fragmenta o contexto; melhor dentro da ficha                  |
| Notas editáveis e deletáveis             | Audit trail quebra; melhor manter imutáveis                   |
| Portal do Cliente edição direta na ficha | Mistura responsabilidades; edição pertence ao PRD-019 (admin) |

**Decisão consolidada:** **ficha de coluna lateral em 7 tabs, responsivo (coluna → drawer → tela cheia), métricas em formato compacto, ações contextuais via menu ⋮, notas imutáveis, configurações do portal read-only.**

---

## Escopo

### Incluído

- ✅ Componente `<CustomerProfile>` em `src/features/customers/components/CustomerProfile.tsx`
- ✅ Renderizado na coluna direita do `ConversationLayout` quando há `customerId` na conversa
- ✅ Renderizado também como página dedicada `/app/clientes/:id` (substituindo placeholder do PRD-003) reusando o mesmo componente raiz
- ✅ Header com avatar, nome, badges (B2B/B2C, ABC, status ciclo de vida, histórico pré-conversão se aplicável), contatos, botão Criar orçamento, menu ⋮
- ✅ 7 tabs implementadas: Visão geral, Pedidos, Orçamentos, Veículos, Conversas, Notas, Recomendações
- ✅ Tab Visão Geral com 5 cards: Métricas, Cadastrais (discriminated B2B/B2C), Status e Carteira, Tags, Portal
- ✅ Tab Pedidos com lista paginada consumindo `useOrdersProvider`
- ✅ Tab Orçamentos com lista paginada consumindo `useQuotesProvider`
- ✅ Tab Veículos com lista de veículos (placeholder estilizado se PRD-016 ainda não implementado, mostrando estrutura visual mínima)
- ✅ Tab Conversas com histórico de conversações (atual destacada)
- ✅ Tab Notas com linha do tempo + textarea de nova nota (Cmd/Ctrl+Enter envia)
- ✅ Tab Recomendações com 3 tipos do MVP + botão "Dispensar"
- ✅ Mecanismo de tags: adicionar (com autocomplete de sugestões + tags livres), remover (com permissão), promover (placeholder — marca como pending para gestor)
- ✅ Configurações Portal do Cliente read-only com 7 toggles visuais
- ✅ Menu ⋮ com 7 ações contextuais filtradas por permissão (PRD-006)
- ✅ Comportamento responsivo: coluna ≥1280px, drawer 768-1279px, tela cheia <768px (rota /app/clientes/:id)
- ✅ Badge "Histórico pré-conversão" quando aplicável + detalhes ao clicar
- ✅ Loading states (skeleton) para cada tab durante fetch
- ✅ Empty states contextuais em cada tab (sem pedidos, sem veículos, etc.)
- ✅ Integração com `auditLog` em mutations sensíveis (mudança de status, transferência, adição/remoção de tags)

### Excluído

- ❌ Edição completa de dados cadastrais com validação fiscal (CNPJ válido, CEP via ViaCEP) — Fase 2
- ❌ Upload de fotos de cliente — Fase 2
- ❌ Mesclagem de duplicatas (mesmo cliente com 2 registros) — Fase 2
- ❌ Export real para LGPD (PDF com todos os dados) — Fase 2; botão placeholder
- ❌ Edição de tags do catálogo oficial — pertence ao PRD-019 (admin)
- ❌ Edição das configurações do Portal — pertence ao PRD-019
- ❌ Gráficos de comportamento de compra (linha temporal de pedidos) — fora do MVP, pode entrar nos PRDs de BI (Bloco 4)
- ❌ Sugestões de cross-sell baseadas em IA — Fase 2, parte do PRD-053
- ❌ Marcar nota como "importante" ou "urgente" — fora do MVP
- ❌ Atribuir nota a outro vendedor (@mencionar) — fora do MVP
- ❌ Histórico de mudança de tags (quando foi adicionada, quem) — audit cobre genericamente

---

## Requisitos Funcionais

### Componente raiz e roteamento

- **RF-001:** Criar `<CustomerProfile customerId={...}>` em `src/features/customers/components/CustomerProfile.tsx` que aceita o ID e renderiza o conteúdo.
- **RF-002:** Componente é consumido em 2 lugares: (a) coluna direita do `ConversationLayout` quando há `customerId` na conversa atual; (b) página dedicada `/app/clientes/:id` (PRD-015) renderiza o mesmo componente em tela cheia.
- **RF-003:** Buscar dados do cliente via `useCustomersProvider().get(customerId)`. Renderizar `<EmptyState>` com mensagem "Cliente não encontrado" se retornar null.
- **RF-004:** Se há `conversationId` no contexto (rota atual `/app/atendimento/:id`), buscar conversa via `useConversationsProvider().get(conversationId)` para detectar se cliente está vinculado a ela; se sim, marcar essa conversa como "atual" na tab Conversas.

### Header da ficha

- **RF-005:** Header com altura variável (≈120px) contendo:
  - Avatar large (96px ou 80px em coluna)
  - Nome do cliente (B2B: `razaoSocial || nomeFantasia`; B2C: `fullName`)
  - Badges em linha: tipo (B2B/B2C), ABC (A/B/C), status ciclo de vida, "Histórico pré-conversão" (condicional)
  - Linha de contatos com telefone e email, com ícones Iconify clicáveis
  - Botão Criar orçamento (chama `/app/orcamentos/novo?customerId=X`)
  - Menu ⋮ (DropdownMenu do shadcn)
- **RF-006:** Badge "Histórico pré-conversão" aparece **apenas** quando `customer.convertedFromLeadId` está preenchido; cor `--brand-parts`.
- **RF-007:** Click no badge abre `<Popover>` com detalhes: "Era lead desde DD/MM/YYYY", "Convertido em DD/MM/YYYY (N dias depois)", "Convertido por: [nome do vendedor/SDR]".

### Tab Visão Geral

- **RF-008:** Card Métricas (sempre visível primeiro) renderiza:
  - Ticket médio: `customer.ticketMedio` formatado em BRL
  - LTV: `customer.ltv` formatado em BRL
  - Recência: "Há N dias" calculado de `customer.lastPurchaseAt`
  - Frequência: contagem de pedidos nos últimos 12 meses (via consulta a `useOrdersProvider`)
  - Classificação ABC: badge com classe + share (consulta `useAbcProvider` no futuro; no MVP, usar campo direto de `IABCClassification`)
- **RF-009:** Card Cadastrais condicional via discriminated union em `customer.type`:
  - B2B: razão social, nome fantasia, CNPJ formatado, contato principal, endereço
  - B2C: nome completo, CPF formatado, endereço
- **RF-010:** Card Status e Carteira:
  - Status atual com cor semântica + botão "Mudar status" (se `customer.edit:store` permitido)
  - Vendedor responsável: avatar + nome + botão "Transferir" (link para PRD-018)
  - `<StoreBadge>` da loja vinculada
  - Datas de primeira e última compra
- **RF-011:** Card Tags com chips removíveis (X aparece se user tem `customer.edit` no scope adequado), input de adicionar com autocomplete:
  - Sugestões pré-aprovadas listadas primeiro com cor neutra
  - Tags livres (não promovidas) listadas com ícone de "rascunho"
  - Botão "Sugerir promoção" no autocomplete (placeholder no MVP — marca a tag com flag pending sem efeito real)
- **RF-012:** Card Portal do Cliente read-only:
  - 7 toggles visuais (✅/❌) listados em duas colunas: enabled, canViewOrderHistory, canCreateQuote, canApproveQuote, canSeePriceTable, canDownloadNF, canSeeCreditLimit
  - Cabeçalho do card tem ícone de "edição" com tooltip: "Edição disponível em Configurações > Portal do Cliente (PRD-019)"

### Tab Pedidos

- **RF-013:** Lista paginada (10 por página) via `useOrdersProvider().list({ customerId, orderBy: 'createdAt', orderDir: 'desc' })`.
- **RF-014:** Cada item da lista mostra: número formatado (`#OP-2026-0042`), data, valor total, badge de status (combinando paymentStatus + fulfillmentStatus de forma legível), item-síntese ("5 itens" ou nome da peça principal).
- **RF-015:** Header da tab tem filtros rápidos: 30d / 90d / 12m / tudo (default 12m).
- **RF-016:** Click no item navega para `/app/pedidos/:id` (PRD-032).
- **RF-017:** Empty state: "Este cliente ainda não fez pedidos."

### Tab Orçamentos

- **RF-018:** Lista paginada via `useQuotesProvider().list({ customerId, orderBy: 'createdAt', orderDir: 'desc' })`.
- **RF-019:** Cada item: número, data, valor total + desconto, status, origin (badge: SDR / vendedor / cliente portal / e-commerce).
- **RF-020:** Click navega para `/app/orcamentos/:id` (PRD-031).
- **RF-021:** Empty state: "Sem orçamentos para este cliente."

### Tab Veículos

- **RF-022:** Lista via `useVehiclesProvider().list({ customerId })`.
- **RF-023:** Cada veículo: card com marca + modelo + ano + motor + placa + km atual; histórico de manutenção (últimos 3 itens com data e itens consumidos).
- **RF-024:** Botão "Ver todos" para PRD-016 se houver mais que 3 itens de histórico por veículo.
- **RF-025:** Botão "Adicionar veículo" no topo da tab — comportamento conforme `IPlatformSettings.vehicleCadastroMode`:
  - `auto`: modal simples com brand/model/year/engine; salva direto
  - `approval`: salva com `cadastroStatus: 'pendente'`
  - `manual`: redirecionar para PRD-016 (placeholder)
- **RF-026:** Empty state: "Sem veículos cadastrados."

### Tab Conversas

- **RF-027:** Lista de `IConversation` para o `customer.id` via `useConversationsProvider().listByCustomer(customerId)`.
- **RF-028:** Ordenação: mais recentes primeiro; conversa atual (se houver) sempre no topo com badge "Atual".
- **RF-029:** Cada item: ícone do canal, vendedor que atendeu (avatar+nome), data início e fim (se resolvida), status.
- **RF-030:** Click navega para `/app/atendimento/:conversationId`.

### Tab Notas

- **RF-031:** Linha do tempo cronológica reversa via `useCustomersProvider().listNotes(customerId)`.
- **RF-032:** Cada nota: avatar do autor + nome + timestamp relativo + conteúdo. Sem opção de editar ou deletar (imutabilidade).
- **RF-033:** No rodapé da tab, textarea + botão "Adicionar nota" + suporte a Cmd/Ctrl+Enter para enviar.
- **RF-034:** Após criar nota, lista atualiza, toast confirma "Nota adicionada".

### Tab Recomendações

- **RF-035:** Lista de `IRecommendation` ativas via `useRecommendationsProvider().listForCustomer(customerId)`.
- **RF-036:** Filtrar apenas os 3 tipos do MVP: `dormant`, `predictable_maintenance`, `expected_purchase_missing`.
- **RF-037:** Cada recomendação: ícone temático, mensagem, prioridade (cor visual: critical vermelho, high laranja, medium amarelo, low neutro), botão "Dispensar" que muda status para descartada (audit log).
- **RF-038:** Empty state: "Sem recomendações ativas para este cliente."

### Menu ⋮ de ações

- **RF-039:** Renderizar opções conforme permissões:
  - **Editar dados** (`customer.edit:scope`): modal simples no MVP
  - **Marcar como dormente** (`customer.edit:store`): muda status manual, audit log
  - **Transferir carteira** (`transfer.create`): link para PRD-018 com cliente pré
  - **Bloquear cliente** (`customer.delete`): confirmação + mudar status para "perdido" (soft)
  - **Adicionar veículo** (`vehicle.create`): atalho para fluxo da tab Veículos
  - **Ver no Pipeline** (sempre, se `convertedFromLeadId` existe): navega para `/app/leads/:id`
  - **Exportar dados (LGPD)** (Owner only): placeholder com tooltip "Disponível na Fase 2"

### Responsividade

- **RF-040:** Viewport ≥ 1280px: coluna fixa de 360px à direita do `ConversationLayout`.
- **RF-041:** Viewport 768-1279px: drawer overlay que abre/fecha via botão "Ficha" no header da conversa (PRD-011); deslizamento da direita.
- **RF-042:** Viewport < 768px: botão "Ficha" no header da conversa navega para `/app/clientes/:id` em tela cheia; tabs viram navegação top com scroll horizontal se necessário.

### Estados de loading e empty

- **RF-043:** Cada tab tem skeleton específico durante fetch inicial.
- **RF-044:** Empty states contextuais conforme especificado em cada tab.
- **RF-045:** Loading global da ficha (Skeleton substituindo o componente inteiro) durante fetch inicial de `customer.get()`.

### Auditoria

- **RF-046:** Audit log via `auditLog()` (PRD-006) em:
  - Mudança de status (RF-010, RF-039 marcar dormente)
  - Adição/remoção de tag
  - Dispensa de recomendação
  - Bloqueio de cliente
  - Adição de nota
  - Transferência de carteira (referenciar PRD-018 que faz a operação)

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Ficha completa renderiza em < 400ms (incluindo tab Visão Geral default).
- **RNF-002 (Lazy load):** Conteúdo de cada tab é fetched **apenas quando a tab é ativada** (não pre-fetch de todas).
- **RNF-003 (Cache):** Re-abertura da ficha do mesmo cliente em ≤ 2 min usa cache em memória (Zustand do store, sem novo fetch).
- **RNF-004 (Responsividade):** Funcional em viewports de 360px a 1920px.
- **RNF-005 (Acessibilidade):** WCAG 2.1 AA; tabs com navegação por teclado (←/→); cada tab tem `role="tab"` + `aria-selected`.
- **RNF-006 (Tipagem):** Zero `any`; discriminated union B2B/B2C respeitada no header e cards.

---

## Critérios de Aceitação

### Renderização

```gherkin
DADO uma conversa aberta em /app/atendimento/abc onde customer é "Transportadora Aurora"
QUANDO viewport é desktop (≥ 1280px)
ENTÃO vejo a ficha na coluna direita com header, tabs e conteúdo da tab Visão Geral

DADO viewport é tablet (1024px)
QUANDO clico botão "Ficha" no header da conversa
ENTÃO drawer abre com a ficha do cliente
  E clicar fora ou no botão de fechar oculta o drawer

DADO viewport é mobile (390px)
QUANDO clico botão "Ficha" no header da conversa
ENTÃO navego para /app/clientes/abc em tela cheia
  E tabs viram navegação top com scroll horizontal se preciso
```

### Discriminated union B2B/B2C

```gherkin
DADO um cliente B2B (Transportadora Aurora)
QUANDO observo o Card Cadastrais
ENTÃO vejo razão social, nome fantasia, CNPJ, contato principal, endereço

DADO um cliente B2C (Pedro da Silva)
QUANDO observo o Card Cadastrais
ENTÃO vejo nome completo, CPF, endereço
  E NÃO vejo CNPJ nem razão social
```

### Tags

```gherkin
DADO que sou Vendedor com permission edit em customer (own)
QUANDO digito uma tag livre "frota Volvo" no input de tags
ENTÃO ela é adicionada com marcador "rascunho" (não no catálogo oficial)
  E botão "Sugerir promoção" aparece ao lado da tag

DADO que sou Owner/Gestor
QUANDO recebo um cliente com tag "frota Volvo" marcada como rascunho
ENTÃO vejo opção para promover ao catálogo oficial (placeholder no MVP)
```

### Histórico pré-conversão

```gherkin
DADO um cliente que veio de um lead convertido
QUANDO observo o header
ENTÃO vejo o badge "Histórico pré-conversão" em cor --brand-parts
  E clicar no badge abre Popover com data de criação como lead, dias até conversão, quem converteu

DADO um cliente sem histórico de lead (criado direto)
QUANDO observo o header
ENTÃO badge "Histórico pré-conversão" NÃO aparece
```

### Recomendações

```gherkin
DADO um cliente dormente há 95 dias
QUANDO abro a tab Recomendações
ENTÃO vejo card de tipo "dormant" com mensagem apropriada e prioridade visual

DADO que clico "Dispensar" em uma recomendação
QUANDO a ação processa
ENTÃO a recomendação é marcada como descartada
  E some da lista
  E auditLog registra a dispensa
```

### Notas

```gherkin
DADO que digito uma nota e pressiono Cmd/Ctrl+Enter
QUANDO o envio processa
ENTÃO a nota aparece imediatamente na timeline
  E o textarea limpa
  E toast confirma "Nota adicionada"

DADO uma nota criada por outro vendedor
QUANDO observo a tab Notas
ENTÃO vejo a nota com avatar e nome do autor visíveis
  E NÃO tenho opção de editar ou deletar
```

### Tab Pedidos com filtros

```gherkin
DADO um cliente com 30 pedidos históricos
QUANDO abro a tab Pedidos
ENTÃO vejo lista paginada de 10 itens, filtro default "12m"
  E vejo total da página atual (ex: "10 de 28")
  E ao trocar filtro para "30d", lista refiltra para últimos 30 dias
  E clicar em um pedido navega para /app/pedidos/:id
```

### Ações contextuais

```gherkin
DADO que sou Vendedor sem permission delete em customer
QUANDO abro o menu ⋮
ENTÃO não vejo opção "Bloquear cliente"
  E vejo Adicionar veículo, Adicionar nota, e nada mais

DADO que sou Owner
QUANDO abro o menu ⋮
ENTÃO vejo todas as opções, incluindo "Exportar dados (LGPD)" com tooltip "Disponível na Fase 2"
```

### Cenários de erro

```gherkin
DADO que ID na URL não existe
QUANDO acesso /app/clientes/inexistente
ENTÃO vejo EmptyState "Cliente não encontrado" + botão "Voltar à lista"

DADO que provider falha
QUANDO useCustomersProvider().get(id) rejeita
ENTÃO vejo erro genérico + botão "Tentar novamente"
```

---

## Fases de Implementação

| Fase | Objetivo                                                   | Arquivos Estimados |
| ---- | ---------------------------------------------------------- | ------------------ |
| 1    | Componente raiz, header, layout das tabs e Tab Visão Geral | 8-10               |
| 2    | Tabs Pedidos, Orçamentos e Conversas                       | 6-7                |
| 3    | Tabs Veículos, Notas, Recomendações                        | 6-7                |
| 4    | Menu ⋮ com ações, mecanismo de tags, configurações Portal  | 5-6                |
| 5    | Responsividade, lazy loading de tabs, auditoria, polish    | 3-4                |

### Detalhamento das Fases

#### Fase 1: Estrutura e Visão Geral

**Objetivo:** componente navegável com 1 tab funcional

**Ações:**

- [ ] Criar `<CustomerProfile customerId>` raiz
- [ ] Renderizar header completo com avatar, nome, badges (B2B/B2C, ABC, ciclo vida), contatos, botão Criar orçamento, menu ⋮ (vazio por enquanto)
- [ ] Implementar discriminated union no header e nos cards
- [ ] Implementar 5 cards da Tab Visão Geral: Métricas, Cadastrais, Status e Carteira, Tags (sem promoção ainda), Portal (read-only)
- [ ] Skeleton durante loading
- [ ] EmptyState quando não encontrado

**Validação:** ficha de um cliente B2B carrega com header completo + 5 cards da Visão Geral.

#### Fase 2: Pedidos, Orçamentos, Conversas

**Objetivo:** 3 tabs adicionais com listagens

**Ações:**

- [ ] Tab Pedidos: lista paginada + filtros rápidos (30d/90d/12m/tudo)
- [ ] Tab Orçamentos: lista paginada com badge de origin
- [ ] Tab Conversas: lista com badge "Atual" + click navega
- [ ] Empty states específicos
- [ ] Skeleton individual por tab

**Validação:** trocar entre tabs funciona; lazy load por tab (não busca pedidos antes de abrir a tab).

#### Fase 3: Veículos, Notas, Recomendações

**Objetivo:** completar 7 tabs

**Ações:**

- [ ] Tab Veículos: cards de veículos + histórico de manutenção (placeholder estilizado se PRD-016 não pronto)
- [ ] Tab Notas: timeline + textarea de nova nota com Cmd/Ctrl+Enter
- [ ] Tab Recomendações: cards com tipo + prioridade + "Dispensar"
- [ ] Empty states específicos

**Validação:** ciclar entre todas as 7 tabs sem erros; criar nota funciona.

#### Fase 4: Ações, Tags, Portal

**Objetivo:** funcionalidades interativas

**Ações:**

- [ ] Implementar menu ⋮ completo com 7 ações filtradas por permissão (PRD-006)
- [ ] Modal de "Editar dados" (simples no MVP)
- [ ] Mecanismo de tags: adicionar (com autocomplete sugestões + livres), remover, sugerir promoção (placeholder)
- [ ] Botão "Adicionar veículo" com 3 modos conforme `vehicleCadastroMode`
- [ ] Toggles Portal são read-only mas estilizados

**Validação:** ações respeitam permissões; tags funcionam; promoção marca como pending.

#### Fase 5: Responsividade, Polish, Auditoria

**Objetivo:** produção-ready

**Ações:**

- [ ] Comportamento responsivo: coluna ≥1280, drawer 768-1279, tela cheia <768
- [ ] Lazy loading de cada tab
- [ ] Cache de 2min via Zustand para reabrir mesma ficha rápido
- [ ] Audit log em todas as mutations (mudança status, tags, recomendações, etc.)
- [ ] Navegação por teclado entre tabs (← →)
- [ ] Validação WCAG AA nas 8 combinações tema/modo do PRD-001

**Validação:** mobile usável; reabrir mesma ficha em < 50ms; teclado completo; auditoria registra mudanças.

---

## Dependências

### PRDs Anteriores

| PRD     | Descrição         | Status                                                                 |
| ------- | ----------------- | ---------------------------------------------------------------------- |
| PRD-001 | Identidade Visual | 📝 Redigido                                                            |
| PRD-002 | Modelo Conceitual | 📝 Redigido                                                            |
| PRD-003 | Shell e Layouts   | 📝 Redigido                                                            |
| PRD-005 | Provider Pattern  | 📝 Redigido                                                            |
| PRD-006 | RBAC              | 📝 Redigido                                                            |
| PRD-010 | Inbox             | 📝 Redigido                                                            |
| PRD-011 | Conversa          | 📝 Redigido                                                            |
| PRD-016 | Veículos          | ⏳ Pendente (tab Veículos consome — placeholder estilizado até pronto) |

### Serviços Externos

Nenhum (usa libs já instaladas).

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

| Ordem | PRD         | Título                         | Status       |
| ----- | ----------- | ------------------------------ | ------------ |
| 1     | PRD-010     | Inbox                          | 📝           |
| 2     | PRD-011     | Conversa                       | 📝           |
| **3** | **PRD-012** | **Ficha Unificada do Cliente** | **🔄 ATUAL** |
| 4     | PRD-013     | Distribuição                   | ⏳           |
| ...   |             |                                |              |

---

## Considerações de Segurança

### PII visível no header

Telefone, email, CPF/CNPJ são visíveis no header. Acesso é controlado pelo RBAC (Vendedor só vê clientes da carteira, etc.). Em audit log, anotar quem visualizou a ficha de cada cliente (na Fase 2).

### Notas são compartilhadas

Conforme PRD-002, notas não têm flag `private`. Qualquer vendedor que tenha permissão de ver o cliente vê todas as notas. Estratégia consciente: transparência > sigilo para favorecer transferências de carteira sem perda de contexto.

### Imutabilidade de notas

Audit trail depende disso. Editar/deletar nota quebra auditoria. Imutáveis = source of truth.

### LGPD na exportação

Botão placeholder "Exportar dados (LGPD)" é estratégico — mostra ao cliente final que vamos cumprir LGPD na Fase 2 com endpoint dedicado: gera PDF/JSON com todos os dados do cliente.

---

## Fluxos de Usuário

### Fluxo Principal — Vendedor abre ficha durante conversa

1. Carlos está em conversa com "Transportadora Aurora" (`/app/atendimento/abc`)
2. Ficha está na coluna direita (desktop) ou drawer (tablet)
3. Tab default Visão Geral: vê métricas (ticket médio R$ 4.500, LTV R$ 145k, classificação A)
4. Identifica "Cliente importante, vou priorizar"
5. Tab Veículos: vê que tem frota Volvo + Scania (8 caminhões)
6. Volta a responder cliente sabendo o contexto

### Fluxo Alternativo — Histórico pré-conversão

1. Vendedora Marina abre ficha de novo cliente "Frota Caminhões Express"
2. Vê badge "Histórico pré-conversão" no header
3. Clica → Popover mostra: "Era lead desde 12/03/2026, convertido em 28/04/2026 (47 dias depois), convertido por SDR"
4. Marina entende o contexto longo de qualificação antes da venda
5. Adiciona nota: "Cliente teve dúvida sobre prazo, vamos garantir entrega rápida"

### Fluxo Mobile — Vendedor no celular

1. Em iPhone, Carlos toca em "Ficha" no header da conversa
2. Navega para `/app/clientes/abc` em tela cheia
3. Tabs no topo com scroll horizontal (cabe 4-5 visíveis, demais por swipe)
4. Lê dados, troca de tab, toca em pedido específico
5. Navega para `/app/pedidos/X` para detalhe; "voltar" retorna ao topo da ficha

### Fluxo de Erro — Cliente removido

1. Carlos abre conversa antiga com cliente que foi removido por LGPD
2. Coluna central mostra histórico de mensagens
3. Coluna direita: EmptyState "Cliente não encontrado ou removido"
4. Mensagens antigas continuam visíveis mas sem ficha vinculada

---

## Convenções de Código (Referência Rápida)

| Elemento            | Convenção                  | Exemplo                                                     |
| ------------------- | -------------------------- | ----------------------------------------------------------- |
| **Componente raiz** | PascalCase                 | `<CustomerProfile>`                                         |
| **Tabs**            | PascalCase + sufixo `Tab`  | `<OverviewTab>`, `<OrdersTab>`, `<NotesTab>`                |
| **Cards**           | PascalCase + sufixo `Card` | `<MetricsCard>`, `<TagsCard>`                               |
| **Hooks**           | camelCase + `use`          | `useCustomerData`, `useCustomerNotes`                       |
| **Pasta**           | kebab-case                 | `customers/`, `tabs/`, `cards/`                             |
| **Git commits**     | Conventional Commits       | `feat(customers): add unified customer profile with 7 tabs` |

---

## Notas para o Agente Desenvolvedor

### Princípios

| Princípio                                    | Descrição                                                          |
| -------------------------------------------- | ------------------------------------------------------------------ |
| **Ficha é cérebro do CRM**                   | Todo dado relevante do cliente acessível em ≤ 2 clicks             |
| **Discriminated union B2B/B2C**              | TypeScript valida, cards renderizam conteúdo certo automaticamente |
| **Lazy load por tab**                        | Tab inativa não busca dados — economia de chamadas                 |
| **Imutabilidade de notas**                   | Audit trail depende. Não permitir edição/exclusão                  |
| **Tags livres + promoção**                   | Vendedor cria; gestor promove. Placeholder no MVP é OK             |
| **Configurações Portal read-only**           | Edição mora no PRD-019 — sinalizar claramente                      |
| **Histórico pré-conversão preserva memória** | Badge + Popover educam o vendedor sobre origem do cliente          |

### Orientações Gerais

| Aspecto                   | Orientação                                                                    |
| ------------------------- | ----------------------------------------------------------------------------- |
| **Discriminated union**   | `customer.type === 'B2B'` faz TypeScript inferir campos B2B; idem B2C         |
| **Métricas calculadas**   | No MVP, vêm dos mocks pré-calculados; Fase 2 talvez via VIEW no Supabase      |
| **Cache de 2min**         | Zustand store mantém últimas N fichas vistas em memória; chave por customerId |
| **Avatares consistentes** | Mesmo hash do PRD-010 para gerar cores; ou foto via pravatar mock             |
| **Formatação BRL**        | Helper `formatBRL(value)` em `src/shared/utils/`; também para CPF/CNPJ        |
| **Skeleton tabs**         | Componente `<TabSkeleton>` genérico com altura adequada à tab                 |

### O que NÃO Fazer

| ❌ Evitar                                                                          |
| ---------------------------------------------------------------------------------- |
| Pre-fetch de todas as tabs ao abrir a ficha — lazy load por tab                    |
| Permitir edição/exclusão de notas                                                  |
| Misturar campos B2B em ficha B2C ou vice-versa                                     |
| Implementar edição completa do Portal — é PRD-019                                  |
| Implementar pipeline de leads na tab Conversas — é PRD-017                         |
| Fazer transferência de carteira nesta ficha — link para PRD-018                    |
| Esquecer permissões nas ações do menu ⋮                                            |
| Ignorar responsividade — drawer/tela cheia/coluna são cenários reais               |
| Tags livres ficarem indistinguíveis de tags oficiais — marcador visual obrigatório |
| Esquecer badge "Histórico pré-conversão" para clientes que vieram de leads         |

---

## Status de Implementação

| Campo      | Valor       |
| ---------- | ----------- |
| **Status** | ⏳ PENDENTE |
| **Data**   | -           |
| **Versão** | -           |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                                                       |
| ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — ficha unificada com 7 tabs, métricas, discriminated union B2B/B2C, tags com promoção, configurações portal read-only, histórico pré-conversão |

---

**AILA - Sistemas Inteligentes**
