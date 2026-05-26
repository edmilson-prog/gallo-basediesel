# PRD-017: Pipeline de Leads (Kanban + Lista)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                               |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                    |
| **Objetivo**          | Construir um pipeline leve de leads (Kanban + Lista) que preserva memória organizacional na conversão, mede tempo em cada estágio, e integra naturalmente com inbox e ficha do cliente |
| **Tipo**              | Feature                                                                                                                                                                                |
| **Complexidade**      | Alta                                                                                                                                                                                   |
| **Total de Fases**    | 5                                                                                                                                                                                      |
| **Prioridade**        | Alta                                                                                                                                                                                   |
| **Épico**             | Bloco 1 — Central de Atendimento e CRM                                                                                                                                                 |
| **PRDs Relacionados** | PRD-010 (Inbox), PRD-012 (Ficha — badge pré-conversão), PRD-015 (Lista Clientes), PRD-019 (Configurações — estágios e motivos), PRD-031 (Orçamento)                                    |
| **Implementação**     | 🔵 Claude Code CLI (sobre o scaffold do Lovable)                                                                                                                                       |
| **Padrão de código**  | Feature-based; código em `src/features/leads/`; rotas `/app/leads` (Kanban default) e `/app/leads/:id` (detalhe)                                                                       |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios                                                       |
| ------------ | --------------------------------------------------------------- |
| **Baixa**    | 1 arquivo, sem dependências externas, < 100 linhas              |
| **Média**    | 2-5 arquivos, banco OU integração, funcionalidade isolada       |
| **Alta**     | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** Kanban com 5 colunas e drag-and-drop entre estágios + visão de lista alternativa, conversão de lead → cliente preservando histórico de conversas, cálculo de métricas (tempo médio em cada estágio, taxa de conversão), integração com inbox quando lead não tem customer associado, integração com ficha (PRD-012) gerando badge "Histórico pré-conversão" automaticamente, configurabilidade de estágios e motivos de perda via PRD-019, e impacto direto no PRD-014 (Painel Gestor) que consome métricas de pipeline.

---

## Contexto do Problema

A GALLO BASE DIESEL recebe leads novos todo dia: alguém manda mensagem no WhatsApp pedindo preço de uma peça, alguém liga perguntando se atende a região, um cliente recomendou amigo. Hoje, sem pipeline estruturado:

**Leads viram conversas anônimas.** Cada conversa no WhatsApp é tratada igual — sem distinção entre "cliente fiel há 5 anos" e "alguém perguntando preço pela primeira vez". O vendedor não consegue priorizar o que está prestes a fechar vs o que ainda é exploratório. **Sem visualização de funil, gestão não enxerga gargalos.** "Por que tantos leads ficam parados no estágio 'Orçamento enviado'?" Sem coluna no Kanban contando 30 leads ali parados, gestor não age. **Conversão perde memória.** Lead virou cliente — boa! Mas no novo registro de cliente, todo o histórico de "frio → morno → quente → convertido" se perdeu. Outro vendedor que atender no futuro não sabe quanto custou conquistar esse cliente.

Três problemas concretos resolvidos:

**Visualização clara do funil** via Kanban com 5 colunas, drag-and-drop entre estágios.
**Conversão com memória preservada** — quando lead vira customer, o `convertedFromLeadId` no `ICustomer` aciona badge "Histórico pré-conversão" na ficha (PRD-012), mantendo conversas antigas acessíveis.
**Métricas operacionais** — tempo médio em cada estágio, taxa de conversão, alimentam o painel do gestor (PRD-014) e BI da Onda 2.

---

## Conceito da Solução

### Estágios do pipeline (configuráveis, defaults)

| Ordem | Estágio                  | Significado                                        | Cor              |
| ----- | ------------------------ | -------------------------------------------------- | ---------------- |
| 1     | **Novo**                 | Acabou de entrar; sem qualificação ainda           | Cinza            |
| 2     | **Em qualificação**      | Vendedor/SDR conversando para entender necessidade | Azul             |
| 3     | **Orçamento enviado**    | Proposta formalizada, aguardando retorno           | Amarelo          |
| 4     | **Em negociação**        | Cliente está discutindo preço/condições            | Laranja          |
| 5     | **Convertido / Perdido** | Estágio final (separado em sub-status)             | Verde / Vermelho |

Estágios são configuráveis (Owner via PRD-019), mas defaults garantem operação imediata.

### Atributos do lead

Conforme PRD-002 (`ILead`):

| Campo                    | Tipo                                                              | Notas                                                         |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `name`                   | string                                                            | Nome do contato (pode ser parcial)                            |
| `phone`                  | string                                                            | Único campo obrigatório (chave para identificar)              |
| `email?`                 | string                                                            | Opcional                                                      |
| `stage`                  | `ILeadStage`                                                      | Estágio atual                                                 |
| `temperature`            | `'frio' \| 'morno' \| 'quente'`                                   | Indicador subjetivo; sugerido por SDR, ajustável por vendedor |
| `origin`                 | `'whatsapp' \| 'ecommerce' \| 'indicacao' \| 'google' \| 'outro'` | De onde veio                                                  |
| `storeId`                | ID                                                                | Loja                                                          |
| `sellerId`               | ID                                                                | Vendedor responsável (definido na distribuição — PRD-013)     |
| `nextActionAt?`          | ISO8601                                                           | Quando é a próxima ação prevista                              |
| `estimatedValue?`        | Money                                                             | Valor estimado da venda                                       |
| `lossReason?`            | string                                                            | Quando perdido — taxonomia configurável                       |
| `lossNotes?`             | string                                                            | Detalhe livre da perda                                        |
| `convertedToCustomerId?` | ID                                                                | Quando convertido — referência ao customer criado             |
| `conversations`          | ID[]                                                              | IDs das conversas vinculadas                                  |
| `createdAt`              | ISO8601                                                           | Data de criação                                               |
| `lastInteractionAt`      | ISO8601                                                           | Última atividade                                              |

### Layout

Página `/app/leads` com **2 modos de visualização toggláveis**:

#### Modo Kanban (default)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Header: Leads  [30 ativos]  [Kanban|Lista]  [Filtros▾] [+ Lead]           │
├──────────────────────────────────────────────────────────────────────────┤
│  Novo      Em qualif.    Orçam env.    Em negoc.    Convert/Perd.        │
│  (8)        (12)          (6)           (3)         (1/0)                 │
│  ┌──────┐  ┌──────┐      ┌──────┐      ┌──────┐    ┌──────┐              │
│  │Card  │  │Card  │      │Card  │      │Card  │    │Card  │              │
│  │🔵 JV  │  │🟡 PS │      │🔴 MC │      │🔴 RG │    │✅ AV │              │
│  │R$2k   │  │R$8k   │      │R$15k │      │R$25k │    │R$8k  │              │
│  │📅 2d  │  │📅 5d │      │📅 OK │      │📅 1d │    │      │              │
│  └──────┘  └──────┘      └──────┘      └──────┘    └──────┘              │
│  ...        ...           ...           ...         ...                   │
└──────────────────────────────────────────────────────────────────────────┘
```

Cada coluna é scroll-vertical independente. Drag-and-drop entre colunas atualiza estágio + audit log.

#### Modo Lista

Tabela paginada com colunas: nome, telefone, estágio, temperatura, origem, valor estimado, vendedor, próxima ação, dias no estágio atual. Filtros e ordenação como na lista de clientes (PRD-015).

### Card do lead (Kanban)

| Elemento          | Posição      | Conteúdo                                         |
| ----------------- | ------------ | ------------------------------------------------ |
| Avatar/iniciais   | Topo esq     | Por nome ou ícone genérico                       |
| Nome              | Topo         | Truncado em 1 linha                              |
| Telefone          | Sob nome     | Pequeno                                          |
| Temperatura       | Direita topo | 🔵 frio / 🟡 morno / 🔴 quente                   |
| Valor estimado    | Meio         | R$ X (BRL formatado)                             |
| Próxima ação      | Bottom       | "📅 amanhã" / "📅 OK" / "📅 atrasada" (vermelho) |
| Origem            | Bottom right | Badge: WhatsApp/E-com/Indicação/Google           |
| Vendedor (mini)   | Bottom right | Avatar pequeno + iniciais                        |
| Indicador de drag | Hover        | Cursor muda; visual destacado                    |

### Filtros

- Estágio (multi-select — útil só na lista; no Kanban todos visíveis)
- Temperatura (multi-select)
- Origem (multi-select)
- Vendedor (multi-select — Vendedor locked em si mesmo)
- Próxima ação (atrasada / hoje / esta semana / qualquer)
- Período de criação (últimas 24h, 7d, 30d, qualquer)
- Faixa de valor estimado
- Loja (Owner only)
- Busca textual (nome, telefone)

### Conversão de lead → cliente

Fluxo do estágio "Convertido":

1. Vendedor clica em card de lead → abre detalhe
2. Lead chega ao estágio "Convertido" (drag para coluna OU botão "Marcar como convertido")
3. Modal `<ConvertLeadModal>`:
   - Pré-preenche campos básicos do cliente (nome, telefone, email)
   - Vendedor escolhe tipo: B2B ou B2C
   - Se B2B: pede CNPJ, razão social, nome fantasia
   - Se B2C: pede CPF
   - Vendedor responsável: locked no próprio (ou Gestor escolhe)
4. Ao confirmar:
   - Cria `ICustomer` com todos os dados informados
   - `ICustomer.convertedFromLeadId = lead.id` (para badge histórico pré-conversão)
   - `ILead.convertedToCustomerId = customer.id`
   - `ILead.stage = 'Convertido'`
   - Audit log de conversão
   - Conversas vinculadas ao lead permanecem vinculadas (Tab Conversas da ficha mostra)
   - Navega para a ficha do cliente recém-criado

### Marcar como perdido

Fluxo:

1. Drag para coluna "Convertido / Perdido" abre modal pedindo: "Convertido ou Perdido?"
2. Se Perdido:
   - Dropdown obrigatório de **motivo da perda** (taxonomia configurada em `IPlatformSettings.lossReasons` via PRD-019; defaults: "Preço alto", "Comprou de concorrente", "Não respondeu", "Sem necessidade", "Outro")
   - Campo opcional `lossNotes` (detalhe livre)
   - Audit log da perda

### Próxima ação prevista

Vendedor define `nextActionAt`:

- Campo "Próxima ação" na ficha do lead com botão de date picker
- Exibido no card: "📅 amanhã" (verde se futuro), "📅 hoje" (amarelo), "📅 atrasada" (vermelho)
- Filtro "Próxima ação" permite encontrar atrasadas rapidamente

### Histórico de conversas no lead

Cada `ILead.conversations: ID[]` lista as conversas vinculadas. Tab "Conversas" do detalhe do lead lista todas — pré e pós conversão (se aplicável; mas pós só faz sentido durante o lead, depois passa a ser do customer).

### Métricas no Kanban

Acima de cada coluna, indicador:

- Quantidade total na coluna
- Tempo médio que leads ficam nesse estágio (em dias)

Ex:

- **Novo (8)** — Tempo médio: 1.2 dias
- **Em qualificação (12)** — Tempo médio: 4.5 dias
- **Orçamento enviado (6)** — Tempo médio: 7.3 dias

Calculado via:

- Para leads ainda no estágio: `now - lastStageChangeAt`
- Para leads já saíram: `nextStageEnterAt - thisStageEnterAt`

Métricas globais no header:

- Taxa de conversão (% leads convertidos no período / total criados)
- Tempo médio total (Novo → Convertido)
- Valor médio convertido

### Criar lead manual

Botão "+ Lead" no header abre `<NewLeadModal>`:

- Nome (texto, obrigatório)
- Telefone (obrigatório)
- Email (opcional)
- Origem (dropdown obrigatório)
- Valor estimado (opcional)
- Vendedor responsável (Vendedor locked em si; Owner/Gestor escolhe)
- Estágio inicial: "Novo" default; pode escolher outro
- Próxima ação (opcional)

### Integração com inbox (PRD-010)

Quando uma conversa entra no sistema com `leadId` (não `customerId`):

- Lead aparece automaticamente no Kanban no estágio "Novo"
- Inbox mostra essa conversa com badge especial "Lead" + temperatura
- Vendedor pode trabalhar a conversa e ir mudando o estágio do lead conforme avança

### Configurações via PRD-019

- Estágios podem ser adicionados/removidos pelo Owner
- Cores e ordem editáveis
- Motivos de perda editáveis

No MVP, defaults garantem operação; PRD-019 fica como esqueleto navegável.

### Alternativas Consideradas

| Alternativa                                              | Por que foi descartada                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Pipeline complexo com múltiplos sub-estágios             | GALLO precisa de leve — 5 estágios cobrem 90%                                          |
| Sem temperatura — só estágio                             | Temperatura captura nuance que estágio não capta ("está em qualificação mas é quente") |
| Sem origem rastreável                                    | Não saber de onde vem o lead bloqueia análise de canal (Google Ads vale a pena?)       |
| Conversão sem preservar lead                             | Memória se perde; badge pré-conversão é diferencial                                    |
| Sem motivo de perda                                      | Aprender com perdas é central — sem taxonomia, vira "perdi e pronto"                   |
| Sem métricas no Kanban                                   | Sem ver "gargalo aqui", gestão não age                                                 |
| Drag-and-drop manual obrigatório (sem botão alternativo) | Touch em tablet pode falhar; oferecer ambos                                            |

**Decisão consolidada:** **Kanban com 5 colunas + lista alternativa, temperatura como dimensão paralela ao estágio, conversão preserva memória via `convertedFromLeadId`, motivos de perda taxonomizados, métricas integradas, drag-and-drop com alternativa via menu.**

---

## Escopo

### Incluído

- ✅ Rota `/app/leads` substituindo placeholder do PRD-003 — Kanban default
- ✅ Toggle Kanban/Lista persistido em URL
- ✅ Kanban com 5 colunas configuráveis + drag-and-drop entre estágios
- ✅ Lista alternativa com colunas configuráveis (similar PRD-015)
- ✅ Card do lead com nome, telefone, temperatura, valor estimado, próxima ação, origem, vendedor
- ✅ Filtros: estágio, temperatura, origem, vendedor, próxima ação, período, valor estimado, loja
- ✅ Busca textual em nome/telefone com debounce
- ✅ Modal `<NewLeadModal>` para criação manual
- ✅ Detalhe do lead em `/app/leads/:id` com:
  - Header (nome, telefone, badges, ações)
  - Card de dados (origem, valor, próxima ação editáveis)
  - Tab Conversas (histórico vinculado)
  - Tab Notas
  - Tab Histórico (mudanças de estágio com timestamps)
- ✅ Modal `<ConvertLeadModal>` para conversão lead → customer
- ✅ Modal `<MarkAsLostModal>` para perda com motivo taxonomizado
- ✅ Métricas no header do Kanban (totais, tempo médio, taxa de conversão)
- ✅ Métricas por coluna (quantidade, tempo médio no estágio)
- ✅ Próxima ação com indicador visual (verde/amarelo/vermelho conforme proximidade)
- ✅ Integração com inbox (PRD-010): conversas com `leadId` mostram badge "Lead" + temperatura
- ✅ Integração com ficha (PRD-012): customer convertido tem badge "Histórico pré-conversão" + tab Conversas com mensagens antigas
- ✅ Configurações (defaults) de estágios e motivos de perda em `IPlatformSettings`
- ✅ Audit log em todas as mutações (mudança de estágio, conversão, perda, edições)
- ✅ Permissões: Vendedor vê leads atribuídos; Gestor vê loja; Owner cross-store

### Excluído

- ❌ Editor visual de estágios na UI — Fase 2 (placeholder no PRD-019)
- ❌ Atribuição automática de próxima ação via IA — Fase 2
- ❌ Sugestões automáticas de motivo de perda baseadas em conversa — Fase 2
- ❌ Notificações por email/SMS quando lead atrasa — Fase 2
- ❌ Pipeline multi-funil (lead pode estar em N funis) — fora do MVP
- ❌ Forecasting de pipeline (previsão de fechamento) — Fase 2
- ❌ Importação de leads via CSV — Fase 2
- ❌ Webhooks externos para criar leads (Facebook Ads, Google Forms) — Fase 2
- ❌ Score automático de lead — Fase 2
- ❌ Histórico de proposta valor estimado — fora do MVP (apenas atual)

---

## Requisitos Funcionais

### Página e modos de visualização

- **RF-001:** Substituir placeholder `/app/leads` (PRD-003) por `LeadsPage` em `src/features/leads/pages/`.
- **RF-002:** Toggle Kanban/Lista no header; modo persistido em URL (`?view=kanban|list`).
- **RF-003:** Default: Kanban.
- **RF-004:** Header com contador "X leads ativos" (não inclui convertidos/perdidos), toggle de view, filtros, busca, botão "+ Lead".

### Kanban

- **RF-005:** Implementar `<LeadsKanban>` com 5 colunas correspondentes aos estágios (padrão; configurável via `IPlatformSettings.pipelineStages`).
- **RF-006:** Cada coluna é scroll-vertical independente; suporta dezenas de cards.
- **RF-007:** Drag-and-drop entre colunas usando `@dnd-kit/sortable` (já instalado pelo PRD-013).
- **RF-008:** Drop em coluna diferente:
  - Se coluna ≠ "Convertido/Perdido": atualiza `stage` + audit log + UI reflete imediatamente
  - Se coluna = "Convertido/Perdido": abre modal "Convertido ou Perdido?" antes de confirmar
- **RF-009:** Card do lead com elementos especificados em "Conceito da Solução > Card do lead".
- **RF-010:** Cores das colunas conforme paleta institucional GALLO (PRD-001) — usar cores semânticas, não as submarcas.

### Lista

- **RF-011:** Implementar `<LeadsList>` com tabela paginada similar ao PRD-015.
- **RF-012:** Colunas obrigatórias: nome, telefone, estágio (badge), temperatura, origem, valor estimado, vendedor, próxima ação, dias no estágio.
- **RF-013:** Ordenação por qualquer coluna; filtros como no Kanban; paginação 50/página.

### Filtros

- **RF-014:** Filtros disponíveis em ambos os modos:
  - Estágio (multi-select; relevante na Lista, escondido no Kanban)
  - Temperatura (multi-select)
  - Origem (multi-select)
  - Vendedor (multi-select; Vendedor locked em si)
  - Próxima ação (atrasada / hoje / esta semana / qualquer)
  - Período de criação (últimas 24h, 7d, 30d, personalizado)
  - Faixa de valor estimado
  - Loja (Owner only)
- **RF-015:** Busca textual em nome/telefone com debounce 300ms.
- **RF-016:** Filtros sincronizados em URL.

### Detalhe do lead

- **RF-017:** Criar `LeadDetailPage` em `/app/leads/:id`.
- **RF-018:** Header com nome, telefone, badge de estágio, badge de temperatura, botões (editar, marcar como convertido, marcar como perdido, criar orçamento).
- **RF-019:** Card "Dados do lead": origem, valor estimado (editável), próxima ação (editável com date picker), vendedor responsável, data de criação.
- **RF-020:** Tab "Conversas": histórico de conversas vinculadas (via `lead.conversations`).
- **RF-021:** Tab "Notas": cronológica, igual à da ficha (PRD-012).
- **RF-022:** Tab "Histórico": linha do tempo com mudanças de estágio (extraídas do audit log).

### Modal de conversão

- **RF-023:** Modal `<ConvertLeadModal>` abre via drop em "Convertido" OU botão "Marcar como convertido" no detalhe.
- **RF-024:** Modal contém:
  - Tipo (radio: B2B / B2C)
  - Se B2B: razão social, CNPJ, nome fantasia, contato principal
  - Se B2C: nome completo, CPF
  - Email (preenchido do lead se houver)
  - Vendedor responsável (locked no atual)
  - Endereço (opcional, pode completar depois na ficha)
- **RF-025:** Ao confirmar:
  - Criar `ICustomer` via `customersProvider.create()`
  - Setar `customer.convertedFromLeadId = lead.id`
  - Atualizar `lead.convertedToCustomerId = customer.id`
  - Atualizar `lead.stage = 'Convertido'`
  - Audit log de conversão
  - Manter `lead.conversations` (referências preservadas)
  - Toast: "Lead convertido em cliente!" + navegação para ficha do customer

### Modal de perda

- **RF-026:** Modal `<MarkAsLostModal>` abre via drop em "Perdido" OU botão "Marcar como perdido".
- **RF-027:** Campos:
  - **Motivo da perda** (dropdown obrigatório, opções via `IPlatformSettings.lossReasons`; defaults: Preço alto, Comprou de concorrente, Não respondeu, Sem necessidade, Outro)
  - **Notas adicionais** (textarea opcional)
- **RF-028:** Ao confirmar:
  - `lead.stage = 'Perdido'`
  - `lead.lossReason = motivo`
  - `lead.lossNotes = notas`
  - Audit log
  - Toast "Lead marcado como perdido"

### Próxima ação

- **RF-029:** Campo `nextActionAt` editável no detalhe via date picker.
- **RF-030:** Indicador visual no card e na lista:
  - Atrasada (`nextActionAt < now`): badge vermelho
  - Hoje: badge amarelo
  - Futura: badge verde
  - Sem ação: cinza com "Definir próxima ação"
- **RF-031:** Filtro "Próxima ação" permite achar rapidamente as atrasadas.

### Métricas

- **RF-032:** No Kanban, cada coluna mostra acima do título:
  - Quantidade (ex: "12")
  - Tempo médio no estágio em dias (ex: "Média: 4.5 dias")
- **RF-033:** Cálculo:
  - Para leads ainda no estágio: `(now - lastStageChangeTimestamp) / days`
  - Para leads que passaram: extraído do audit log (timestamp de entrada e saída)
  - Média = soma / contagem
- **RF-034:** No header do Kanban, métricas globais:
  - Taxa de conversão: `(convertidos no período / total criados no período) × 100`
  - Tempo médio total: média de tempo desde criação até "Convertido"
  - Valor médio convertido: média de `estimatedValue` de leads convertidos

### Criar lead manual

- **RF-035:** Botão "+ Lead" abre `<NewLeadModal>`.
- **RF-036:** Modal com:
  - Nome (obrigatório)
  - Telefone (obrigatório, validação básica)
  - Email (opcional)
  - Origem (dropdown obrigatório)
  - Valor estimado (opcional)
  - Vendedor responsável (Vendedor locked; Owner/Gestor escolhe)
  - Estágio inicial (dropdown, default "Novo")
  - Próxima ação (date picker, opcional)
- **RF-037:** Ao salvar: criar `ILead` com `createdAt = now`, `lastInteractionAt = now`, navegar para `/app/leads/:id`.

### Integração com inbox (PRD-010)

- **RF-038:** Quando uma conversa com `leadId` aparece na inbox, mostrar:
  - Badge "Lead" próximo ao nome
  - Temperatura ao lado: 🔵/🟡/🔴
  - Tooltip ao hover: "Lead no estágio [Estágio atual]"
- **RF-039:** Clique no badge "Lead" navega para `/app/leads/:id`.

### Integração com ficha (PRD-012)

- **RF-040:** PRD-012 já especifica: customer com `convertedFromLeadId` mostra badge "Histórico pré-conversão". Este PRD garante que as conversas pré-conversão são preservadas e aparecem na Tab Conversas com banner sutil "Anterior à conversão (lead frio em jan/2026)".
- **RF-041:** Click no badge "Histórico pré-conversão" abre Popover com data de criação como lead, dias até conversão, quem converteu.

### Permissões

- **RF-042:** **Vendedor**: lista apenas leads atribuídos a si; pode criar/editar/converter próprios; não vê filtro Loja.
- **RF-043:** **Gestor**: vê leads da loja; transfere leads entre vendedores; aprova exceções; cria leads atribuindo a qualquer vendedor da loja.
- **RF-044:** **Owner**: cross-store; tudo.
- **RF-045:** **SDR**: pode criar leads (origem `whatsapp`); pode atualizar para Em Qualificação; não converte (delega para humano).

### Audit log

- **RF-046:** Audit em todas mutations:
  - Criação de lead
  - Mudança de estágio (com `before/after`)
  - Edição de campos (valor estimado, próxima ação, temperatura)
  - Conversão (gera 2 entries: lead converted + customer created)
  - Perda (com motivo)
  - Transferência de vendedor

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Kanban com 80 leads renderiza em < 350ms; drag-and-drop fluido 60fps.
- **RNF-002 (Acessibilidade):** WCAG 2.1 AA; drag-and-drop tem alternativa via teclado (espaço para "pegar", setas para mover, espaço para "soltar"); cards têm `aria-label`.
- **RNF-003 (Responsividade):** Mobile usável; Kanban com scroll horizontal entre colunas; em < 768px, default vira Lista.
- **RNF-004 (Tipagem):** Zero `any`; tipos `ILead`, `ILeadStage` respeitados.
- **RNF-005 (Memorização):** Cálculos de métricas (tempo médio, taxa conversão) memoizados; recalculam apenas quando dados-fonte mudam.

---

## Critérios de Aceitação

### Kanban e drag-and-drop

```gherkin
DADO que estou em /app/leads (Kanban default)
QUANDO arrasto um lead da coluna "Novo" para "Em qualificação"
ENTÃO o lead vira da coluna nova
  E lead.stage atualiza para "Em qualificação"
  E audit log é criado
  E cor visual da temperatura do card é preservada

DADO que arrasto um lead para "Convertido/Perdido"
QUANDO o drop processa
ENTÃO modal "Convertido ou Perdido?" abre
  E se escolho "Convertido", modal de conversão segue
  E se escolho "Perdido", modal de perda segue com motivo obrigatório

DADO que cancelo o modal de conversão
QUANDO fecho sem confirmar
ENTÃO lead volta ao estágio anterior (drop é revertido)
```

### Lista alternativa

```gherkin
DADO que clico no toggle "Lista"
QUANDO a view muda
ENTÃO vejo tabela com todas as colunas
  E URL atualiza para ?view=list
  E recarregar mantém modo lista

DADO que ordeno por "Dias no estágio" descendente
QUANDO a ordenação aplica
ENTÃO leads parados há mais tempo aparecem no topo
```

### Conversão

```gherkin
DADO um lead "João Silva" no estágio "Em negociação"
QUANDO clico "Marcar como convertido" e preencho B2C + CPF
ENTÃO ICustomer é criado com convertedFromLeadId = lead.id
  E ILead recebe convertedToCustomerId = customer.id
  E lead.stage = "Convertido"
  E sou navegado para /app/clientes/:novoCustomerId
  E badge "Histórico pré-conversão" aparece no header da ficha (PRD-012)
  E conversas antigas do lead aparecem na tab Conversas
```

### Perda

```gherkin
DADO que arrasto lead para "Perdido"
QUANDO modal abre
ENTÃO motivo é obrigatório
  E posso adicionar notas opcionais

DADO que confirmo perda com motivo "Preço alto"
QUANDO ação processa
ENTÃO lead.stage = "Perdido", lead.lossReason = "Preço alto"
  E lead some das colunas ativas (mas filtro "Perdido" mostra)
  E audit log registra
```

### Próxima ação

```gherkin
DADO um lead com nextActionAt = ontem
QUANDO observo o card no Kanban
ENTÃO badge "📅 atrasada" em vermelho

DADO nextActionAt = amanhã
QUANDO observo o card
ENTÃO badge "📅 amanhã" em verde

DADO filtro "Próxima ação = Atrasadas"
QUANDO aplico
ENTÃO Kanban mostra apenas leads com nextActionAt < now
```

### Métricas

```gherkin
DADO 30 leads no pipeline
  E 8 convertidos nos últimos 30 dias dos 50 criados
QUANDO observo header do Kanban
ENTÃO vejo "Taxa de conversão: 16%"
  E vejo "Tempo médio total: X dias"

DADO coluna "Em qualificação" com 12 leads
  E média de 4.5 dias por lead
QUANDO observo header da coluna
ENTÃO vejo "12 leads — Média: 4.5 dias"
```

### Integração com inbox

```gherkin
DADO uma conversa com leadId="abc"
QUANDO observo na inbox
ENTÃO vejo o lead com badge "Lead" + indicador de temperatura
  E clicar no badge navega para /app/leads/abc
```

### Cenários de erro

```gherkin
DADO que tento converter lead sem informar tipo (B2B/B2C)
QUANDO submeto modal
ENTÃO validação inline: "Selecione o tipo"

DADO que tento marcar perdido sem motivo
QUANDO submeto modal
ENTÃO validação inline: "Motivo é obrigatório"

DADO que drag-and-drop é interrompido por scroll mobile
QUANDO o drop é cancelado
ENTÃO lead permanece no estágio original sem alteração
```

---

## Fases de Implementação

| Fase | Objetivo                                             | Arquivos Estimados |
| ---- | ---------------------------------------------------- | ------------------ |
| 1    | Kanban com cards estáticos + drag-and-drop básico    | 5-6                |
| 2    | Modo Lista + filtros + busca + URL sync              | 5-6                |
| 3    | Detalhe do lead (3 tabs) + criação manual            | 5-6                |
| 4    | Modais de conversão e perda + integração ficha/inbox | 4-5                |
| 5    | Métricas, próxima ação visual, polish                | 3-4                |

### Detalhamento das Fases

#### Fase 1: Kanban Base

**Objetivo:** visualização Kanban funcional com drag

**Ações:**

- [ ] Criar `LeadsPage` e `<LeadsKanban>` em `src/features/leads/`
- [ ] 5 colunas conforme `IPlatformSettings.pipelineStages`
- [ ] Card `<LeadCard>` com todos os elementos
- [ ] Drag-and-drop via `@dnd-kit/sortable`
- [ ] Atualizar stage via `leadsProvider.update()` no drop

**Validação:** arrastar leads entre colunas funciona; audit log gerado.

#### Fase 2: Lista, Filtros, Busca

**Objetivo:** visão alternativa em tabela + filtros completos

**Ações:**

- [ ] Implementar `<LeadsList>` (similar a PRD-015 estrutura)
- [ ] Toggle Kanban/Lista no header
- [ ] 8 filtros + busca textual com debounce
- [ ] URL sync de view, filtros, ordenação, página
- [ ] Empty states contextuais

**Validação:** toggle troca de view; URL preserva estado; filtros combinam.

#### Fase 3: Detalhe e Criação

**Objetivo:** drill-down e criação manual

**Ações:**

- [ ] `LeadDetailPage` em `/app/leads/:id`
- [ ] Tabs: Conversas, Notas, Histórico
- [ ] Card de dados editáveis (valor estimado, próxima ação, temperatura, vendedor)
- [ ] Modal `<NewLeadModal>` para criação

**Validação:** detalhe completo; criação manual flui para o detalhe.

#### Fase 4: Conversão, Perda, Integrações

**Objetivo:** ciclo completo do lead

**Ações:**

- [ ] Modal `<ConvertLeadModal>` com discriminated B2B/B2C
- [ ] Modal `<MarkAsLostModal>` com motivo
- [ ] Integração com inbox (PRD-010): badge "Lead" + temperatura
- [ ] Integração com ficha (PRD-012): badge "Histórico pré-conversão"
- [ ] Audit log em conversão e perda

**Validação:** lead vira customer com memória preservada; perda exige motivo.

#### Fase 5: Métricas, Próxima Ação, Polish

**Objetivo:** indicadores e detalhes finais

**Ações:**

- [ ] Métricas por coluna (quantidade, tempo médio)
- [ ] Métricas globais no header (taxa, tempo total, valor médio)
- [ ] Indicador visual da próxima ação (verde/amarelo/vermelho)
- [ ] Date picker para próxima ação
- [ ] Mobile: Kanban com scroll horizontal ou fallback para Lista
- [ ] Acessibilidade do drag (alternativa por teclado)

**Validação:** métricas corretas; UI responsiva; acessibilidade.

---

## Dependências

### PRDs Anteriores

| PRD                                   | Status      |
| ------------------------------------- | ----------- |
| PRD-002 (modelo ILead)                | 📝 Redigido |
| PRD-003 (Shell)                       | 📝 Redigido |
| PRD-005 (Provider)                    | 📝 Redigido |
| PRD-006 (RBAC)                        | 📝 Redigido |
| PRD-010 (Inbox — badge "Lead")        | 📝 Redigido |
| PRD-012 (Ficha — badge pré-conversão) | 📝 Redigido |
| PRD-013 (`@dnd-kit` já instalado)     | 📝 Redigido |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

| Ordem | PRD          | Status       |
| ----- | ------------ | ------------ |
| 1-7   | PRDs 010-016 | 📝           |
| **8** | **PRD-017**  | **🔄 ATUAL** |
| 9-10  | PRDs 018-019 | ⏳           |

---

## Considerações de Segurança

### Privacidade dos leads

Leads contêm PII (nome, telefone, email). Acesso filtrado por carteira (Vendedor só vê seus); Gestor/Owner veem mais. Audit log registra acessos sensíveis.

### Memória preservada na conversão

`convertedFromLeadId` mantém histórico — não deletar lead após conversão; transformar em registro arquivado linkado ao customer.

### Motivos de perda anonimizáveis

Para análise estatística futura (Fase 2 BI), motivos podem ser agregados sem PII. Conteúdo de `lossNotes` pode conter PII e precisa ser tratado conforme LGPD.

---

## Fluxos de Usuário

### Fluxo Principal — Vendedor trabalha um lead até conversão

1. Carlos abre `/app/leads` (Kanban)
2. Identifica lead "Frota Express" em "Em qualificação" há 6 dias (>> média)
3. Abre detalhe, vê conversas anteriores
4. Atualiza próxima ação para amanhã
5. Liga para o cliente, esclarece, envia orçamento via PRD-031
6. Move lead para "Orçamento enviado" via drag
7. 2 dias depois, cliente fecha. Carlos arrasta para "Convertido"
8. Modal de conversão: preenche B2B com CNPJ
9. Customer criado, ficha aberta com badge "Histórico pré-conversão"

### Fluxo Alternativo — Lead se perde

1. Marina (Gestor) vê 5 leads em "Em negociação" há > 14 dias
2. Investiga, confirma com vendedores que esses não vão fechar
3. Arrasta para "Perdido"
4. Para cada: seleciona motivo "Comprou de concorrente"
5. Adiciona notas com detalhes
6. Audit log registra; futuramente análise estatística mostra impacto

### Fluxo Mobile

1. Vendedor abre `/app/leads` no celular (viewport < 768px)
2. Default cai em Lista (Kanban é apertado em mobile)
3. Toca em lead → detalhe em tela cheia
4. Atualiza estágio via dropdown (não drag em mobile)

---

## Convenções de Código (Referência Rápida)

| Elemento        | Convenção            | Exemplo                                                 |
| --------------- | -------------------- | ------------------------------------------------------- |
| **Página**      | PascalCase + `Page`  | `LeadsPage`, `LeadDetailPage`                           |
| **Componentes** | PascalCase           | `<LeadsKanban>`, `<LeadCard>`, `<ConvertLeadModal>`     |
| **Hooks**       | camelCase + `use`    | `useLeadsKanban`, `useLeadMetrics`                      |
| **Pasta**       | kebab-case           | `leads/`                                                |
| **Git commits** | Conventional Commits | `feat(leads): add kanban pipeline with conversion flow` |

---

## Notas para o Agente Desenvolvedor

### Princípios

| Princípio                                | Descrição                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| **Pipeline leve, não complexo**          | 5 estágios, temperatura, origem, motivo de perda — não criar campos extras         |
| **Memória preservada na conversão**      | `convertedFromLeadId` é central; sem ele, badge histórico-pré-conversão impossível |
| **Drag-and-drop com alternativa**        | Acessibilidade exige teclado; mobile pede dropdown                                 |
| **Motivos de perda taxonomizados**       | Texto livre vira ruído; dropdown obrigatório com taxonomia                         |
| **Métricas integradas**                  | Tempo em estágio, taxa de conversão — alimentam PRD-014                            |
| **Integração natural com inbox e ficha** | Lead não é silo — costura toda a jornada                                           |

### O que NÃO Fazer

| ❌ Evitar                                                       |
| --------------------------------------------------------------- |
| Permitir conversão sem CNPJ/CPF preenchido                      |
| Deletar lead após conversão (perde memória)                     |
| Permitir perda sem motivo                                       |
| Esquecer audit log em mudanças de estágio                       |
| Drag-and-drop sem alternativa de teclado                        |
| Esquecer integração com inbox (badge "Lead")                    |
| Esquecer badge "Histórico pré-conversão" no customer convertido |
| Criar estágios customizados na UI sem passar por PRD-019        |
| Permitir Vendedor ver leads de outro Vendedor (sem permissão)   |
| Implementar forecasting de pipeline aqui — Fase 2               |

---

## Status de Implementação

| Campo      | Valor       |
| ---------- | ----------- |
| **Status** | ⏳ PENDENTE |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                                |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — pipeline Kanban + Lista com 5 estágios, temperatura, conversão com memória, motivos taxonomizados, métricas integradas |

---

**AILA - Sistemas Inteligentes**
