# Briefing de Execução — PRDs do Projeto GALLO BASE DIESEL

> **Documento mestre de execução** — versão 1.1 — Maio/2026
> Consolida todo o desenho da plataforma e serve como **input único** da sessão de escrita dos 50 PRDs.
>
> **Arquiteto:** Edmilson Souza (AILA Sistemas Inteligentes)
> **Sessão de planejamento:** Claude Opus 4.7 (claude.ai)
> **Sessão de execução:** Claude Opus 4.7 — escrita dos PRDs
> **Implementação posterior:** Claude Code CLI v2.1.3 (Agente Desenvolvedor)
> **Scaffold visual inicial:** Lovable (apenas PRD-001 e PRD-003)

---

## Sumário de mudanças nesta versão (v1.1)

Esta revisão consolida o rebranding **Turbo Diesel → GALLO BASE DIESEL** e amarra decisões adicionais tomadas em sessão posterior ao briefing v1.0:

| Área                                | Mudança                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Nome do projeto e da plataforma** | "Turbo Diesel" → **"GALLO BASE DIESEL"** em toda a documentação e interface                                                    |
| **Arquitetura de marca**            | Marca guarda-chuva com 3 submarcas: PARTS (verde), SERVICE (vermelho), INDUSTRIAL (amarelo)                                    |
| **Paleta principal**                | Vermelho `#C41E3A` + carbono `#1A1A1A` (descartados) → **preto técnico `#404041` + dourado `#D2A809`** da "cromia óleo diesel" |
| **Sistema de temas**                | Nova decisão: **4 temas** (Diesel/Parts/Service/Industrial) × 2 modos (light/dark) = 8 combinações                             |
| **Tema padrão**                     | **Dark + Diesel** (Black Gold)                                                                                                 |
| **Tipografia**                      | Saira Condensed (display) + Inter (UI) + JetBrains Mono (códigos OEM) — confirmadas                                            |
| **Modelo conceitual**               | Novo campo `division: 'parts' \| 'service' \| 'industrial'` em entidades comerciais; default `parts` no MVP                    |
| **Submarcas SERVICE e INDUSTRIAL**  | Modeladas mas dormentes no MVP — reservadas para evolução futura sem retrabalho                                                |
| **Scaffold Lovable**                | Formalizada estratégia: apenas PRD-001 e PRD-003 vão ao Lovable; demais (002, 004, 005, 006, 007) ficam para Claude Code CLI   |

Todas as decisões estruturais anteriores (Provider Pattern, multi-loja, RBAC, equipes dormentes, WhatsApp dual provider, etc.) **permanecem inalteradas**.

---

## 1. Propósito deste documento

Este briefing é o resultado de uma sessão de planejamento estratégico que desenhou a arquitetura completa do projeto GALLO BASE DIESEL. Ele consolida:

- O modelo conceitual completo da plataforma
- As decisões arquiteturais transversais
- O índice dos 50 PRDs com profundidade, status e dependências
- A ordem e o ritmo recomendados para escrita
- As convenções de estilo a seguir
- A identidade visual GALLO consolidada e o sistema de temas

**Como usar:** abra uma sessão no claude.ai, anexe este documento como contexto inicial, e use o prompt sugerido em §7.2 para iniciar a escrita do primeiro lote. O Claude da próxima sessão terá tudo o que precisa para produzir os PRDs com consistência total, sem necessidade de revisitar decisões.

---

## 2. Resumo executivo do projeto

**Cliente:** **GALLO BASE DIESEL** — antiga Turbo Diesel, em processo de rebranding completo (registrável, escalável, proprietário). Distribuidora de peças pesadas em Frederico Westphalen/RS, atendendo marcas Volvo, Scania, Mercedes-Benz, Ford Cargo, Iveco. Vendas atuais concentradas no WhatsApp Business com 4 vendedores; operação espalhada em planilhas; e-commerce em descontinuidade.

**Arquitetura de marca (guarda-chuva):**

- **GALLO BASE DIESEL** — marca-mãe institucional
- **GALLO PARTS** — peças, reposição, continuidade operacional (verde)
- **GALLO SERVICE** — manutenção, diagnóstico, agilidade (vermelho)
- **GALLO INDUSTRIAL** — capacidade técnica, ambiente industrial (amarelo)

A plataforma SaaS construída nesta fase atende o **núcleo PARTS** — o MVP é uma plataforma de operação e inteligência comercial para a distribuição de peças. SERVICE e INDUSTRIAL aparecem **modeladas no domínio** (campo `division` em entidades comerciais) mas **dormentes no MVP** — quando a empresa abrir essas frentes na plataforma no futuro, não haverá retrabalho.

**Plataforma a construir:** sistema unificado de operação e inteligência comercial que se posiciona **acima do ERP DINTEC** (fonte fiscal e de estoque), sem substituí-lo. A plataforma é o **cérebro comercial e relacional**; o ERP permanece como retaguarda fiscal.

**Quatro módulos interconectados:**

1. **Central de Atendimento e CRM** — WhatsApp multi-atendente, ficha unificada do cliente, pipeline de leads
2. **Agente SDR com IA** — atendimento 24/7, identificação de peças, qualificação de leads
3. **Plataforma de Gestão Unificada** — BI, metas, gamificação, positivação, comissões, DRE
4. **E-commerce próprio** — vitrine integrada à plataforma

**Modelo comercial:** três ondas sequenciais conforme Proposta Comercial v2 — Onda 1 (Central + SDR), Onda 2 (Gestão), Onda 3 (E-commerce). Propriedade integral transferida ao cliente a cada onda paga.

**Estratégia de desenvolvimento:** Frontend First.

- **Fase 1 (esta):** mockup navegável com dados fictícios, drop-in replacement pattern preparado
- **Fase 2 (pós-validação):** backend real (Supabase) e integrações externas

**Stack tecnológica:** React + Vite + TypeScript + Tailwind + shadcn/ui + Supabase + Vercel + n8n + LangChain. Iconify para ícones. Light + Dark obrigatórios em todos os 4 temas.

**Metodologia documental:** AILA GuiaPRD v1.4 — templates feature/bugfix/integration; numeração PRD-NNN; SemVer + Keep a Changelog; sufixo `_DONE` após implementação.

**Identidade visual GALLO:** preto técnico institucional `#404041` + dourado `#D2A809` da "cromia óleo diesel" como cor de ação no tema padrão; cores das submarcas (verde/vermelho/amarelo) disponíveis como temas alternativos e como chips/badges de categorização. Tipografia: Saira Condensed (display, geometria condensada similar à GALLO BD) + Inter (UI) + JetBrains Mono (códigos OEM). Detalhamento completo na Seção 3.7 e Apêndice 8.3.

---

## 3. Decisões arquiteturais consolidadas

### 3.1 Fundamentos transversais

| Decisão                                         | Implicação                                                                                                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend First com mocks isolados**           | Camada `src/mocks/` espelha exatamente a interface futura do Supabase                                                                                                |
| **Provider Pattern parametrizável**             | Padrão arquitetural recorrente: Mock/Supabase, Meta/Evolution, etc. — todos via switch de configuração                                                               |
| **Drop-in replacement Mock → Supabase**         | Switch via env var `VITE_DATA_SOURCE=mock\|supabase` — sem refatoração no codebase                                                                                   |
| **Multi-loja modelada desde já**                | `IStore` é entidade de primeira classe; toda outra entidade carrega `storeId`; nos mocks da Fase 1 apenas a matriz é gerada                                          |
| **Equipes modeladas mas dormentes**             | `ITeam` existe no modelo; hierarquia de metas opera só nos níveis `loja` e `individual` até equipes serem ativadas                                                   |
| **Vendedor externo modelado, não implementado** | `ISeller.type: 'internal' \| 'external' \| 'representative'` + campos opcionais reservados; Bloco 6 traz apenas esqueleto de UI                                      |
| **RBAC com auditoria visual no MVP**            | Modelo conceitual completo; tela "Log de Auditoria" com dados mockados estáticos; persistência real só na Fase 2                                                     |
| **Carteira 1:1 estrita**                        | Cliente tem um vendedor responsável, mas com **sistema completo de transferências** (temporária, permanente individual, permanente em lote, com reversão automática) |
| **Divisões modeladas, MVP foca PARTS**          | Campo `division` em entidades comerciais; default `parts` no MVP; SERVICE e INDUSTRIAL ficam dormentes mas sem retrabalho futuro                                     |

### 3.2 WhatsApp dual provider

- Padrão Provider Pattern: `IWhatsAppProvider` com implementações `MetaCloudProvider` e `EvolutionProvider`
- Granularidade **por conta/número**: entidade `IWhatsAppAccount` com `provider`, credenciais ofuscadas, número, loja vinculada
- **Múltiplos números simultâneos** suportados desde o modelo
- UI adaptativa por capabilities: funcionalidades exclusivas de cada provider (templates HSM no Meta, mensagens proativas livres no Evolution) habilitam/desabilitam conforme o provider ativo
- Na Fase 1: badge discreto no `IMessage` indica origem; PRD-019 tem seção dedicada "Configurações de WhatsApp"
- Na Fase 2: três PRDs distintos — PRD-100 (abstração), PRD-101 (Meta), PRD-102 (Evolution)

### 3.3 CRM Operacional — características distintivas

- **Não é CRM de pipeline complexo nem CRM de marketing** — é CRM operacional de relacionamento + pipeline leve para leads novos
- **Ficha unificada** costura conversas, pedidos, veículos, notas, tags, recomendações
- **Veículos como entidade de primeira classe** — habilita histórico do veículo e recomendações proativas
- **Pipeline leve enriquecido**: estágios (Novo → Em qualificação → Orçamento enviado → Em negociação → Convertido/Perdido), temperatura (frio/morno/quente), origem, motivo de perda taxonomizado, próxima ação prevista, valor estimado
- **Tags**: livres + sugestões pré-definidas; novas tags criadas pelo vendedor precisam ser **promovidas pelo gestor** para entrar no catálogo oficial
- **Status do ciclo de vida** (`ativo` / `dormente` / `recuperação` / `perdido`): limiares fixos no mockup (90 dias para dormente), parametrizáveis em produção via PRD-019
- **Cadastro de veículos**: configurável por vendedor (modos `automático` / `aprovação` / `manual`) via PRD-019
- **Notas internas**: compartilhadas com autor visível (transparência + apoio em transferências)
- **Histórico de lead preservado após conversão** com badge "histórico pré-conversão"
- **Recomendações proativas** no MVP (esqueleto visual): cliente dormente, próxima manutenção previsível, cliente recorrente sem compra esperada

### 3.4 Sistema de Metas e Gestão

- Hierarquia: **loja + individual** no MVP (equipe dormente)
- Métricas configuráveis: faturamento, margem, ticket médio, número de pedidos, positivação, recuperação, conversão
- **Gamificação**: pontos, badges/conquistas, ranking, streaks — tudo com regras configuráveis pelo gestor
- **Positivação** (conceito comercial B2B): classificação de carteira em ativos, inativos, novos, inativos recentes, inativos antigos — com drill-down por categoria
- **Curva ABC** de clientes por faturamento
- **Carteira analítica** com visualizações segmentadas e detalhamento

### 3.5 Comercial Operacional

- **Orçamento/Pedido como módulo dedicado** — complementa o orçamento gerado pelo SDR (PRD-022); vendedor humano cria orçamento fora de uma conversa, com busca de produtos, regras de desconto, condição de pagamento, validade, conversão em pedido
- **API com ERP de terceiros** prevista (Fase 2, PRDs 100+) — não apenas DINTEC
- **Frete e transportadoras** com esqueleto na Fase 1, integração real na Fase 2
- Entidades comerciais (`IPart`, `IQuote`, `IOrder`) carregam `division` — no MVP sempre `parts`

### 3.6 Plataformas auxiliares (esqueletos fora do MVP)

- **PWA Vendedor Externo / Representante** — esqueleto mobile-first
- **Portal do Cliente** — parâmetros granulares por cliente na ficha (PRD-012) + esqueleto das telas do portal (PRD-071)
- **Integração E-commerce ↔ Central** — formalizada como PRD próprio (PRD-067) para garantir costura lead/ficha/pedido entre os módulos

### 3.7 Identidade visual GALLO e sistema de temas

**Marca-mãe (institucional):**

- Logo principal em duas orientações (vertical e horizontal) + variante alternativa estilizada
- Marca social: versão dourada (cromia óleo diesel) sobre fundo escuro — referência visual da paleta de ação
- Marca social 3D: aplicação rica de destaque
- Tom de marca: força, robustez, confiabilidade, presença, profissionalismo técnico

**Paleta institucional da marca-mãe (monocromática):**

| Token               | Valor     | Uso                                        |
| ------------------- | --------- | ------------------------------------------ |
| `--brand-black-100` | `#231F20` | Preto absoluto                             |
| `--brand-black-90`  | `#404041` | **Preto técnico — cor principal da marca** |
| `--brand-gray-30`   | `#BBBDC0` | Cinza estrutural                           |

**Paleta "cromia óleo diesel" (cores de ação e destaque):**

| Token             | Valor     | Uso                                            |
| ----------------- | --------- | ---------------------------------------------- |
| `--diesel-light`  | `#E7D26E` | Dourado claro — gradientes, brilhos            |
| `--diesel-medium` | `#D2A809` | **Dourado médio — cor de ação do tema Diesel** |
| `--diesel-dark`   | `#513110` | Marrom escuro — gradientes profundos           |

**Paleta das submarcas (cores de tema + chips/badges):**

| Submarca             | Token                | Valor     | Inspiração                 |
| -------------------- | -------------------- | --------- | -------------------------- |
| **GALLO PARTS**      | `--brand-parts`      | `#337648` | Verde da bandeira do RS    |
| **GALLO SERVICE**    | `--brand-service`    | `#C4151C` | Vermelho da bandeira do RS |
| **GALLO INDUSTRIAL** | `--brand-industrial` | `#C79C2C` | Amarelo da bandeira do RS  |

**Sistema de 4 temas × 2 modos = 8 combinações:**

Modelagem em **duas dimensões CSS independentes** (`data-theme` e `data-mode`). Todos os temas mantêm a base monocromática da marca-mãe; apenas a **cor de acento** (CTAs, links, focus, badges destacados) muda entre temas.

| Tema                 | Codinome (UI)               | Cor de acento            | Hex       |
| -------------------- | --------------------------- | ------------------------ | --------- |
| **Diesel** (default) | `GALLO Diesel · Black Gold` | Dourado da cromia diesel | `#D2A809` |
| **Parts**            | `GALLO Parts · Forest`      | Verde PARTS              | `#337648` |
| **Service**          | `GALLO Service · Crimson`   | Vermelho SERVICE         | `#C4151C` |
| **Industrial**       | `GALLO Industrial · Amber`  | Amarelo INDUSTRIAL       | `#C79C2C` |

**Modos:**

- `dark` (padrão para novo usuário)
- `light`
- Paridade visual completa em ambos — sem favoritismo

**Disponibilidade dos temas:** todos os 4 temas estão disponíveis para qualquer usuário em qualquer módulo. É preferência pessoal (igual ao modo light/dark), persistida em `localStorage` chave `gallo-theme` e `gallo-mode`. Default novo usuário: **Diesel + Dark**.

**Codinomes na UI:** o seletor de tema mostra os nomes completos (`GALLO Diesel · Black Gold` etc.), dando identidade ao sistema.

**Cores semânticas (UI funcional, independentes da marca):**

Para evitar ambiguidade entre "vermelho de erro" e "vermelho SERVICE", as cores semânticas funcionais são definidas independentemente das submarcas — detalhamento no PRD-001.

| Token             | Uso                                               |
| ----------------- | ------------------------------------------------- |
| `--color-success` | Sucesso, confirmação                              |
| `--color-warning` | Atenção, ações reversíveis                        |
| `--color-danger`  | Erro, ações destrutivas (tom distinto do SERVICE) |
| `--color-info`    | Informação neutra                                 |

**Tipografia GALLO (para a plataforma):**

| Token            | Fonte               | Uso                                                                    |
| ---------------- | ------------------- | ---------------------------------------------------------------------- |
| `--font-display` | **Saira Condensed** | Títulos, headers, identidade industrial (próxima do espírito GALLO BD) |
| `--font-body`    | **Inter**           | Body, UI, formulários, tabelas — legibilidade em uso intenso           |
| `--font-mono`    | **JetBrains Mono**  | Códigos OEM, SKUs, dados técnicos                                      |

> **Nota:** A fonte proprietária **GALLO BD** (criada pela Etc Creative Brand) é exclusiva da identidade da marca e aparece apenas na logo institucional (SVG). Não é usada na UI da plataforma.

### 3.8 Estratégia de scaffold no Lovable

A estrutura inicial do projeto é criada no **Lovable** (plataforma de prototipagem rápida), e em seguida o repositório é clonado localmente para continuidade do desenvolvimento via **Claude Code CLI**.

**Distribuição dos PRDs do Bloco 0:**

| PRD                             | Onde implementar   | Justificativa                                                                    |
| ------------------------------- | ------------------ | -------------------------------------------------------------------------------- |
| **PRD-001** — Design System     | 🟢 **Lovable**     | Visual puro: tokens, temas, componentes shadcn, Iconify, página `/design-system` |
| **PRD-003** — Shell e Navegação | 🟢 **Lovable**     | Rotas, sidebar, top bar, layouts, auth mockada, separação `/app` × `/loja`       |
| PRD-002 — Modelo Conceitual     | 🔵 Claude Code CLI | TypeScript puro: interfaces, glossário                                           |
| PRD-004 — Mocks e Geradores     | 🔵 Claude Code CLI | Lógica de geração determinística                                                 |
| PRD-005 — Provider Pattern      | 🔵 Claude Code CLI | Arquitetura de abstração                                                         |
| PRD-006 — RBAC Visual           | 🔵 Claude Code CLI | Modelo + tela de auditoria estática                                              |
| PRD-007 — Multi-Loja            | 🔵 Claude Code CLI | Modelagem + adaptação de seletores                                               |

**Fluxo de execução:**

1. PRDs 001 e 003 escritos primeiro
2. Lovable consome esses dois PRDs (possivelmente sintetizados num prompt único) e gera scaffold visual navegável
3. Repositório clonado localmente
4. Claude Code CLI implementa PRDs 002, 004, 005, 006, 007 sobre o scaffold
5. Sequência segue para os demais blocos (010+) sempre via Claude Code CLI

---

## 4. Modelo conceitual completo

Todas as entidades a serem modeladas no `PRD-002 (Modelo Conceitual)` e geradas nos mocks pelo `PRD-004 (Geradores de Dados)`. Campos opcionais marcados com `?`.

> **Tipo Division:** `type Division = 'parts' | 'service' | 'industrial'` — usado em entidades comerciais; default `parts` no MVP.

### 4.1 Plataforma e organização

```typescript
IStore {
  id, name, type: 'matriz' | 'filial' | 'parceira',
  address, cnpj, settings: IPlatformSettings, createdAt,
  activeDivisions: Division[]  // no MVP: ['parts']
}

ITeam {  // DORMENTE no MVP
  id, name, storeId, managerId, sellerIds[], createdAt
}

IPlatformSettings {
  storeId,
  lifecycleThresholds: { dormantDays, lostDays, ... },
  vehicleCadastroMode: 'auto' | 'approval' | 'manual',  // default; pode ser sobrescrito por vendedor
  tagSuggestions: string[],
  pipelineStages: ILeadStage[],
  lossReasons: string[],
  gamificationRules: {...},
  whatsappAccounts: IWhatsAppAccount[],
  defaultDivision: Division,  // default 'parts'
  ...
}
```

### 4.2 Pessoas e permissões

```typescript
ISeller {
  id, name, email, phone, avatar,
  type: 'internal' | 'external' | 'representative',
  storeId,  // loja primária
  teamId?,  // dormente
  vehicleCadastroMode?: 'auto' | 'approval' | 'manual',  // sobrescreve default da loja
  availability: 'online' | 'ausente' | 'ocupado' | 'offline',
  specialties: string[],  // ex: 'Scania', 'Volvo'
  divisions: Division[],  // quais divisões este vendedor opera; no MVP: ['parts']
  region?, commissionTier?, parentSellerId?, commissionRule?,  // reservados p/ externos
  themePreference?: { mode: 'light' | 'dark', theme: 'diesel' | 'parts' | 'service' | 'industrial' },
  createdAt
}

IRole {
  id, name,  // Owner, Gestor, Vendedor, SDR, Cliente, Vendedor Externo, Financeiro
  permissions: IPermission[]
}

IPermission {
  resource,  // ex: 'customer', 'order', 'commission'
  actions: ('view' | 'create' | 'edit' | 'delete' | 'approve')[],
  scope: 'own' | 'team' | 'store' | 'all'
}

IAuditLog {
  id, actorId, action, resource, resourceId,
  before?, after?, timestamp, storeId
}
```

### 4.3 Cliente, lead e relacionamento

```typescript
ICustomer {
  id, type: 'B2B' | 'B2C',
  // B2B
  cnpj?, razaoSocial?, nomeFantasia?, contactName?,
  // B2C
  cpf?, fullName?,
  // comum
  phone, email?, address,
  storeId, sellerId,  // dono da carteira
  status: 'ativo' | 'dormente' | 'recuperacao' | 'perdido',
  tags: string[],
  notes: ICustomerNote[],
  vehicleIds: string[],
  portalSettings?: IPortalSettings,
  firstPurchaseAt?, lastPurchaseAt?,
  ticketMedio, ltv, recencia,
  convertedFromLeadId?,  // se veio de um lead
  createdAt
}

ICustomerNote {
  id, customerId, authorId, content, createdAt  // sempre compartilhada
}

IVehicle {
  id, customerId,
  brand,  // Volvo, Scania, Mercedes, Ford, Iveco
  model,  // R450, FH540, Actros, Cargo 2422
  year, engine,  // DC13, OM457, MX13
  plate?, vin?, currentKm?,
  serviceHistory: IVehicleServiceEntry[],
  createdAt, cadastroStatus: 'aprovado' | 'pendente' | 'rejeitado'
}

IVehicleServiceEntry {
  vehicleId, orderId?, parts: string[], date, km?
}

ILead {
  id, name, phone, email?,
  stage: ILeadStage,
  temperature: 'frio' | 'morno' | 'quente',
  origin: 'whatsapp' | 'ecommerce' | 'indicacao' | 'google' | 'outro',
  storeId, sellerId,
  nextActionAt?, estimatedValue?,
  lossReason?, lossNotes?,
  convertedToCustomerId?,
  conversations: string[],  // histórico preservado
  createdAt, lastInteractionAt
}

ILeadStage {
  id, name,  // 'Novo', 'Em qualificação', 'Orçamento enviado', ...
  order, color
}

ICustomerSegment {  // filtros salvos
  id, name, ownerId, scope: 'private' | 'shared',
  filters: {...}, createdAt
}

ICarteiraTransfer {
  id, type: 'temporary' | 'permanent_individual' | 'permanent_batch',
  fromSellerId, toSellerId,
  customerIds: string[],
  reason, startDate, endDate?,  // endDate só em temporary
  autoRevertAt?, status: 'active' | 'reverted' | 'expired',
  executedBy, executedAt
}

IRecommendation {
  id, customerId, type:
    'dormant' | 'predictable_maintenance' | 'expected_purchase_missing' |
    'birthday' | 'cross_sell' | 'up_sell' | 'fleet_sync' | 'churn_risk' |
    'recurring_stock_alert' | 'campaign_suggestion',
  message, priority, vehicleId?, productIds?, createdAt
}

IPortalSettings {  // parâmetros granulares por cliente
  enabled,
  canViewOrderHistory, canCreateQuote, canApproveQuote,
  canSeePriceTable, canDownloadNF, canSeeCreditLimit
}
```

### 4.4 Conversa e canal

```typescript
IConversation {
  id, customerId?, leadId?,
  channel: 'whatsapp' | 'ecommerce' | 'phone' | 'site',
  whatsappAccountId?,  // qual número/conta atendeu
  assignedSellerId,
  status: 'aguardando' | 'em_andamento' | 'aguardando_cliente' | 'resolvida' | 'arquivada',
  isSdrActive: boolean,
  storeId, createdAt, lastMessageAt
}

IMessage {
  id, conversationId,
  direction: 'in' | 'out',
  authorType: 'customer' | 'seller' | 'sdr' | 'system',
  authorId?, content, mediaType?, mediaUrl?,
  provider: 'meta' | 'evolution' | 'mock',
  status: 'sent' | 'delivered' | 'read' | 'failed',
  timestamp
}

IWhatsAppAccount {
  id, storeId,
  provider: 'meta' | 'evolution',
  number, displayName,
  credentialsRef,  // referência ofuscada
  status: 'connected' | 'disconnected' | 'pending',
  capabilities: {...},  // o que esse provider suporta
  createdAt
}
```

### 4.5 Catálogo de produtos

```typescript
IPart {  // = IProduct na visão comercial
  id, sku, name, description,
  category, subcategory,
  oemCodes: string[],  // múltiplos OEMs originais
  equivalentPartIds: string[],
  applications: IApplication[],
  brand, supplier,
  unitCost, unitPrice, marginPercent,
  stockAvailable, stockMinimum,
  images: string[],
  division: Division,  // default 'parts' no MVP
  createdAt
}

IApplication {
  vehicleBrand, vehicleModel, yearStart, yearEnd, engine?
}
```

### 4.6 Comercial

```typescript
IQuote {  // orçamento
  id, customerId, sellerId, storeId,
  items: IQuoteItem[],
  subtotal, discount, shipping, total,
  paymentCondition, validUntil,
  status: 'rascunho' | 'enviado' | 'aceito' | 'recusado' | 'expirado' | 'convertido',
  origin: 'sdr' | 'vendedor' | 'cliente_portal' | 'ecommerce',
  conversationId?, convertedOrderId?,
  division: Division,  // default 'parts'
  createdAt
}

IQuoteItem {
  partId, partName, quantity, unitPrice, discount, subtotal  // snapshots
}

IOrder {
  id, customerId, sellerId, storeId,
  quoteId?,  // se veio de orçamento
  items: IOrderItem[],
  subtotal, discount, shipping, total,
  paymentCondition, paymentStatus,
  fulfillmentStatus: 'pendente' | 'separacao' | 'expedido' | 'entregue' | 'cancelado',
  shippingTrackingCode?, shippingCarrier?,
  origin: 'whatsapp' | 'ecommerce' | 'portal' | 'pwa_externo' | 'manual',
  nfNumber?, nfDate?,  // virá do DINTEC na Fase 2
  division: Division,  // default 'parts'
  createdAt
}

IOrderItem {
  partId, partName, sku, quantity, unitPrice, unitCost,  // snapshots
  discount, subtotal, marginValue
}

ICommission {
  id, sellerId, orderId,
  baseValue, rate, value,
  period,  // mês de competência
  status: 'pendente' | 'aprovado' | 'pago' | 'contestado',
  createdAt
}
```

### 4.7 Metas, ranking, BI

```typescript
IGoal {
  id, level: 'store' | 'team' | 'individual',  // team dormente
  targetId,  // storeId | teamId | sellerId
  period: { type: 'daily' | 'monthly' | 'quarterly', start, end },
  metric: 'revenue' | 'margin' | 'tickets' | 'positivacao' | 'recovery' | 'conversion',
  targetValue, currentValue, progressPercent,
  division?: Division,  // opcional — meta pode ser por divisão
  createdBy, createdAt
}

IGamificationBadge {
  id, sellerId, badgeType, earnedAt, periodRef
}

IRanking {
  period, level, entries: { sellerId, score, position }[]
}

IPositivation {
  period, storeId,
  categories: {
    ativos: customerIds[],
    inativos: customerIds[],
    novos: customerIds[],
    inativos_recentes: customerIds[],  // 30-90 dias
    inativos_antigos: customerIds[]    // 90+ dias
  }
}

IABCClassification {
  customerId, period, class: 'A' | 'B' | 'C',
  revenueShare, cumulativeShare
}
```

---

## 5. Índice consolidado dos 50 PRDs

Legenda de profundidade: **D** = detalhado | **E** = esqueleto enxuto (estrutura + telas + modelo, sem detalhar todas as interações).

### Bloco 0 — Fundação (PRDs 001–007) — 7 PRDs

| #   | Título                                             | Profundidade | Depende de | Implementação  |
| --- | -------------------------------------------------- | ------------ | ---------- | -------------- |
| 001 | Identidade Visual GALLO e Design System Base       | D            | —          | 🟢 Lovable     |
| 002 | Modelo Conceitual de Domínio e Glossário           | D            | —          | 🔵 Claude Code |
| 003 | Shell do App, Navegação e Layouts Base             | D            | 001, 002   | 🟢 Lovable     |
| 004 | Geradores de Dados Fictícios e Camada de Mocks     | D            | 002        | 🔵 Claude Code |
| 005 | Arquitetura de Provedores de Dados (Mock/Supabase) | D            | 004        | 🔵 Claude Code |
| 006 | Sistema de Roles, Permissões e Auditoria (visual)  | D            | 002        | 🔵 Claude Code |
| 007 | Multi-Loja: Modelagem e Operação Cross-Store       | D            | 002, 003   | 🔵 Claude Code |

### Bloco 1 — Central de Atendimento e CRM (PRDs 010–019) — 10 PRDs

| #   | Título                                                                    | Profundidade | Depende de    |
| --- | ------------------------------------------------------------------------- | ------------ | ------------- |
| 010 | Inbox Unificado e Lista de Conversas                                      | D            | Bloco 0       |
| 011 | Conversa com Histórico Multicanal                                         | D            | 010           |
| 012 | Ficha Unificada do Cliente (com recomendações + veículos + portal params) | D            | 011, 016      |
| 013 | Regras de Distribuição e Roteamento                                       | D            | 010           |
| 014 | Painel do Gestor — Métricas e Saúde da Carteira                           | D            | 010, 011, 013 |
| 015 | Lista Geral de Clientes (segmentações salvas, ações em lote)              | D            | 012           |
| 016 | Veículos do Cliente (entidade, ficha, cadastro configurável)              | D            | 012           |
| 017 | Pipeline de Leads (Kanban + Lista, temperatura, motivos)                  | D            | 010, 012      |
| 018 | Gestão de Carteira e Transferências (temp/perm/lote)                      | D            | 012, 015      |
| 019 | Configurações Administrativas (esqueleto navegável)                       | E            | 006, 007      |

### Bloco 2 — Agente SDR (PRDs 020–024) — 5 PRDs

| #   | Título                                               | Profundidade | Depende de    |
| --- | ---------------------------------------------------- | ------------ | ------------- |
| 020 | Simulação de Conversa SDR ↔ Cliente                  | D            | 011           |
| 021 | Identificação de Peça (OEM, descrição, equivalência) | D            | 020, catálogo |
| 022 | Geração de Orçamento via SDR                         | D            | 021, 031      |
| 023 | Escalonamento para Vendedor com Resumo de Contexto   | D            | 020, 011      |
| 024 | Painel de Configuração e Métricas do Agente          | D            | 020           |

### Bloco 3 — Comercial Operacional (PRDs 030–033) — 4 PRDs

| #   | Título                                           | Profundidade | Depende de |
| --- | ------------------------------------------------ | ------------ | ---------- |
| 030 | Catálogo de Produtos (visão comercial interna)   | D            | Bloco 0    |
| 031 | Orçamento (criação, edição, validade, conversão) | D            | 030, 012   |
| 032 | Pedido (gestão, status, ciclo de vida)           | D            | 031        |
| 033 | Cálculo de Frete e Esqueleto Transportadoras     | E            | 032        |

### Bloco 4 — Plataforma de Gestão e BI (PRDs 040–053) — 14 PRDs

| #   | Título                                                | Profundidade | Depende de |
| --- | ----------------------------------------------------- | ------------ | ---------- |
| 040 | Visão Executiva (Home do Gestor)                      | D            | 041–049    |
| 041 | Vendas (pipeline, vendedor, canal, categoria)         | D            | 032        |
| 042 | Sistema de Metas (loja + individual; equipe dormente) | D            | 041        |
| 043 | Ranking de Vendedores e Gamificação                   | D            | 042        |
| 044 | Positivação de Clientes (ativos/inativos/novos/etc.)  | D            | 012, 041   |
| 045 | Curva ABC de Clientes                                 | D            | 041        |
| 046 | Carteira Analítica com Drill-down                     | D            | 044, 045   |
| 047 | Comissões (cálculo, fechamento)                       | D            | 041, 042   |
| 048 | DRE Gerencial                                         | E            | 041        |
| 049 | Rentabilidade por SKU / Cliente / Canal               | E            | 041        |
| 050 | Despesas (esqueleto navegável)                        | E            | —          |
| 051 | Fluxo de Caixa (esqueleto navegável)                  | E            | —          |
| 052 | Estoque com Curadoria Comercial (esqueleto)           | E            | 030        |
| 053 | IA Analítica e Insights Proativos                     | D            | 040–049    |

### Bloco 5 — E-commerce (PRDs 060–067) — 8 PRDs

| #   | Título                                                | Profundidade | Depende de    |
| --- | ----------------------------------------------------- | ------------ | ------------- |
| 060 | Home e Vitrine                                        | D            | 001           |
| 061 | Busca Avançada (OEM, aplicação, equivalência)         | D            | 030           |
| 062 | Listagem de Categoria com Filtros                     | D            | 060           |
| 063 | Ficha de Produto                                      | D            | 030           |
| 064 | Carrinho e Checkout                                   | D            | 063           |
| 065 | Conta do Cliente (histórico, pedidos)                 | D            | 064, 012      |
| 066 | Painel Administrativo (esqueleto)                     | E            | 060–065       |
| 067 | Integração E-commerce ↔ Central (lead, ficha, pedido) | D            | 064, 012, 017 |

### Bloco 6 — Plataformas Auxiliares (esqueletos fora do MVP) (PRDs 070–071) — 2 PRDs

| #   | Título                                              | Profundidade | Depende de |
| --- | --------------------------------------------------- | ------------ | ---------- |
| 070 | PWA Vendedor Externo / Representante (esqueleto)    | E            | Bloco 0    |
| 071 | Portal do Cliente (esqueleto + parâmetros na ficha) | E            | 012        |

### Bloco 7 — Integrações Fase 2 (PRDs 100+) — não escrever agora

Roadmap futuro (Fase 2), documentar como linha de previsão:

- PRD-100 — Camada de Abstração WhatsApp (Provider Pattern)
- PRD-101 — Integração WhatsApp Cloud API (Meta)
- PRD-102 — Integração Evolution API
- PRD-110 — Integração DINTEC (leitura)
- PRD-111 — Integração DINTEC (escrita opcional)
- PRD-120 — Integração ERP de Terceiros (orçamento/pedido)
- PRD-130 — Integração Correios e Transportadoras
- PRD-140 — Gateway de Pagamento

---

## 6. Convenções de estilo de PRD

Seguir o **GuiaPRD v1.4** (arquivo `guia-prd.md` no projeto). Cada PRD deve conter, na ordem:

1. Cabeçalho com tabela "Informações Gerais" completa
2. Critérios de Complexidade utilizados
3. Contexto do Problema (2-3 parágrafos)
4. Conceito da Solução (As-Is, To-Be, Alternativas)
5. Escopo (Incluído + Excluído)
6. Requisitos Funcionais (RF-NNN, atômicos, verificáveis)
7. Requisitos Não-Funcionais
8. Critérios de Aceitação (formato Gherkin DADO/QUANDO/ENTÃO)
9. Fases de Implementação
10. Dependências (PRDs, libs, decisões pendentes)
11. Cadeia de PRDs (se for parte de épico)
12. Considerações de Segurança (quando aplicável)
13. Fluxos de Usuário
14. Convenções de Código (referência rápida — copiar do template)
15. **Notas para o Agente Desenvolvedor** (Seção 7 do GuiaPRD — obrigatória)
16. Status de Implementação (rodapé)
17. Histórico

**Diferenças por profundidade:**

| Aspecto                        | Detalhado (D)                | Esqueleto (E)                   |
| ------------------------------ | ---------------------------- | ------------------------------- |
| Contexto do problema           | 2-3 parágrafos               | 1 parágrafo                     |
| Requisitos funcionais          | Todos detalhados             | Apenas os principais            |
| Critérios de aceitação         | Múltiplos cenários           | 1-2 cenários-chave              |
| Fluxos de usuário              | Happy path + exceções + erro | Apenas happy path               |
| Fases de implementação         | 3-5 fases detalhadas         | 1-2 fases                       |
| Modelo conceitual referenciado | Sempre, completo             | Sempre, completo                |
| Notas para o agente            | Completas + específicas      | Completas (mantém obrigatórias) |

**Identidade visual a aplicar (atualizada GALLO):**

- **Marca-mãe**: preto técnico `#404041` como base institucional
- **Cor de ação primária (tema Diesel)**: dourado `#D2A809`
- **Cores das submarcas (chips/badges + temas alternativos)**: verde PARTS `#337648`, vermelho SERVICE `#C4151C`, amarelo INDUSTRIAL `#C79C2C`
- **Sistema de temas**: 4 temas × 2 modos (Diesel/Parts/Service/Industrial × light/dark)
- **Modo padrão**: dark
- **Tipografia**: Saira Condensed (display) + Inter (UI) + JetBrains Mono (mono)
- **Stack visual**: Tailwind + shadcn/ui + Iconify
- **Light + Dark obrigatórios em todos os 4 temas**

**Versionamento:** SemVer com codinomes em inglês para MINOR/MAJOR. Sequência sugerida para a v1.0 da plataforma: `Genesis` → `Hub` → `Pilot` → `Compass` → `Storefront` → `Heavy`.

---

## 7. Instruções de execução para a próxima sessão

### 7.1 Lotes recomendados

Escrever em **8 lotes** seguindo a ordem abaixo. Cada lote pode ser dividido em sub-lotes de 3-5 PRDs por turno de mensagem para preservar qualidade.

| Lote | Bloco                                             | PRDs              | Quant. | Estimativa de turnos |
| ---- | ------------------------------------------------- | ----------------- | ------ | -------------------- |
| 1    | Fundação                                          | 001–007           | 7      | 2-3 turnos           |
| 2    | CRM                                               | 010–019           | 10     | 3 turnos             |
| 3    | SDR                                               | 020–024           | 5      | 2 turnos             |
| 4    | Comercial Operacional                             | 030–033           | 4      | 1-2 turnos           |
| 5    | Gestão A (Metas/Ranking/Positivação/ABC/Carteira) | 042–046           | 5      | 2 turnos             |
| 6    | Gestão B (Executiva/Vendas/Comissões/Financeiros) | 040, 041, 047–053 | 9      | 3 turnos             |
| 7    | E-commerce                                        | 060–067           | 8      | 2-3 turnos           |
| 8    | Auxiliares                                        | 070, 071          | 2      | 1 turno              |

**Total estimado:** ~16-20 turnos de mensagem. Recomendado distribuir em 2-3 sessões diferentes para manter qualidade.

### 7.2 Prompt sugerido para abrir a próxima sessão

```
Olá Claude. Vou anexar o documento `briefing-execucao-prds.md` v1.1
como contexto. Ele consolida o desenho completo do projeto
GALLO BASE DIESEL e as decisões arquiteturais tomadas em sessões
anteriores de planejamento (incluindo o rebranding Turbo Diesel →
GALLO BASE DIESEL).

Quero que você escreva os PRDs seguindo a ordem do Lote 1
(Fundação — PRDs 001 a 007), respeitando:

- A profundidade indicada por PRD (D ou E)
- O modelo conceitual completo da Seção 4 do briefing
- As convenções de estilo da Seção 6 (GuiaPRD v1.4)
- As decisões arquiteturais consolidadas da Seção 3
- A identidade visual GALLO da Seção 3.7
- A estratégia de scaffold Lovable da Seção 3.8

Comece pelo PRD-001 (Identidade Visual GALLO e Design System Base).
Após cada PRD, apresente o arquivo pronto e aguarde minha
confirmação antes de seguir para o próximo. Se tiver dúvidas
de escopo, pergunte antes de escrever.

Eu sou o Arquiteto. Você está executando o papel do GuiaPRD
de "Agente Arquiteto" produzindo PRDs para o Agente
Desenvolvedor (Claude Code CLI / Lovable) implementar depois.
```

### 7.3 Checklist antes de iniciar cada lote

- [ ] Releitura rápida da Seção 3 (decisões arquiteturais)
- [ ] Releitura da Seção 4 (modelo conceitual) — atenção a entidades referenciadas no bloco
- [ ] Verificar dependências do bloco no índice
- [ ] Confirmar profundidade alvo (D vs E)
- [ ] Aplicar convenções da Seção 6 (incluindo identidade GALLO)

### 7.4 Critérios de pronto de cada PRD

- [ ] Cabeçalho completo com Informações Gerais
- [ ] Todas as seções obrigatórias do GuiaPRD v1.4
- [ ] Notas para o Agente Desenvolvedor (Seção 7 do GuiaPRD) presentes e completas
- [ ] Status de Implementação como `⏳ PENDENTE` no rodapé
- [ ] Referências cruzadas a outros PRDs sempre por número (PRD-NNN)
- [ ] Modelo conceitual respeitado (sem inventar entidades novas que não estão na Seção 4 deste briefing)
- [ ] Identidade visual GALLO respeitada (nome, paleta, tipografia, temas)

---

## 8. Apêndices

### 8.1 Glossário rápido do domínio (referência durante escrita)

| Termo                | Significado curto                                                                  |
| -------------------- | ---------------------------------------------------------------------------------- |
| OEM                  | Código original do fabricante (Volvo, Scania, etc.)                                |
| SKU                  | Código interno da GALLO BASE DIESEL                                                |
| Aplicação            | Compatibilidade peça ↔ veículo (marca/modelo/ano/motor)                            |
| Equivalência         | Peças intercambiáveis de marcas diferentes                                         |
| Carteira             | Conjunto de clientes de um vendedor                                                |
| Positivação          | Clientes únicos atendidos no período (conceito B2B)                                |
| Curva ABC            | Classificação de clientes por participação no faturamento                          |
| Ficha                | Visão consolidada de um cliente                                                    |
| Inbox                | Lista de conversas ativas                                                          |
| SDR                  | Sales Development Representative — aqui o **agente de IA**                         |
| Provider             | Implementação concreta de um padrão (Mock, Supabase, Meta, Evolution)              |
| Cliente dormente     | Sem compra há mais de 90 dias (parametrizável)                                     |
| Cliente perdido      | Sem compra há mais tempo + sinal explícito                                         |
| Pipeline leve        | Funil de leads (Novo → Qualificação → Orçamento → Negociação → Convertido/Perdido) |
| **Division**         | Submarca/divisão de atuação (parts / service / industrial); no MVP sempre `parts`  |
| **Submarca**         | Marca-filha da arquitetura GALLO: PARTS, SERVICE ou INDUSTRIAL                     |
| **Tema**             | Variação cromática da UI: Diesel (default), Parts, Service, Industrial             |
| **Modo**             | Light ou Dark — dimensão independente do tema                                      |
| **Codinome de tema** | Nome amigável exibido na UI (ex: "Black Gold", "Forest", "Crimson", "Amber")       |

### 8.2 Mapa de dependências entre blocos

```
BLOCO 0 (Fundação)
   │
   ├──► BLOCO 1 (CRM)
   │      │
   │      ├──► BLOCO 2 (SDR) — usa Conversa, Ficha
   │      ├──► BLOCO 3 (Comercial) — usa Cliente, Carteira
   │      └──► BLOCO 5 (E-commerce) — usa Ficha p/ integração
   │
   ├──► BLOCO 3 (Comercial) — independente do CRM em parte
   │
   └──► BLOCO 4 (Gestão) — consome Bloco 1, 3

BLOCO 5 (E-commerce) ◄──► BLOCO 1 (CRM) via PRD-067
BLOCO 6 (Auxiliares) — esqueletos fora do MVP
```

### 8.3 Identidade visual GALLO — referência completa

**Paleta institucional (marca-mãe):**

| Token               | Hex       | RGB           | Uso                               |
| ------------------- | --------- | ------------- | --------------------------------- |
| `--brand-black-100` | `#231F20` | 35, 31, 32    | Preto absoluto                    |
| `--brand-black-90`  | `#404041` | 64, 64, 65    | **Preto técnico — cor principal** |
| `--brand-gray-30`   | `#BBBDC0` | 187, 189, 192 | Cinza estrutural                  |

**Paleta "cromia óleo diesel":**

| Token             | Hex       | Uso                                         |
| ----------------- | --------- | ------------------------------------------- |
| `--diesel-light`  | `#E7D26E` | Dourado claro                               |
| `--diesel-medium` | `#D2A809` | **Dourado médio — cor de ação tema Diesel** |
| `--diesel-dark`   | `#513110` | Marrom escuro                               |

**Paleta das submarcas (temas + chips):**

| Submarca         | Token                | Hex       | Uso                                                    |
| ---------------- | -------------------- | --------- | ------------------------------------------------------ |
| GALLO PARTS      | `--brand-parts`      | `#337648` | Cor de ação tema Parts; chip categoria peças           |
| GALLO SERVICE    | `--brand-service`    | `#C4151C` | Cor de ação tema Service; chip categoria serviço       |
| GALLO INDUSTRIAL | `--brand-industrial` | `#C79C2C` | Cor de ação tema Industrial; chip categoria industrial |

**Tipografia:**

| Token            | Fonte           | Provedor     | Uso                   |
| ---------------- | --------------- | ------------ | --------------------- |
| `--font-display` | Saira Condensed | Google Fonts | Títulos, hierarquia   |
| `--font-body`    | Inter           | Google Fonts | UI, body, formulários |
| `--font-mono`    | JetBrains Mono  | Google Fonts | Códigos OEM, SKUs     |

> **GALLO BD** — fonte proprietária; uso restrito à logo (não entra na UI).

**Ícones:** Iconify (`@iconify/react`) com sets `mdi:`, `lucide:`, `phosphor:` — carregamento sob demanda.

### 8.4 Sistema de temas — referência técnica

**Modelagem em duas dimensões CSS independentes:**

```html
<html data-mode="dark" data-theme="diesel"></html>
```

**Modos:**

| Valor   | Default | Descrição                       |
| ------- | ------- | ------------------------------- |
| `dark`  | ✅      | Modo padrão para novos usuários |
| `light` | —       | Modo claro alternativo          |

**Temas (cada um com codinome UI):**

| Valor              | Codinome UI               | Cor de acento |
| ------------------ | ------------------------- | ------------- |
| `diesel` (default) | GALLO Diesel · Black Gold | `#D2A809`     |
| `parts`            | GALLO Parts · Forest      | `#337648`     |
| `service`          | GALLO Service · Crimson   | `#C4151C`     |
| `industrial`       | GALLO Industrial · Amber  | `#C79C2C`     |

**Combinações totais:** 8 (4 temas × 2 modos).
**Default novo usuário:** `dark + diesel` (GALLO Diesel · Black Gold no modo escuro).
**Persistência:** `localStorage` chaves `gallo-mode` e `gallo-theme`.
**Acessibilidade:** todas as 8 combinações devem validar contraste WCAG 2.1 AA — responsabilidade do PRD-001.
**Disponibilidade:** todos os temas estão disponíveis para qualquer usuário, em qualquer módulo. É preferência pessoal.

### 8.5 Estratégia de scaffold no Lovable

**PRDs Lovable-friendly (gerados primeiro, consumidos pelo Lovable):**

1. **PRD-001** — Identidade Visual GALLO e Design System Base
2. **PRD-003** — Shell do App, Navegação e Layouts Base

Após a escrita destes dois, será gerado um **prompt sintético consolidado** combinando o essencial dos dois PRDs (eventualmente em passo separado) para alimentar o Lovable.

**PRDs Claude Code CLI (sobre o scaffold gerado):**

- PRD-002 — Modelo Conceitual de Domínio e Glossário
- PRD-004 — Geradores de Dados Fictícios e Camada de Mocks
- PRD-005 — Arquitetura de Provedores de Dados
- PRD-006 — Sistema de Roles, Permissões e Auditoria
- PRD-007 — Multi-Loja
- Demais PRDs (010+) — todos via Claude Code CLI

**Fluxo:**

```
[PRD-001 + PRD-003] → Lovable → scaffold visual navegável
                                        ↓
                                  Clone local
                                        ↓
[PRD-002, 004, 005, 006, 007] → Claude Code CLI → infraestrutura
                                        ↓
                              [Demais blocos 010+]
```

### 8.6 Estrutura de pastas alvo

```
src/
├── features/
│   ├── auth/
│   ├── customers/         (PRDs 012, 015)
│   ├── vehicles/          (PRD-016)
│   ├── leads/             (PRD-017)
│   ├── conversations/     (PRDs 010, 011)
│   ├── distribution/      (PRDs 013, 018)
│   ├── sdr/               (Bloco 2)
│   ├── quotes/            (PRD-031)
│   ├── orders/            (PRD-032)
│   ├── catalog/           (PRD-030)
│   ├── goals/             (PRD-042)
│   ├── gamification/      (PRD-043)
│   ├── positivation/      (PRD-044)
│   ├── abc/               (PRD-045)
│   ├── reports/           (Bloco 4 financeiro)
│   ├── ecommerce/         (Bloco 5)
│   ├── admin/             (PRD-019, 066)
│   └── portal-cliente/    (PRD-071)
├── shared/
│   ├── components/
│   ├── hooks/
│   ├── utils/
│   └── types/
├── mocks/                 (PRD-004)
│   ├── data/
│   ├── generators/
│   ├── store/
│   ├── api/
│   └── index.ts
├── providers/             (PRD-005)
│   ├── data/
│   └── whatsapp/
├── styles/                (PRD-001)
│   ├── tokens.css         (primitivos)
│   ├── themes.css         (4 temas × 2 modos)
│   └── globals.css
├── lib/
│   └── supabase.ts        (Fase 2)
└── config/
    └── constants.ts
```

---

## 9. Encerramento

Este briefing v1.1 fecha a fase de planejamento da plataforma **GALLO BASE DIESEL**. Todas as decisões necessárias para escrever os 50 PRDs estão consolidadas neste documento, incluindo o rebranding completo, o sistema de 4 temas, a tipografia oficial e a estratégia de scaffold no Lovable.

**Próximo passo:** iniciar a escrita do PRD-001 (Identidade Visual GALLO e Design System Base) seguindo o prompt da Seção 7.2.

**Tempo estimado de escrita dos 50 PRDs:** 2-3 sessões de trabalho focado, distribuídas conforme conveniência.

**Tempo estimado de implementação da Fase 1 (mockup):** ver cronograma macro da Proposta Comercial v2 — Onda 1 em 75 dias.

Bom trabalho. 🛠️

---

## Histórico de versões

| Versão  | Data          | Mudanças                                                                                                                                                                                                                     |
| ------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | Maio/2026     | Versão inicial consolidando o desenho da plataforma                                                                                                                                                                          |
| **1.1** | **Maio/2026** | **Rebranding Turbo Diesel → GALLO BASE DIESEL. Nova identidade visual (paleta + tipografia). Sistema de 4 temas × 2 modos. Dark padrão. Campo `division` no modelo conceitual. Estratégia de scaffold Lovable formalizada.** |

---

**AILA — Sistemas Inteligentes**
_Frederico Westphalen / RS — Brasil_
