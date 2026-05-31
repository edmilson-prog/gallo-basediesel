# PRD-002: Modelo Conceitual de Domínio e Glossário

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                          |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                               |
| **Objetivo**          | Consolidar todas as entidades de domínio da plataforma em TypeScript, estabelecer o glossário oficial do mercado de peças pesadas, e definir as convenções de tipagem que todos os PRDs subsequentes vão consumir |
| **Tipo**              | Feature                                                                                                                                                                                                           |
| **Complexidade**      | Alta                                                                                                                                                                                                              |
| **Total de Fases**    | 4                                                                                                                                                                                                                 |
| **Prioridade**        | Alta                                                                                                                                                                                                              |
| **Épico**             | Bloco 0 — Fundação                                                                                                                                                                                                |
| **PRDs Relacionados** | PRD-001 (Design System), PRD-003 (Shell), PRD-004 (Mocks), PRD-005 (Provider Pattern), PRD-006 (RBAC), PRD-007 (Multi-Loja)                                                                                       |
| **Implementação**     | 🔵 Claude Code CLI (sobre o scaffold do Lovable)                                                                                                                                                                  |
| **Padrão de código**  | PascalCase com prefixo `I` para interfaces; PascalCase sem prefixo para union types; arquivos em kebab-case                                                                                                       |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios                                                       |
| ------------ | --------------------------------------------------------------- |
| **Baixa**    | 1 arquivo, sem dependências externas, < 100 linhas              |
| **Média**    | 2-5 arquivos, banco OU integração, funcionalidade isolada       |
| **Alta**     | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** ~32 entidades organizadas em 10 arquivos por domínio; modelo fonte única da verdade para todos os 49 PRDs restantes; consumido por mocks (PRD-004), providers (PRD-005), RBAC (PRD-006), multi-loja (PRD-007) e todas as features dos demais blocos; precisa garantir compatibilidade futura com Supabase (drop-in replacement na Fase 2).

---

## Contexto do Problema

A plataforma GALLO BASE DIESEL atende um domínio rico e específico: distribuição de peças pesadas com particularidades comerciais (carteira de vendedor, positivação, curva ABC), técnicas (OEM, aplicação, equivalência) e operacionais (WhatsApp multi-atendente, multi-loja, RBAC). Sem um modelo conceitual consolidado e tipado, três problemas emergem rapidamente:

**Entidades reinventadas em cada PRD.** Sem fonte única, o PRD-010 (Inbox) define `IConversation` de um jeito, o PRD-020 (SDR) define de outro, o PRD-067 (Integração E-commerce) define um terceiro. No fim, há três `IConversation` ligeiramente diferentes e nada conecta direito. O modelo fica fragmentado e cada feature carrega seu próprio "dialeto" de tipos.

**Mocks da Fase 1 ficam incompatíveis com o Supabase da Fase 2.** A estratégia Frontend First exige que os mocks tenham a **exata mesma assinatura** que o backend terá depois. Se as interfaces TypeScript não forem desenhadas com isso em mente desde o início, vira retrabalho na Fase 2: cada serviço precisa ser ajustado, cada componente refatorado. O drop-in replacement (`VITE_DATA_SOURCE=mock|supabase`) só funciona se o modelo for fiel ao banco.

**Glossário implícito gera mal-entendidos.** Termos do domínio como "positivação", "curva ABC", "ruptura de estoque", "equivalência", "ciclo de vida do cliente" têm significados precisos no mercado de peças pesadas — diferentes do uso casual em outros contextos. Sem glossário oficial, o agente desenvolvedor (Claude Code CLI) implementa o que ele acha que o termo significa, e vira ruído cumulativo ao longo dos 50 PRDs.

Este PRD resolve os três problemas: estabelece o modelo conceitual completo em TypeScript, define as convenções de tipagem que se propagam por toda a base de código, e documenta o glossário oficial do domínio.

---

## Conceito da Solução

### Situação Atual (As-Is)

As entidades estão descritas no `briefing-execucao-prds.md` Seção 4 em forma narrativa/pseudo-código (TypeScript informal). Não há nenhum arquivo de código com as interfaces. O glossário existe parcialmente no Apêndice 8.1 do briefing mas não está integrado ao código.

### Situação Desejada (To-Be)

Um conjunto coeso de **10 arquivos de tipos TypeScript** em `src/shared/types/`, organizados por domínio, exportados via barrel (`index.ts`), tipados em modo strict, sem `any`, e referenciáveis por qualquer feature via import absoluto (`import type { ICustomer } from '@/shared/types'`).

Complementarmente, um arquivo `docs/glossario.md` com **definições oficiais** dos termos do domínio, linkado por JSDoc nas interfaces relevantes — funcionando como a "fonte da verdade" semântica que todos os agentes (Claude Code CLI, futuros desenvolvedores humanos) consultam.

### Alternativas Consideradas

| Alternativa                                                                     | Por que foi descartada                                                                                                                             |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipos definidos junto com cada feature (`src/features/*/types/`)                | Fragmenta o modelo; dificulta visão consolidada; gera duplicação inevitável de tipos compartilhados                                                |
| Usar `enum` do TypeScript                                                       | Enums geram código JS no bundle, têm comportamento confuso em runtime, e não são "tree-shakable". Union types literais são a prática moderna       |
| Usar Zod para definir o schema e derivar os tipos                               | Custo de bundle e complexidade extra desnecessária no MVP (mocks já controlam os dados). Zod entra na Fase 2 quando houver APIs reais              |
| Usar TypeORM/Prisma decorators                                                  | Acopla o modelo conceitual a uma stack específica de ORM, fere o Provider Pattern, e dificulta a abstração Mock/Supabase                           |
| Datas como `Date` (objeto JS)                                                   | `Date` é problemático em JSON, serialização, e comparações; tem fuso horário implícito. ISO 8601 string é universal e funciona em qualquer backend |
| IDs como branded types (`type CustomerId = string & { __brand: 'CustomerId' }`) | Útil para prevenir mistura de IDs em apps grandes, mas excesso de cerimônia no MVP. Pode ser introduzido depois sem refatoração de comportamento   |

**Decisões consolidadas:**

- **Interfaces** começam com prefixo `I` (conforme GuiaPRD v1.4 Seção 5.2)
- **Union types literais** em vez de enums (`type Division = 'parts' | 'service' | 'industrial'`)
- **Datas como string ISO 8601** (tipo utilitário `ISO8601 = string`)
- **IDs como `string` plain** (tipo utilitário `ID = string`; branded types ficam para evolução futura)
- **Valores monetários como `number` decimal** (R$ 1234.56 = `1234.56`) com tipo utilitário `Money = number`
- **Modo strict total** no `tsconfig.json` (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`)
- **Sem `any`** em nenhuma definição de tipo — usar `unknown` quando inevitável
- **Barrel exports** via `src/shared/types/index.ts` para imports limpos
- **JSDoc** nas interfaces principais com link para o glossário

---

## Glossário do Domínio (resumo — versão completa em `docs/glossario.md`)

### Termos técnicos do mercado de peças pesadas

| Termo            | Definição operacional na plataforma                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **OEM**          | Original Equipment Manufacturer — código original da peça atribuído pela montadora (Volvo, Scania, Mercedes, Ford, Iveco). Uma peça pode ter múltiplos OEMs equivalentes |
| **SKU**          | Stock Keeping Unit — código interno da GALLO BASE DIESEL para a peça, distinto do OEM                                                                                    |
| **Aplicação**    | Compatibilidade entre uma peça e um conjunto (marca + modelo + ano + motorização) de veículo. Uma peça pode ter N aplicações                                             |
| **Equivalência** | Relação entre peças de marcas/fabricantes diferentes que cumprem a mesma função. Permite venda alternativa quando o original está em ruptura                             |
| **Ruptura**      | Estado de uma peça quando o estoque chega a zero. Dispara recomendações de equivalência e alerta de reposição                                                            |
| **Frota**        | Conjunto de veículos pertencentes a um mesmo cliente B2B (ex: uma transportadora com 30 caminhões)                                                                       |
| **Montadora**    | Fabricante do veículo (Volvo, Scania, Mercedes-Benz, Ford Cargo, Iveco)                                                                                                  |

### Termos comerciais

| Termo                        | Definição operacional na plataforma                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Carteira**                 | Conjunto de clientes sob responsabilidade primária de um vendedor. Relação 1:1 estrita (cada cliente tem um único vendedor responsável)                                   |
| **Positivação**              | Quantidade de clientes únicos atendidos no período. Conceito comercial B2B clássico. Classifica carteira em ativos, inativos, novos, inativos recentes e inativos antigos |
| **Curva ABC**                | Classificação de clientes por participação no faturamento (Pareto). Clientes A respondem por ~80% da receita, B por ~15%, C por ~5%                                       |
| **Ciclo de vida do cliente** | Estados sequenciais: `lead` → `ativo` → `dormente` (90+ dias sem compra) → `recuperação` (em campanha) → `perdido` ou volta a `ativo`                                     |
| **Ticket médio**             | Valor médio dos pedidos de um cliente em determinado período                                                                                                              |
| **LTV**                      | Lifetime Value — soma de todas as compras do cliente ao longo do relacionamento                                                                                           |
| **Recência**                 | Dias desde a última compra do cliente                                                                                                                                     |
| **Recuperação**              | Ato de trazer de volta um cliente dormente ou perdido                                                                                                                     |
| **Comissão**                 | Valor pago ao vendedor por venda fechada, calculado sobre uma base (faturamento, margem) com uma alíquota                                                                 |

### Termos operacionais da plataforma

| Termo                   | Definição operacional na plataforma                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ficha**               | Visão consolidada (tela única) de um cliente: dados cadastrais, conversas, pedidos, orçamentos, veículos, notas, tags, recomendações        |
| **Inbox**               | Lista de conversas ativas, ordenadas por última interação. Conceito de WhatsApp/CRM moderno                                                 |
| **Pipeline leve**       | Funil simplificado para leads: Novo → Em qualificação → Orçamento enviado → Em negociação → Convertido/Perdido                              |
| **Lead**                | Contato que ainda não comprou. Vira `Customer` no momento do primeiro pedido fechado                                                        |
| **Temperatura do lead** | Indicador subjetivo: `frio` / `morno` / `quente`. Sugerido pelo SDR, ajustável manualmente                                                  |
| **SDR**                 | Sales Development Representative — aqui o **agente de IA** que atende 24/7, identifica peças e qualifica leads antes de escalar para humano |
| **Escalonamento**       | Ato do SDR repassar conversa para um vendedor humano, com resumo de contexto pronto                                                         |
| **Reversão automática** | Mecânica de transferência temporária de carteira: ao chegar a data de fim, os clientes voltam automaticamente ao vendedor original          |
| **Promoção de tag**     | Ato do gestor de elevar uma tag livre (criada por um vendedor) ao catálogo oficial de sugestões                                             |

### Termos arquiteturais

| Termo                        | Definição operacional na plataforma                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Division**                 | Submarca/divisão de atuação: `parts`, `service`, `industrial`. No MVP, sempre `parts`                                                                            |
| **Submarca**                 | Marca-filha da arquitetura GALLO: PARTS (verde), SERVICE (vermelho), INDUSTRIAL (amarelo)                                                                        |
| **Provider**                 | Implementação concreta de um padrão de abstração: `MockProvider` / `SupabaseProvider` para dados; `MetaCloudProvider` / `EvolutionProvider` para WhatsApp        |
| **Drop-in replacement**      | Capacidade de trocar a implementação (mock → Supabase) sem mudar código consumidor — via `VITE_DATA_SOURCE`                                                      |
| **Capabilities**             | Conjunto de funcionalidades suportadas por um provider específico (ex: `templates_hsm` no Meta, ausente no Evolution)                                            |
| **Janela de 24h (WhatsApp)** | Período após a última mensagem do cliente em que a empresa pode enviar mensagens livres. Fora dela, só via template HSM (no Meta) ou sempre livre (no Evolution) |
| **Template HSM**             | Mensagem pré-aprovada pela Meta para envio proativo fora da janela de 24h. Exclusiva do provider Meta Cloud API                                                  |
| **Auditoria**                | Registro imutável de ações sensíveis (quem fez o quê, quando, com quais dados antes/depois)                                                                      |
| **Equipe dormente**          | Entidade `ITeam` modelada no domínio mas não ativada no MVP. Hierarquia de metas opera apenas em loja + individual até equipes serem ligadas                     |

---

## Escopo

### Incluído

- ✅ **10 arquivos de tipos** em `src/shared/types/` cobrindo todas as ~32 entidades do briefing v1.1 Seção 4
- ✅ **Barrel export** (`index.ts`) para imports limpos
- ✅ **Tipos utilitários** comuns: `ID`, `ISO8601`, `Money`, `Division`, `ThemeName`, `ThemeMode`
- ✅ **Union types literais** para todos os estados/enumerações (status de pedido, status de conversa, tipo de transferência, etc.)
- ✅ **JSDoc** com link para o glossário nas interfaces principais
- ✅ **Documento `docs/glossario.md`** com definições completas e exemplos
- ✅ **Configuração de `tsconfig.json`** em modo strict total
- ✅ **Convenções documentadas** sobre datas, IDs, valores monetários, nullability

### Excluído

- ❌ Implementação de mocks ou geradores de dados (responsabilidade do PRD-004)
- ❌ Implementação de serviços/providers que consomem os tipos (responsabilidade do PRD-005)
- ❌ Validação runtime com Zod ou similar (Fase 2; mocks já controlam os dados na Fase 1)
- ❌ Schemas SQL ou DDL do Supabase (Fase 2)
- ❌ Branded types para IDs (evolução futura, não bloqueia MVP)
- ❌ Migrations ou versionamento de schema (Fase 2)
- ❌ Tipos derivados de componentes (props, slots) — esses nascem nos PRDs que criam os componentes
- ❌ Tipos de eventos/comandos (CQRS, event sourcing) — fora do escopo do MVP

---

## Requisitos Funcionais

### Tipos utilitários comuns

- **RF-001:** O sistema deve definir em `src/shared/types/common.ts` os tipos utilitários:
  - `type ID = string` — identificador único de qualquer entidade
  - `type ISO8601 = string` — data/hora em formato ISO 8601 (`"2026-05-25T14:30:00.000Z"`)
  - `type Money = number` — valor monetário em decimal (R$ 1234.56 representado como `1234.56`)
  - `type Division = 'parts' | 'service' | 'industrial'` — submarca/divisão
  - `type ThemeName = 'diesel' | 'parts' | 'service' | 'industrial'`
  - `type ThemeMode = 'light' | 'dark'`
- **RF-002:** Todos os campos `id`, `*Id`, `*ById` em qualquer entidade devem usar o tipo `ID`.
- **RF-003:** Todos os campos de data/timestamp devem usar o tipo `ISO8601`.
- **RF-004:** Todos os campos monetários (`unitPrice`, `total`, `discount`, etc.) devem usar o tipo `Money`.

### Plataforma e organização (`src/shared/types/platform.ts`)

- **RF-005:** Definir `IStore` com campos: `id: ID`, `name: string`, `type: 'matriz' | 'filial' | 'parceira'`, `address: string`, `cnpj: string`, `settings: IPlatformSettings`, `activeDivisions: Division[]`, `createdAt: ISO8601`. No MVP, todas as instâncias têm `activeDivisions: ['parts']`.
- **RF-006:** Definir `ITeam` (entidade dormente no MVP) com campos: `id: ID`, `name: string`, `storeId: ID`, `managerId: ID`, `sellerIds: ID[]`, `createdAt: ISO8601`.
- **RF-007:** Definir `IPlatformSettings` agregando todas as configurações administráveis: `storeId`, `lifecycleThresholds` (objeto com `dormantDays`, `lostDays`), `vehicleCadastroMode` (default da loja), `tagSuggestions`, `pipelineStages`, `lossReasons`, `gamificationRules`, `whatsappAccounts`, `defaultDivision`.

### Pessoas e permissões (`src/shared/types/people.ts`)

- **RF-008:** Definir `ISeller` com tipos: `type: 'internal' | 'external' | 'representative'`, `availability: 'online' | 'ausente' | 'ocupado' | 'offline'`, `divisions: Division[]`, `themePreference?: { mode: ThemeMode; theme: ThemeName }`. Campos reservados para externos (`region`, `commissionTier`, `parentSellerId`, `commissionRule`) ficam opcionais.
- **RF-009:** Definir `IRole` com `permissions: IPermission[]` e nomes válidos: `'Owner' | 'Gestor' | 'Vendedor' | 'SDR' | 'Cliente' | 'VendedorExterno' | 'Financeiro'`.
- **RF-010:** Definir `IPermission` com: `resource: string`, `actions: ('view' | 'create' | 'edit' | 'delete' | 'approve')[]`, `scope: 'own' | 'team' | 'store' | 'all'`.
- **RF-011:** Definir `IAuditLog` com `actorId`, `action`, `resource`, `resourceId`, `before?`, `after?`, `timestamp: ISO8601`, `storeId`.

### Cliente, veículo, lead e relacionamento (`src/shared/types/customer.ts` e `lead.ts`)

- **RF-012:** Definir `ICustomer` distinguindo B2B (com `cnpj`, `razaoSocial`, `nomeFantasia`, `contactName`) de B2C (com `cpf`, `fullName`), via discriminated union sobre `type: 'B2B' | 'B2C'`.
- **RF-013:** Definir `ICustomer.status: 'ativo' | 'dormente' | 'recuperacao' | 'perdido'` — ciclo de vida do cliente (ver glossário).
- **RF-014:** Definir `ICustomerNote` com `authorId`, `content`, `createdAt` — sempre compartilhada (sem flag `private`).
- **RF-015:** Definir `IVehicle` com `brand`, `model`, `year`, `engine`, `plate?`, `vin?`, `currentKm?`, `serviceHistory: IVehicleServiceEntry[]`, `cadastroStatus: 'aprovado' | 'pendente' | 'rejeitado'`.
- **RF-016:** Definir `IVehicleServiceEntry` com `vehicleId`, `orderId?`, `parts: string[]`, `date: ISO8601`, `km?`.
- **RF-017:** Definir `ILead` com `stage: ILeadStage`, `temperature: 'frio' | 'morno' | 'quente'`, `origin: 'whatsapp' | 'ecommerce' | 'indicacao' | 'google' | 'outro'`, `nextActionAt?`, `estimatedValue?: Money`, `lossReason?`, `lossNotes?`, `convertedToCustomerId?`, `conversations: ID[]`.
- **RF-018:** Definir `ILeadStage` com `id`, `name`, `order: number`, `color: string` — estágios configuráveis.
- **RF-019:** Definir `ICustomerSegment` (filtros salvos) com `ownerId`, `scope: 'private' | 'shared'`, `filters: Record<string, unknown>` — estrutura genérica para query DSL.
- **RF-020:** Definir `ICarteiraTransfer` com `type: 'temporary' | 'permanent_individual' | 'permanent_batch'`, `fromSellerId`, `toSellerId`, `customerIds: ID[]`, `reason: string`, `startDate: ISO8601`, `endDate?: ISO8601` (só em `temporary`), `autoRevertAt?: ISO8601`, `status: 'active' | 'reverted' | 'expired'`.
- **RF-021:** Definir `IRecommendation` com `type` (10 valores literais já especificados no briefing) e `priority: 'low' | 'medium' | 'high' | 'critical'`.
- **RF-022:** Definir `IPortalSettings` com flags booleanas granulares: `enabled`, `canViewOrderHistory`, `canCreateQuote`, `canApproveQuote`, `canSeePriceTable`, `canDownloadNF`, `canSeeCreditLimit`.

### Conversa e canal (`src/shared/types/conversation.ts`)

- **RF-023:** Definir `IConversation` com `customerId?` E `leadId?` (mutuamente exclusivos no nível semântico; validação fica nos mocks/services), `channel: 'whatsapp' | 'ecommerce' | 'phone' | 'site'`, `whatsappAccountId?`, `status: 'aguardando' | 'em_andamento' | 'aguardando_cliente' | 'resolvida' | 'arquivada'`, `isSdrActive: boolean`.
- **RF-024:** Definir `IMessage` com `direction: 'in' | 'out'`, `authorType: 'customer' | 'seller' | 'sdr' | 'system'`, `provider: 'meta' | 'evolution' | 'mock'`, `status: 'sent' | 'delivered' | 'read' | 'failed'`, `mediaType?`, `mediaUrl?`.
- **RF-025:** Definir `IWhatsAppAccount` com `provider: 'meta' | 'evolution'`, `credentialsRef: string` (referência ofuscada, nunca a credencial em si), `status: 'connected' | 'disconnected' | 'pending'`, `capabilities: IWhatsAppCapabilities`.
- **RF-026:** Definir `IWhatsAppCapabilities` como objeto enumerando o que cada provider suporta: `supportsTemplatesHsm`, `supportsInteractiveButtons`, `supportsLists`, `supportsReactions`, `supportsProactiveMessaging`, `supportsReadStatusInGroups`.

### Catálogo (`src/shared/types/catalog.ts`)

- **RF-027:** Definir `IPart` com `sku`, `oemCodes: string[]`, `equivalentPartIds: ID[]`, `applications: IApplication[]`, `brand`, `supplier`, `unitCost: Money`, `unitPrice: Money`, `marginPercent: number`, `stockAvailable: number`, `stockMinimum: number`, `division: Division` (default `'parts'` no MVP).
- **RF-028:** Definir `IApplication` com `vehicleBrand`, `vehicleModel`, `yearStart: number`, `yearEnd: number`, `engine?: string`.

### Comercial (`src/shared/types/commercial.ts`)

- **RF-029:** Definir `IQuote` com `items: IQuoteItem[]`, `subtotal: Money`, `discount: Money`, `shipping: Money`, `total: Money`, `paymentCondition: string`, `validUntil: ISO8601`, `status: 'rascunho' | 'enviado' | 'aceito' | 'recusado' | 'expirado' | 'convertido'`, `origin: 'sdr' | 'vendedor' | 'cliente_portal' | 'ecommerce'`, `division: Division`.
- **RF-030:** Definir `IQuoteItem` com snapshots de preço/nome (não referências) para preservar histórico mesmo se o produto mudar.
- **RF-031:** Definir `IOrder` com `quoteId?`, `paymentStatus: 'pendente' | 'parcial' | 'pago' | 'estornado'`, `fulfillmentStatus: 'pendente' | 'separacao' | 'expedido' | 'entregue' | 'cancelado'`, `origin: 'whatsapp' | 'ecommerce' | 'portal' | 'pwa_externo' | 'manual'`, `nfNumber?`, `nfDate?: ISO8601`, `division: Division`.
- **RF-032:** Definir `IOrderItem` com snapshots (idem `IQuoteItem`) + `unitCost: Money`, `marginValue: Money` calculados no momento da venda.
- **RF-033:** Definir `ICommission` com `sellerId`, `orderId`, `baseValue: Money`, `rate: number` (alíquota, ex: `0.05` = 5%), `value: Money`, `period: string` (formato `"YYYY-MM"`), `status: 'pendente' | 'aprovado' | 'pago' | 'contestado'`.

### Metas, ranking, BI (`src/shared/types/bi.ts`)

- **RF-034:** Definir `IGoal` com `level: 'store' | 'team' | 'individual'` (team dormente), `targetId`, `period: { type: 'daily' | 'monthly' | 'quarterly'; start: ISO8601; end: ISO8601 }`, `metric: 'revenue' | 'margin' | 'tickets' | 'positivacao' | 'recovery' | 'conversion'`, `targetValue: number`, `currentValue: number`, `progressPercent: number`, `division?: Division`.
- **RF-035:** Definir `IGamificationBadge` com `sellerId`, `badgeType: string`, `earnedAt: ISO8601`, `periodRef: string`.
- **RF-036:** Definir `IRanking` com `period`, `level: 'store' | 'team' | 'individual'`, `entries: { sellerId: ID; score: number; position: number }[]`.
- **RF-037:** Definir `IPositivation` com `period`, `storeId`, `categories: { ativos: ID[]; inativos: ID[]; novos: ID[]; inativos_recentes: ID[]; inativos_antigos: ID[] }`.
- **RF-038:** Definir `IABCClassification` com `customerId`, `period`, `class: 'A' | 'B' | 'C'`, `revenueShare: number`, `cumulativeShare: number`.

### Barrel export e organização

- **RF-039:** Criar `src/shared/types/index.ts` que re-exporta todos os tipos das 10 unidades para permitir imports unificados (`import type { ICustomer, IOrder } from '@/shared/types'`).
- **RF-040:** Organizar os 10 arquivos exatamente conforme:

```
src/shared/types/
├── index.ts          ← barrel export
├── common.ts         ← ID, ISO8601, Money, Division, ThemeName, ThemeMode
├── platform.ts       ← IStore, ITeam, IPlatformSettings
├── people.ts         ← ISeller, IRole, IPermission, IAuditLog
├── customer.ts       ← ICustomer, ICustomerNote, IVehicle, IVehicleServiceEntry, ICustomerSegment, IPortalSettings
├── lead.ts           ← ILead, ILeadStage, ICarteiraTransfer
├── conversation.ts   ← IConversation, IMessage, IWhatsAppAccount, IWhatsAppCapabilities
├── catalog.ts        ← IPart, IApplication
├── commercial.ts     ← IQuote, IQuoteItem, IOrder, IOrderItem, ICommission
└── bi.ts             ← IGoal, IGamificationBadge, IRanking, IPositivation, IABCClassification, IRecommendation
```

### Glossário documental

- **RF-041:** Criar `docs/glossario.md` com definições expandidas de todos os termos listados na seção "Glossário do Domínio" deste PRD, incluindo exemplos práticos no contexto da GALLO BASE DIESEL.
- **RF-042:** Adicionar JSDoc nas interfaces principais (`ICustomer`, `IPart`, `IConversation`, `ICarteiraTransfer`, etc.) com link relativo para o termo correspondente no glossário.

### Configuração TypeScript

- **RF-043:** Garantir no `tsconfig.json`:
  - `"strict": true`
  - `"noImplicitAny": true`
  - `"strictNullChecks": true`
  - `"noUncheckedIndexedAccess": true` (acessar array por índice retorna `T | undefined`)
  - `"exactOptionalPropertyTypes": true`
  - Path absoluto `@/*` para `src/*`

---

## Requisitos Não-Funcionais

- **RNF-001 (Tipagem estrita):** Zero ocorrências de `any` em qualquer arquivo de tipos. Quando inevitável (ex: filtros genéricos), usar `unknown`.
- **RNF-002 (Compilação):** Todo o módulo deve compilar com `tsc --noEmit` sem nenhum erro ou warning.
- **RNF-003 (Manutenibilidade):** Adicionar uma nova entidade deve impactar exatamente um arquivo de tipos + o barrel `index.ts`. Sem efeitos colaterais em outros arquivos.
- **RNF-004 (Compatibilidade futura):** Os tipos devem ser semanticamente compatíveis com schemas Supabase futuros (PRD-100+). Particularmente: usar `snake_case` apenas na camada de service/provider (mapeamento), nunca nos tipos do domínio que ficam em `camelCase`.
- **RNF-005 (Documentação no código):** JSDoc obrigatório nas interfaces principais, opcional em campos. JSDoc deve explicar o "porquê" semântico, não repetir o que o tipo já diz.
- **RNF-006 (Imports limpos):** Toda feature deve importar tipos apenas via barrel (`@/shared/types`), nunca via caminho específico (`@/shared/types/customer.ts`).

---

## Critérios de Aceitação

### RF-001 a RF-004: Tipos utilitários comuns

```gherkin
DADO que um desenvolvedor está implementando um novo serviço
QUANDO ele precisa tipar um identificador de cliente
ENTÃO deve usar o tipo ID importado de @/shared/types
  E nunca usar string solto sem tipagem específica

DADO que estou modelando uma data de criação
QUANDO declaro o campo createdAt
ENTÃO devo usar o tipo ISO8601, não Date nem string

DADO que estou modelando um valor monetário
QUANDO declaro o campo total
ENTÃO devo usar o tipo Money, não number genérico
```

### RF-005 a RF-038: Entidades do modelo

```gherkin
DADO que estou criando um mock de pedido (PRD-004 futuro)
QUANDO instancio um objeto que respeita IOrder
ENTÃO o TypeScript deve validar todos os campos obrigatórios
  E o campo division deve ser obrigatoriamente 'parts' | 'service' | 'industrial'
  E o status deve estar dentro do union literal especificado

DADO que crio uma entidade ICustomer do tipo B2B
QUANDO tento omitir o campo cnpj
ENTÃO o TypeScript deve reportar erro de compilação
  E o discriminated union deve forçar o preenchimento dos campos B2B corretos

DADO que crio uma ICarteiraTransfer do tipo 'temporary'
QUANDO omito o campo endDate
ENTÃO o TypeScript deve permitir (endDate é opcional no tipo)
  MAS a lógica de mock/service deve garantir que temporary sempre tenha endDate (validação semântica fora do tipo)
```

### RF-039 a RF-042: Organização e glossário

```gherkin
DADO que importo tipos em uma feature
QUANDO escrevo `import type { ICustomer, IOrder, IQuote } from '@/shared/types'`
ENTÃO os três tipos devem estar disponíveis a partir do barrel
  E não deve ser necessário importar de @/shared/types/customer.ts diretamente

DADO que abro o arquivo docs/glossario.md
QUANDO procuro pelo termo "positivação"
ENTÃO devo encontrar definição operacional + exemplo no contexto GALLO
  E os links da JSDoc na interface IPositivation devem apontar para essa seção
```

### RF-043: TypeScript strict mode

```gherkin
DADO que rodo `tsc --noEmit` no projeto
QUANDO o comando termina
ENTÃO o exit code deve ser 0
  E não deve haver nenhum erro ou warning de tipagem

DADO que tento atribuir undefined a um campo não-opcional
QUANDO escrevo `const customer: ICustomer = { ..., name: undefined }`
ENTÃO o TypeScript deve rejeitar imediatamente (strictNullChecks + exactOptionalPropertyTypes ativos)
```

### Cenários de Erro

```gherkin
DADO que um desenvolvedor inadvertidamente usa `any` em um tipo
QUANDO o lint roda
ENTÃO deve falhar com erro explícito apontando o uso de any
  E o build deve quebrar

DADO que uma interface nova é adicionada em customer.ts
QUANDO ela não é re-exportada via index.ts
ENTÃO features que tentam importar via @/shared/types devem falhar a compilação
  E a falha deve ser corrigida adicionando o export no barrel
```

---

## Fases de Implementação

| Fase | Objetivo                                          | Arquivos Estimados |
| ---- | ------------------------------------------------- | ------------------ |
| 1    | Setup, common e tipos transversais                | 2                  |
| 2    | Entidades de plataforma, pessoas e relacionamento | 4                  |
| 3    | Entidades de catálogo, comercial e BI             | 3                  |
| 4    | Glossário documental, JSDoc e validação final     | 2                  |

### Detalhamento das Fases

#### Fase 1: Setup e Tipos Comuns

**Objetivo:** estabelecer a fundação de tipos utilitários que tudo mais consome

**Ações:**

- [ ] Confirmar `tsconfig.json` em modo strict total conforme RF-043
- [ ] Criar `src/shared/types/common.ts` com `ID`, `ISO8601`, `Money`, `Division`, `ThemeName`, `ThemeMode`
- [ ] Criar `src/shared/types/index.ts` como barrel inicial (re-exporta common)
- [ ] Configurar path alias `@/*` no `tsconfig.json` e no `vite.config.ts`
- [ ] Validar com um arquivo de teste manual que `import type { ID } from '@/shared/types'` funciona

**Validação:** `tsc --noEmit` passa; import via barrel funciona.

#### Fase 2: Plataforma, Pessoas, Relacionamento e Conversa

**Objetivo:** modelar todo o lado "humano" e organizacional da plataforma

**Ações:**

- [ ] Criar `src/shared/types/platform.ts` (IStore, ITeam, IPlatformSettings)
- [ ] Criar `src/shared/types/people.ts` (ISeller, IRole, IPermission, IAuditLog)
- [ ] Criar `src/shared/types/customer.ts` (ICustomer com discriminated union B2B/B2C, ICustomerNote, IVehicle, IVehicleServiceEntry, ICustomerSegment, IPortalSettings)
- [ ] Criar `src/shared/types/lead.ts` (ILead, ILeadStage, ICarteiraTransfer)
- [ ] Criar `src/shared/types/conversation.ts` (IConversation, IMessage, IWhatsAppAccount, IWhatsAppCapabilities)
- [ ] Atualizar barrel `index.ts` com todos os exports

**Validação:** todas as 18 entidades deste grupo compilam sem erro; um arquivo de teste manual instancia exemplos de cada uma.

#### Fase 3: Catálogo, Comercial e BI

**Objetivo:** modelar todo o lado "produto e negócio" da plataforma

**Ações:**

- [ ] Criar `src/shared/types/catalog.ts` (IPart, IApplication)
- [ ] Criar `src/shared/types/commercial.ts` (IQuote, IQuoteItem, IOrder, IOrderItem, ICommission)
- [ ] Criar `src/shared/types/bi.ts` (IGoal, IGamificationBadge, IRanking, IPositivation, IABCClassification, IRecommendation)
- [ ] Atualizar barrel `index.ts` com todos os exports finais
- [ ] Verificar referências cruzadas (ex: IOrder referencia IOrderItem que referencia ID de IPart)

**Validação:** `tsc --noEmit` passa para o módulo inteiro; cardinalidades respeitadas (1:N via arrays, 1:1 via IDs).

#### Fase 4: Glossário e JSDoc

**Objetivo:** documentação semântica integrada ao código

**Ações:**

- [ ] Criar `docs/glossario.md` com todos os termos do PRD, organizados por seção (Técnicos, Comerciais, Operacionais, Arquiteturais)
- [ ] Adicionar JSDoc nas 12 interfaces principais (`ICustomer`, `ILead`, `IVehicle`, `IConversation`, `IMessage`, `IPart`, `IQuote`, `IOrder`, `ICarteiraTransfer`, `IGoal`, `IPositivation`, `IRecommendation`)
- [ ] JSDoc deve incluir: descrição semântica + link relativo para a seção correspondente do glossário (`@see ../../docs/glossario.md#positivacao`)
- [ ] Rodar lint final e confirmar zero `any`

**Validação:** todas as 12 interfaces principais têm JSDoc; glossário cobre todos os termos do PRD.

---

## Dependências

### PRDs Anteriores

Nenhum. Este PRD pode ser implementado em paralelo ao PRD-001 (ambos são fundação e não se referenciam tecnicamente).

### Serviços Externos

Nenhum.

### Decisões Pendentes

Nenhuma — todas as decisões críticas estão tomadas no briefing v1.1 e neste PRD.

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Bloco 0 — Fundação"**.

| Ordem | PRD         | Título                                         | Status       | Relação                      |
| ----- | ----------- | ---------------------------------------------- | ------------ | ---------------------------- |
| 1     | PRD-001     | Identidade Visual GALLO e Design System Base   | ⏳           | Independente                 |
| **2** | **PRD-002** | **Modelo Conceitual de Domínio e Glossário**   | **🔄 ATUAL** | Independente                 |
| 3     | PRD-003     | Shell do App, Navegação e Layouts Base         | ⏳           | Depende de PRD-001 e PRD-002 |
| 4     | PRD-004     | Geradores de Dados Fictícios e Camada de Mocks | ⏳           | Depende de PRD-002           |
| 5     | PRD-005     | Arquitetura de Provedores de Dados             | ⏳           | Depende de PRD-004           |
| 6     | PRD-006     | Sistema de Roles, Permissões e Auditoria       | ⏳           | Depende de PRD-002           |
| 7     | PRD-007     | Multi-Loja                                     | ⏳           | Depende de PRD-002 e PRD-003 |

> **Nota:** PRD-002 é pré-requisito de cinco outros PRDs do Bloco 0 e referenciado por todos os ~40 PRDs subsequentes. Cuidado especial com a fidelidade ao briefing v1.1 Seção 4.

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### Dados Sensíveis no Modelo

| Campo                                  | Classificação       | Tratamento no tipo                                                                                         |
| -------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ICustomer.cpf` / `ICustomer.cnpj`     | PII                 | Tipo `string` simples no modelo; mascaramento na UI (PRDs de telas)                                        |
| `IWhatsAppAccount.credentialsRef`      | Referência ofuscada | **Nunca armazenar a credencial em si**, apenas um identificador interno que aponta para um vault na Fase 2 |
| `ISeller.email` / `ICustomer.email`    | PII                 | Tipo `string` simples                                                                                      |
| `IAuditLog.before` / `IAuditLog.after` | Pode conter PII     | Tipo `unknown` ou `Record<string, unknown>` — políticas de sanitização nos PRDs que escrevem auditoria     |

### Recomendação de Política

Os tipos não impõem políticas de segurança — apenas modelam dados. As políticas (mascaramento, criptografia, controle de acesso) ficam nos PRDs de RBAC (PRD-006), providers (PRD-005) e PRDs de telas. Mas o **modelo tipa explicitamente o que é sensível** via JSDoc com tag `@sensitive` para que o agente desenvolvedor saiba.

---

## Fluxos de Usuário

> Este PRD é estrutural/de tipagem, sem fluxos diretos de usuário final. Os fluxos relevantes são os do **agente desenvolvedor** consumindo o modelo:

### Fluxo Principal — Consumir tipos em uma nova feature

```
[Dev] ──▶ Cria nova feature ──▶ Importa tipos via @/shared/types
                                          │
                                          ├──▶ TypeScript autocompleta os campos
                                          ├──▶ Strict mode pega erros em tempo de compilação
                                          └──▶ JSDoc orienta o "porquê" semântico
```

### Fluxo de Evolução — Adicionar nova entidade

1. Dev identifica necessidade de uma entidade nova em um PRD posterior
2. Avalia se ela cabe em um dos 10 arquivos existentes ou se precisa de novo arquivo
3. Adiciona a interface no arquivo certo
4. Atualiza o barrel `index.ts`
5. Adiciona termo ao `docs/glossario.md` se for conceito novo do domínio
6. Compila — se quebrar, é onde precisava ajustar

### Fluxo de Migração Fase 2 (Supabase)

1. PRD-100+ introduz `SupabaseProvider`
2. Provider mapeia `camelCase` do modelo para `snake_case` do banco no momento da query
3. Tipos do domínio **não mudam** — apenas a camada de mapeamento entre TS e SQL
4. Drop-in replacement funciona porque o modelo conceitual é estável

---

## Convenções de Código (Referência Rápida)

> **Consulte a Seção 5 do `guia-prd.md` para a versão completa.**

| Elemento                     | Convenção                                                            | Exemplo                                           |
| ---------------------------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| **Interfaces**               | PascalCase + `I`                                                     | `ICustomer`, `IPart`                              |
| **Union types**              | PascalCase                                                           | `Division`, `OrderStatus`                         |
| **Type aliases utilitários** | PascalCase                                                           | `ID`, `ISO8601`, `Money`                          |
| **Campos**                   | camelCase                                                            | `firstPurchaseAt`, `unitPrice`                    |
| **Arquivos de tipos**        | kebab-case                                                           | `customer.ts`, `bi.ts`                            |
| **Path alias**               | `@/*`                                                                | `import type { ICustomer } from '@/shared/types'` |
| **JSDoc**                    | Em interfaces principais, com link p/ glossário                      | `@see ../../docs/glossario.md#positivacao`        |
| **Nullability**              | `?` para opcional; nunca `\| null` no modelo (deixar para providers) | `endDate?: ISO8601`                               |
| **Mapeamento DB ↔ código**   | `snake_case` apenas na camada de provider                            | _Fora deste PRD_                                  |
| **Datas**                    | sempre `ISO8601` (string), nunca `Date`                              | `createdAt: ISO8601`                              |
| **Valores monetários**       | sempre `Money` (number decimal)                                      | `total: Money`                                    |
| **Git commits**              | Conventional Commits                                                 | `feat: add gallo domain model and glossary`       |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Você é o Claude Opus 4.7 operando via Claude Code CLI v2.1.3. Este PRD foi criado pelo Agente Arquiteto (Claude Opus 4.7 na plataforma web). Este PRD é implementado **após o scaffold Lovable do PRD-001/PRD-003**, sobre o clone local do repositório.

### Esclarecimento de Dúvidas

> **💬 Antes de implementar, faça perguntas para esclarecer qualquer ambiguidade sobre: requisitos funcionais, restrições técnicas, dependências, comportamentos esperados e critérios de aceitação.**

### Instruções Obrigatórias

> **⚠️ 1. ANTES DE IMPLEMENTAR:**
> "Lembre-se: explore a estrutura dos dados, planeje primeiro cada passo, analise, investigue a fundo, pense e revise tudo antes de realizar qualquer atualização ou implementação."

> **⚠️ 2. APÓS IMPLEMENTAR:**
>
> - Incrementar a versão do app seguindo [SemVer](https://semver.org/) — este PRD entrega uma MINOR (modelo é fundação, mas adiciona capacidade não-visível ao usuário; pode ser PATCH se preferir conservar; recomendo MINOR com codinome próprio se for individual, ou aguardar e versionar junto com PRD-003 como Genesis se foram implementados em sequência rápida)
> - Atualizar o `CHANGELOG.md` seguindo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
> - Renomear este arquivo adicionando `_DONE` ao final
>   Ex: `PRD-002-modelo-conceitual-glossario_DONE.md`
> - Atualizar a seção "Status de Implementação"

### Guia de Versionamento (SemVer)

| Tipo de Mudança      | Ação                 | Exemplo       |
| -------------------- | -------------------- | ------------- |
| Correção de bug      | PATCH +1             | 0.1.0 → 0.1.1 |
| Nova funcionalidade  | MINOR +1, PATCH = 0  | 0.1.0 → 0.2.0 |
| Mudança incompatível | MAJOR +1, outros = 0 | 0.x.x → 1.0.0 |

**Codinomes da plataforma GALLO BASE DIESEL (sequência sugerida):**

| Versão | Codinome   | Contexto                                                                        |
| ------ | ---------- | ------------------------------------------------------------------------------- |
| v0.1.0 | Genesis    | PRD-001 + PRD-002 + PRD-003 (fundação completa) — combinar releases é aceitável |
| v0.2.0 | Hub        | Após Bloco 0 completo (mocks + providers + RBAC + multi-loja)                   |
| v0.3.0 | Pilot      | Após Bloco 1 (CRM)                                                              |
| v0.4.0 | Compass    | Após Bloco 4 (Gestão)                                                           |
| v0.5.0 | Storefront | Após Bloco 5 (E-commerce)                                                       |
| v1.0.0 | Heavy      | Release MVP completo                                                            |

🔗 Referência: https://semver.org/

### Guia de Changelog (Keep a Changelog)

Tipos de mudança a documentar:

- **Added** — novas funcionalidades
- **Changed** — mudanças em funcionalidades existentes
- **Deprecated** — funcionalidades que serão removidas
- **Removed** — funcionalidades removidas
- **Fixed** — correções de bugs
- **Security** — correções de vulnerabilidades

🔗 Referência: https://keepachangelog.com/en/1.1.0/

### Princípios de Implementação

| Princípio                          | Descrição                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Modelo é a fonte da verdade**    | Toda discussão sobre "como é o cliente?" termina em `ICustomer`. Nenhum PRD pode redefinir entidades já existentes — apenas estender |
| **Fidelidade ao briefing v1.1**    | A Seção 4 do briefing é a especificação canônica. Qualquer divergência é erro a corrigir, não decisão a tomar                        |
| **Strict mode sempre**             | Nunca relaxar tsconfig. Strict é o que pega bugs antes que apareçam                                                                  |
| **Snake_case fica fora deste PRD** | Modelo TS é em `camelCase`. Mapeamento para `snake_case` do banco é responsabilidade do `SupabaseProvider` na Fase 2                 |
| **Glossário vivo**                 | Cada termo novo do domínio entra no `docs/glossario.md` antes do tipo ser criado                                                     |
| **Sem `any` em hipótese alguma**   | Se precisar de tipo dinâmico, usar `unknown` e narrow depois                                                                         |

### Orientações Gerais

| Aspecto                                         | Orientação                                                                                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Discriminated unions**                        | Usar onde houver tipos polimórficos (`ICustomer` B2B/B2C, `ICarteiraTransfer` temporary/permanent) — o discriminante força preenchimento correto                       |
| **Campos opcionais vs nullable**                | Sempre `?` (opcional) nunca `\| null` no modelo. Nulidade é responsabilidade da camada de provider, não do domínio                                                     |
| **Snapshots em items (IQuoteItem, IOrderItem)** | Não usar referência ao `IPart` — copiar `partName`, `unitPrice` etc. no momento da criação. Histórico precisa sobreviver a mudanças no catálogo                        |
| **Capabilities em IWhatsAppAccount**            | Estruturar como objeto plano `{ supportsX: boolean, supportsY: boolean }`, não como array de strings. Permite type-narrowing fácil                                     |
| **IConversation com customerId OU leadId**      | Modelar como `customerId?: ID; leadId?: ID` (ambos opcionais, mas exatamente um sempre preenchido) — semântica de exclusividade fica nos mocks e services, não no tipo |
| **JSDoc com `@see` p/ glossário**               | Link relativo do tipo de arquivo `.ts` para a âncora no `glossario.md`: `@see ../../docs/glossario.md#positivacao`                                                     |

### O que NÃO Fazer

| ❌ Evitar                                                                                                      |
| -------------------------------------------------------------------------------------------------------------- |
| Adicionar entidade que não está no briefing v1.1 Seção 4 sem aprovar com o Arquiteto antes                     |
| Usar `enum` do TypeScript — sempre union types literais                                                        |
| Usar `Date` em campos de tempo — sempre `ISO8601` (string)                                                     |
| Usar `any` em qualquer parte                                                                                   |
| Definir tipos junto com features (`src/features/*/types/`) — quebra a fonte única                              |
| Reexportar tipos do barrel via `export *` — listar explicitamente para ter controle                            |
| Criar branded types no MVP — adiar para futuro (não bloqueia nada agora)                                       |
| Misturar `camelCase` (modelo) com `snake_case` (banco) neste arquivo — `snake_case` é só na camada de provider |
| Esquecer de atualizar o barrel quando adicionar tipos novos                                                    |
| Esquecer de adicionar entrada no glossário ao criar nova entidade                                              |

---

## Status de Implementação

| Campo                     | Valor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**                | ✅ IMPLEMENTADO                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Data de Implementação** | 25/05/2026                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Versão do App**         | v0.1.1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Codinome**              | Genesis                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Implementado por**      | Claude Opus 4.7 (Claude Code CLI)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Observações**           | Modelo completo em `src/shared/types/` (10 arquivos + barrel); glossário em `docs/glossario.md`. `ThemeMode` mantido como `'light' \| 'dark' \| 'auto'` (alinhado com PRD-001 implementado, em vez de `'light' \| 'dark'` do briefing) — `auto` faz parte do contrato do `ThemeProvider`. `exactOptionalPropertyTypes` permanece OFF — incompatível com shadcn/ui (tech-debt no CHANGELOG). Bump escolhido foi PATCH mantendo codinome Genesis (não MINOR), pois não há feature visível ao usuário. |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| 25/05/2026 | v1     | Criação inicial — modelo conceitual GALLO completo (32 entidades em 10 arquivos) + glossário do mercado de peças pesadas |
| 30/05/2026 | delta  | PRD-008 estende o modelo com INotification e tipos auxiliares (notificação de evento/derivada, categoria, canal, preferência). Não redefine entidades existentes. |

---

**AILA - Sistemas Inteligentes**
