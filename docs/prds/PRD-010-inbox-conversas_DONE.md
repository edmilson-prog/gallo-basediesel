# PRD-010: Inbox Unificado e Lista de Conversas

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                  |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                       |
| **Objetivo**          | Construir a coluna esquerda do `ConversationLayout` — a "central de comando" do atendimento, onde vendedores e SDR vêem todas as conversas ativas, filtram, priorizam e selecionam o que atender                          |
| **Tipo**              | Feature                                                                                                                                                                                                                   |
| **Complexidade**      | Alta                                                                                                                                                                                                                      |
| **Total de Fases**    | 5                                                                                                                                                                                                                         |
| **Prioridade**        | Alta                                                                                                                                                                                                                      |
| **Épico**             | Bloco 1 — Central de Atendimento e CRM                                                                                                                                                                                    |
| **PRDs Relacionados** | PRD-003 (Shell), PRD-005 (Provider Pattern), PRD-006 (RBAC), PRD-007 (Multi-Loja), PRD-011 (Conversa), PRD-012 (Ficha), PRD-013 (Distribuição), PRD-014 (Painel Gestor)                                                   |
| **Implementação**     | 🔵 Claude Code CLI (sobre o scaffold do Lovable)                                                                                                                                                                          |
| **Padrão de código**  | Feature-based; código em `src/features/conversations/`; hooks em `src/features/conversations/hooks/`; componentes em `src/features/conversations/components/`; página em `src/features/conversations/pages/InboxPage.tsx` |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios                                                       |
| ------------ | --------------------------------------------------------------- |
| **Baixa**    | 1 arquivo, sem dependências externas, < 100 linhas              |
| **Média**    | 2-5 arquivos, banco OU integração, funcionalidade isolada       |
| **Alta**     | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** lista paginada com 80+ conversas mockadas, 5 filtros combinados (status, canal, atribuição, tags, busca textual), 3 ordenações disponíveis, atualização simulada em tempo real (chegada de novas mensagens), badges de status/canal/provider/SDR, contador global de não-lidas, integração com filtragem RBAC (Vendedor vê só sua atribuição, Gestor vê tudo da loja), preparação para integração com WhatsApp providers (Fase 2), e impacto em toda a coluna esquerda do `ConversationLayout` que será consumida diariamente por todos os operadores.

---

## Contexto do Problema

O vendedor da GALLO BASE DIESEL passa horas por dia atendendo clientes pelo WhatsApp. Hoje, sem a plataforma, ele opera dentro do app WhatsApp Business — vê as conversas em ordem cronológica, sem priorização, sem distinção entre cliente da carteira e cliente novo, sem filtro por canal, sem visão de quantas conversas estão "aguardando há muito tempo". O resultado: clientes esquecidos por 2 dias, prioridades inversas (responde primeiro o cliente que conversa mais, não o de maior valor), e zero visibilidade gerencial.

Para o gestor é pior: ele depende do que o vendedor reporta. Não consegue ver "quantas conversas estão aguardando agora?", "quem está há mais tempo sem resposta?", "qual o tempo médio de primeira resposta este mês?". Esses números são fundamentais para gestão comercial mas hoje estão inacessíveis.

Três problemas concretos que o PRD-010 resolve:

**Falta de priorização inteligente.** O vendedor abre o app e vê uma lista mas não sabe por onde começar. Cliente A da curva ABC com dúvida de R$ 50k aparece misturado com B2C perguntando preço de filtro. Sem visualização por temperatura/valor/recência, a priorização é pelo "mais recente", que não é a mesma coisa que "mais importante". **Visibilidade gerencial zero.** Sem inbox como conceito de produto, o gestor não tem nenhuma tela de controle. PRD-014 (Painel do Gestor) depende de PRD-010 expor números que ele consome. **SDR e vendedor humano disputam o mesmo cliente.** Sem indicação clara de "isso aqui está sendo atendido pelo SDR" vs "isso aqui já escalou para humano", os dois podem responder simultaneamente, gerando confusão.

Este PRD entrega: lista paginada com 80+ conversas mockadas realistas, filtros combinados, ordenação por critério útil (não só "mais recente"), badges visuais que dão informação imediata, contadores globais visíveis no topo, atualização em tempo real simulada (a cada N segundos, uma nova mensagem chega), e a UX que o vendedor vai usar centenas de vezes por dia.

---

## Conceito da Solução

### Layout

A lista de conversas vive na **coluna esquerda do `ConversationLayout`** (PRD-003): largura fixa de 320px em desktop, ocupa toda a tela em mobile. Estrutura interna:

```
┌─────────────────────────────────────┐
│ Header (h: 56px)                    │
│  [Conversas] [Contador]   [Buscar]  │
├─────────────────────────────────────┤
│ Filtros (h: 48px)                   │
│  [Status▾] [Canal▾] [Atrib.▾] [⋮]  │
├─────────────────────────────────────┤
│ Lista paginada (scroll)             │
│  ┌─────────────────────────────────┐│
│  │ Avatar  Nome cliente       2h   ││
│  │         "Última mensagem..."  3 ││
│  │ [WA][SDR][quente]               ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ ...                              ││
│  └─────────────────────────────────┘│
│                                     │
└─────────────────────────────────────┘
```

### Conteúdo de cada item de conversa

| Elemento                   | Posição        | Conteúdo                                                                        |
| -------------------------- | -------------- | ------------------------------------------------------------------------------- |
| Avatar                     | Esquerda       | Foto do cliente/lead (ou iniciais)                                              |
| Nome                       | Topo           | Nome do cliente ou lead (ou "Lead anônimo" se sem nome ainda)                   |
| Timestamp                  | Direita topo   | Tempo relativo ("há 2 min", "há 1h", "ontem", "12/05")                          |
| Preview da última mensagem | Centro         | Texto truncado em 1-2 linhas (ou descrição se for mídia: "📎 Foto", "🎵 Áudio") |
| Badge de não-lidas         | Direita meio   | Círculo com número (limita em "9+")                                             |
| Badge de canal             | Bottom         | WhatsApp (verde), Site (azul), E-commerce (roxo), Telefone (laranja)            |
| Badge SDR ativo            | Bottom         | Quando `isSdrActive: true`, badge "🤖 SDR"                                      |
| Badge de temperatura       | Bottom         | Para leads: 🔵 frio / 🟡 morno / 🔴 quente                                      |
| Indicador status           | Borda esquerda | Faixa colorida: laranja (aguardando), verde (em andamento), cinza (resolvida)   |
| Item selecionado           | Background     | Destacado com cor `--accent` translúcida                                        |

### Filtros e ordenação

**Filtros (todos combináveis):**

1. **Status**: aguardando, em_andamento, aguardando_cliente, resolvida, arquivada
2. **Canal**: whatsapp, ecommerce, phone, site
3. **Atribuição**: "Atribuídas a mim", "Sem atribuição", "Todas" (Gestor/Owner only), "De um vendedor específico" (Gestor/Owner only)
4. **Tags do cliente**: multi-select baseado nas tags do `ICustomer.tags`
5. **Busca**: input que pesquisa em nome do cliente, telefone, conteúdo de mensagens recentes
6. **Período**: últimas 24h / últimos 7 dias / últimos 30 dias / personalizado

**Ordenações disponíveis:**

| Modo              | Critério                                                | Quando usar                              |
| ----------------- | ------------------------------------------------------- | ---------------------------------------- |
| Padrão (recência) | `lastMessageAt` desc                                    | Visão diária comum                       |
| Tempo de espera   | `lastMessageAt` asc filtrado por status `aguardando`    | "Quem está há mais tempo sem resposta?"  |
| Prioridade ABC    | `customer.abcClass` (A > B > C) + tiebreak por recência | Atender clientes de maior valor primeiro |

### Filtragem implícita por RBAC + Multi-Loja

A lista respeita automaticamente o scope do PRDs 006 e 007:

| Papel        | O que vê                                                                            |
| ------------ | ----------------------------------------------------------------------------------- |
| **Owner**    | Todas as conversas de todas as lojas (scope `all`)                                  |
| **Gestor**   | Conversas da loja ativa (`store`)                                                   |
| **Vendedor** | Apenas conversas atribuídas a ele (`own`)                                           |
| **SDR**      | Conversas onde `isSdrActive: true` ou aguardando atribuição (`own` + filtro de SDR) |

Filtragem é feita no provider via `withStoreScope` + filtro custom de `assignedSellerId`. Não é responsabilidade do componente.

### Atualização em tempo real (simulada)

O mock simula chegada de novas mensagens:

- Timer dispara a cada 8-15 segundos (variável aleatória)
- Seleciona conversa aleatória dentre as ativas
- Cria nova `IMessage` direção `in` no mock store
- Atualiza `lastMessageAt` e incrementa contador de não-lidas
- O Zustand re-emite, hooks reagem, componentes atualizam

No MVP, isso é puramente para demo realista. Na Fase 2, mesma UX será alimentada por subscription Supabase Realtime ou webhooks do WhatsApp provider.

### Real-time toggle (controle de demonstração)

Header da lista tem ícone discreto de "atualização em tempo real" (Iconify `mdi:radio-tower`):

- Ativo (default): timer rodando, novas mensagens chegam
- Desativado: timer pausado — útil para demos sem ruído

### Alternativas Consideradas

| Alternativa                                     | Por que foi descartada                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Lista infinita sem paginação                    | Performance ruim com 1000+ conversas (Fase 2); paginação preserva responsividade                             |
| Filtros embutidos no header (sem dropdown)      | Cresce demais em mobile; dropdown é mais compacto                                                            |
| Ordenação fixa por recência                     | Vendedor com 50 conversas precisa de critério útil para priorizar                                            |
| Empty state genérico                            | "Nada por aqui" não orienta o vendedor; empty state contextual ("Sem conversas em 'Aguardando'") é mais útil |
| Atualizar via polling de 30s                    | Polling acoplado ao provider real; mock simula direto via Zustand para ficar reativo                         |
| Mostrar todas as conversas inclusive arquivadas | Ruído visual; arquivadas só aparecem com filtro explícito                                                    |
| Drag-and-drop para mudar status                 | UX exige descoberta; melhor manter ações em menu contextual                                                  |

**Decisão consolidada:** **lista paginada de 30 itens por página, 5 filtros combinados, 3 modos de ordenação, badges densas em informação, atualização em tempo real simulada com toggle de demonstração.**

---

## Escopo

### Incluído

- ✅ Página `InboxPage` em `/app/atendimento` usando `ConversationLayout` (PRD-003)
- ✅ Lista paginada de conversas (30 por página) consumindo `useConversationsProvider()`
- ✅ Componente `<ConversationListItem>` com todas as informações: avatar, nome, timestamp, preview, badges (canal/SDR/temperatura/não-lidas), indicador de status
- ✅ Header da lista com contador global de não-lidas e total de conversas filtradas
- ✅ Input de busca textual (debounced 300ms) que pesquisa em nome, telefone, conteúdo de mensagens recentes
- ✅ 5 filtros combinados via dropdowns: status, canal, atribuição, tags, período
- ✅ 3 modos de ordenação (padrão, tempo de espera, prioridade ABC) via toggle
- ✅ Filtragem implícita por RBAC + Multi-Loja (sem código adicional na feature — via providers)
- ✅ Estado vazio contextual (mensagem muda conforme filtros aplicados)
- ✅ Atualização em tempo real simulada via Zustand + timer (8-15s)
- ✅ Toggle de real-time no header da lista
- ✅ Persistência de filtros e ordenação ativas na URL (query params)
- ✅ Persistência de "última conversa visualizada" no `localStorage` para retomar
- ✅ Click em item da lista navega para `/app/atendimento/:conversationId` ativando coluna central (PRD-011)
- ✅ Ações rápidas no hover de cada item: atribuir-me, transferir, arquivar (apenas Owner/Gestor podem transferir e arquivar)
- ✅ Indicador visual de "esta conversa está sob SDR" — quando `isSdrActive: true`, badge prominente
- ✅ Comportamento responsivo: em mobile, lista ocupa tela cheia; click em item navega para conversa em tela cheia
- ✅ Indicador de "novo!" ao lado de conversas com lastMessageAt < 60s
- ✅ Acessibilidade: navegação por teclado (↑↓ na lista, Enter para abrir, atalhos para filtros)

### Excluído

- ❌ Implementação real da conversa central (responsabilidade do PRD-011)
- ❌ Ficha do cliente (responsabilidade do PRD-012)
- ❌ Regras de distribuição automática de novas conversas (responsabilidade do PRD-013)
- ❌ Métricas agregadas (TMA, TMR, taxa de resolução) — responsabilidade do PRD-014
- ❌ Envio de mensagens via WhatsApp real — Fase 2 (PRDs 100-102)
- ❌ Notificações push (browser) ou desktop — Fase 2
- ❌ Sons de alerta para novas mensagens — fora do MVP (pode ser opção de Settings futura)
- ❌ Marcar mensagens como lidas em lote — fora do MVP
- ❌ Configurar respostas automáticas — pertence ao SDR (PRD-024)
- ❌ Inbox compartilhada multi-conta de WhatsApp consolidada com mensagens cross-account (chega na Fase 2 via PRDs 100-102)
- ❌ Pesquisa avançada com operadores (AND/OR/NOT) — busca simples
- ❌ Export de lista para CSV/Excel — fora do MVP

---

## Requisitos Funcionais

### Renderização da lista

- **RF-001:** Criar `InboxPage` em `src/features/conversations/pages/InboxPage.tsx`, rota `/app/atendimento`, usando `<ConversationLayout>` do PRD-003 com a lista renderizada na área esquerda.
- **RF-002:** A lista deve consumir `useConversationsProvider()` do PRD-005 chamando `list({ ...filters, page, pageSize: 30, orderBy, orderDir })`.
- **RF-003:** Renderizar cada conversa como `<ConversationListItem>` com avatar, nome, timestamp relativo, preview, badges e indicador de status conforme especificado na seção "Conteúdo de cada item".
- **RF-004:** Implementar paginação por scroll infinito: ao scrollar para perto do fim, carregar próxima página automaticamente. Indicador de "carregando..." enquanto fetch acontece.
- **RF-005:** Item selecionado (rota atual `/app/atendimento/:id`) deve ter destaque visual contínuo (background `--accent` com 12% opacidade).
- **RF-006:** Timestamp relativo deve atualizar a cada minuto para conversas recentes ("há 2 min" vira "há 3 min" sem reload).

### Filtros

- **RF-007:** Implementar dropdown de filtro **Status** com opções: Todas, Aguardando, Em andamento, Aguardando cliente, Resolvidas, Arquivadas. Default: "Todas exceto arquivadas".
- **RF-008:** Implementar dropdown de filtro **Canal** com opções: Todos, WhatsApp, E-commerce, Telefone, Site.
- **RF-009:** Implementar dropdown de filtro **Atribuição** contextual ao papel:
  - Vendedor: "Atribuídas a mim" (padrão único)
  - Owner/Gestor: "Todas", "Atribuídas a mim", "Sem atribuição", "Por vendedor específico" (sub-dropdown com lista)
- **RF-010:** Implementar dropdown de filtro **Tags** com multi-select listando tags do `ICustomer.tags` ordenadas alfabeticamente.
- **RF-011:** Implementar dropdown de filtro **Período**: 24h, 7d, 30d, "Personalizado" (abre date range picker do shadcn).
- **RF-012:** Implementar input de **busca** com debounce de 300ms; busca em `customer.name`, `customer.phone`, e nas últimas 20 mensagens de cada conversa (apenas conteúdo de texto).
- **RF-013:** Indicador visual de quantos filtros estão ativos (badge ao lado do ícone "⋮" ou "filter") com botão "Limpar tudo".

### Ordenação

- **RF-014:** Implementar toggle de ordenação com 3 modos: "Mais recentes" (default), "Tempo de espera", "Prioridade ABC".
- **RF-015:** Modo "Tempo de espera" filtra implicitamente por status `aguardando` e ordena `lastMessageAt` ascendente.
- **RF-016:** Modo "Prioridade ABC" requer join com `IABCClassification`; conversas de clientes A primeiro, depois B, depois C; tiebreak por `lastMessageAt` desc.
- **RF-017:** Ordenação ativa é refletida visualmente no toggle e descrita em texto pequeno: "Ordenado por: tempo de espera".

### Persistência de estado

- **RF-018:** Filtros e ordenação devem refletir em query params da URL (ex: `/app/atendimento?status=aguardando&canal=whatsapp&order=waiting`).
- **RF-019:** Ao recarregar a página com URL contendo filtros, o estado deve ser restaurado integralmente.
- **RF-020:** Hook `useLastSelectedConversation()` persiste em `localStorage` chave `gallo-last-conversation-id` o id da última conversa aberta — usado por outras features para "voltar onde estava".

### Atualização em tempo real (simulada)

- **RF-021:** Criar timer no `<MultistoreProvider>` ou em hook dedicado `useRealtimeConversations()` que dispara a cada 8-15s (random):
  - Seleciona uma conversa aleatória ativa (status `em_andamento` ou `aguardando_cliente`)
  - Gera nova `IMessage` direção `in` com texto plausível via Faker
  - Atualiza `lastMessageAt` e incrementa contador implícito de não-lidas
- **RF-022:** Header da lista deve ter toggle de real-time (ícone Iconify `mdi:radio-tower-variant`): ligado por default, clicar pausa o timer; estado persiste em `localStorage` chave `gallo-realtime-enabled`.
- **RF-023:** Quando real-time está pausado, badge sutil indica "Atualização pausada".

### Ações rápidas (hover)

- **RF-024:** Ao passar mouse sobre item, mostrar 3 botões discretos no canto direito:
  - **Atribuir-me** (apenas se não está atribuído ao user atual e user tem `create` em conversation com scope adequado)
  - **Transferir** (apenas Owner/Gestor; abre dropdown com lista de vendedores)
  - **Arquivar** (apenas Owner/Gestor; muda status para `arquivada`)
- **RF-025:** Em mobile (hover não funciona), botões aparecem ao long-press (500ms) abrindo bottom sheet com as ações.
- **RF-026:** Toda ação rápida deve mostrar `<Toast>` confirmando ("Conversa atribuída a você", "Conversa transferida para Marina", "Conversa arquivada"). Botão "Desfazer" no toast por 5s.

### Empty state contextual

- **RF-027:** Quando lista filtrada retorna 0 itens, mostrar `<EmptyState>` com:
  - Sem filtro nenhum: "Você ainda não tem conversas. Quando algum cliente entrar em contato, aparecerá aqui."
  - Com filtros aplicados: "Nenhuma conversa corresponde aos filtros aplicados." + botão "Limpar filtros"
  - Com busca textual: "Nenhuma conversa encontrada para '[termo]'."

### Badges e indicadores

- **RF-028:** Implementar badge de canal usando Iconify (`mdi:whatsapp` verde, `mdi:cart` roxo para ecommerce, `mdi:phone` laranja, `mdi:web` azul) com cor de fundo translúcida.
- **RF-029:** Badge "SDR ativo" usa ícone `mdi:robot` com background `--accent` quando `isSdrActive: true`. Tooltip ao hover: "Esta conversa está sendo atendida pelo agente SDR".
- **RF-030:** Badge de temperatura para conversas vinculadas a leads (não customers): 🔵 (frio) / 🟡 (morno) / 🔴 (quente). Cores baseadas em union literal de `ILead.temperature`.
- **RF-031:** Badge "Novo!" verde aparece próximo ao timestamp quando `Date.now() - lastMessageAt < 60000` (1 minuto).
- **RF-032:** Indicador de status (faixa colorida na borda esquerda do item, 3px): laranja (aguardando), verde (em_andamento), azul claro (aguardando_cliente), cinza (resolvida), transparente (arquivada).
- **RF-033:** Contador de não-lidas é simulado: cada conversa com `lastMessageAt` mais recente que a última visualização do user atual conta como não-lida. No MVP, persistir em `localStorage` chave `gallo-conversation-last-view-{userId}-{conversationId}`.

### Responsividade

- **RF-034:** Em viewport ≥ 1024px: lista ocupa coluna fixa de 320px na esquerda do `ConversationLayout`.
- **RF-035:** Em viewport 768-1023px: lista ocupa 280px; ficha do cliente vira drawer (PRD-012).
- **RF-036:** Em viewport < 768px: lista ocupa toda a tela; ao clicar em item, navega para `/app/atendimento/:id` exibindo apenas a conversa (PRD-011) com botão "voltar" para retornar à lista.

### Performance e acessibilidade

- **RF-037:** Virtual scroll para listas com > 100 itens (usar `@tanstack/react-virtual` ou similar) para manter performance.
- **RF-038:** Navegação por teclado: setas ↑↓ movem seleção; Enter abre conversa; / focaliza busca; F abre filtros; R alterna ordenação.
- **RF-039:** Cada `<ConversationListItem>` deve ter `role="button"` + `aria-label` descritivo: "Conversa com [Nome], última mensagem [tempo relativo], [N] não lidas".
- **RF-040:** Foco visível em itens da lista respeitando o focus ring do tema ativo (PRD-001).

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Lista com 80 conversas mockadas deve renderizar inicial em < 200ms; scroll fluido 60fps.
- **RNF-002 (Real-time):** Nova mensagem simulada deve refletir na UI em < 100ms após ser gerada no mock store.
- **RNF-003 (Persistência):** Filtros, ordenação e estado de real-time devem sobreviver a refresh sem perda.
- **RNF-004 (Acessibilidade):** WCAG 2.1 AA em todos os componentes; navegação por teclado completa.
- **RNF-005 (Responsividade):** Funcional e legível em viewports de 360px a 1920px.
- **RNF-006 (Internacionalização preparada):** Strings em arquivos separados (`pt-BR.json`) para facilitar adição de outros idiomas na Fase 2; no MVP, apenas português.
- **RNF-007 (Tipagem):** Zero `any`; todas as props tipadas; uso correto de `IConversation` do PRD-002.

---

## Critérios de Aceitação

### Renderização e paginação

```gherkin
DADO que estou em /app/atendimento como Vendedor (Carlos Santos)
QUANDO a página carrega
ENTÃO vejo a lista de conversas atribuídas a mim (filtragem implícita)
  E vejo 30 conversas inicialmente
  E ao scrollar para o fim, carrega mais 30 automaticamente

DADO que sou Owner
QUANDO acesso /app/atendimento
ENTÃO vejo todas as conversas da loja ativa (não apenas atribuídas a mim)
  E o filtro de atribuição mostra opções extras: "Sem atribuição", "Por vendedor específico"
```

### Filtros

```gherkin
DADO que estou na inbox com lista cheia
QUANDO aplico filtro Status="Aguardando" e Canal="WhatsApp"
ENTÃO a URL muda para incluir ?status=aguardando&canal=whatsapp
  E a lista refiltra mostrando apenas conversas que atendem ambas as condições
  E vejo indicação "2 filtros ativos"

DADO que tenho 3 filtros aplicados
QUANDO clico em "Limpar tudo"
ENTÃO a URL limpa os query params
  E a lista volta ao default (todas exceto arquivadas)

DADO que digito "Aurora" no campo de busca
QUANDO 300ms passam após a última tecla
ENTÃO a lista refiltra mostrando conversas com nome de cliente, telefone ou mensagens recentes contendo "Aurora"
  E vejo destaque visual do termo dentro do preview da mensagem
```

### Ordenação

```gherkin
DADO que clico no toggle de ordenação e seleciono "Tempo de espera"
QUANDO a ordenação aplica
ENTÃO a lista filtra implicitamente para status=aguardando
  E ordena ascendente por lastMessageAt (mais antigas primeiro)
  E o texto auxiliar mostra "Ordenado por: tempo de espera"

DADO que seleciono "Prioridade ABC"
QUANDO a ordenação aplica
ENTÃO conversas de clientes A aparecem primeiro
  E dentro de cada classe, ordenação secundária é lastMessageAt desc
```

### Atualização em tempo real

```gherkin
DADO que estou na inbox e real-time está ativo (default)
QUANDO 8-15 segundos passam
ENTÃO uma nova mensagem simulada é gerada em alguma conversa
  E a conversa que recebeu mensagem sobe para o topo (ordenação default)
  E o contador global de não-lidas incrementa
  E o item mostra "Novo!" badge por 60 segundos

DADO que desativo o toggle de real-time
QUANDO 30 segundos passam
ENTÃO nenhuma nova mensagem é gerada
  E o badge "Atualização pausada" aparece no header
  E estado persiste se eu recarregar a página
```

### Ações rápidas

```gherkin
DADO que sou Vendedor passando mouse sobre uma conversa sem atribuição
QUANDO os botões aparecem
ENTÃO vejo "Atribuir-me" e nada mais (não tenho permissão para transferir)
  E ao clicar "Atribuir-me", a conversa passa para mim
  E aparece toast "Conversa atribuída a você" com botão "Desfazer"

DADO que sou Gestor passando mouse sobre uma conversa qualquer
QUANDO os botões aparecem
ENTÃO vejo "Atribuir-me", "Transferir" e "Arquivar"
  E ao clicar "Transferir", dropdown lista todos vendedores da loja
  E selecionando um vendedor, a conversa muda assignedSellerId
  E auditLog é criado registrando a transferência
```

### Empty state

```gherkin
DADO que sou Vendedor recém-criado sem conversas atribuídas
QUANDO acesso /app/atendimento
ENTÃO vejo EmptyState com mensagem "Você ainda não tem conversas..."

DADO que aplico filtros que resultam em zero conversas
QUANDO a lista renderiza vazia
ENTÃO vejo EmptyState com texto adaptado aos filtros aplicados
  E vejo botão "Limpar filtros" para resetar
```

### Cenários de erro

```gherkin
DADO que provider falha (MockNetworkError simulado)
QUANDO useConversationsProvider().list() rejeita
ENTÃO mostra estado de erro com mensagem "Não foi possível carregar conversas"
  E botão "Tentar novamente" que refaz a chamada

DADO que ID de conversa na URL não existe mais (excluída)
QUANDO navego para /app/atendimento/id-invalido
ENTÃO a lista renderiza normalmente
  E o painel central mostra "Conversa não encontrada"
```

---

## Fases de Implementação

| Fase | Objetivo                                                     | Arquivos Estimados |
| ---- | ------------------------------------------------------------ | ------------------ |
| 1    | Estrutura, hook de listagem e item visual                    | 6-8                |
| 2    | Filtros, busca, ordenação com persistência na URL            | 6-8                |
| 3    | Atualização em tempo real simulada + toggle                  | 3-4                |
| 4    | Ações rápidas, badges, indicadores, empty states             | 5-6                |
| 5    | Responsividade, acessibilidade, performance (virtual scroll) | 3-4                |

### Detalhamento das Fases

#### Fase 1: Estrutura Base e Listagem

**Objetivo:** página navegável com lista paginada

**Ações:**

- [ ] Criar `src/features/conversations/pages/InboxPage.tsx` substituindo o placeholder do PRD-003
- [ ] Criar componente `<ConversationListItem>` em `src/features/conversations/components/`
- [ ] Criar hook `useConversationsList(filters)` que envolve `useConversationsProvider().list()` com paginação
- [ ] Implementar scroll infinito (IntersectionObserver na sentinela do fim)
- [ ] Renderizar item com avatar, nome, timestamp relativo (usar `date-fns` ou similar), preview, status

**Validação:** acessar `/app/atendimento` como Vendedor mostra ~lista de 30 conversas atribuídas a ele; scrollar carrega mais.

#### Fase 2: Filtros, Busca e Ordenação

**Objetivo:** filtragem completa com URL sincronizada

**Ações:**

- [ ] Criar componentes de filtro: `<StatusFilter>`, `<ChannelFilter>`, `<AssignmentFilter>`, `<TagsFilter>`, `<PeriodFilter>`
- [ ] Criar `<SearchInput>` com debounce
- [ ] Criar `<SortToggle>` com 3 modos
- [ ] Criar hook `useInboxFilters()` que sincroniza filtros com URL via `useSearchParams`
- [ ] Implementar mecânica de "Limpar tudo" e badge de contagem de filtros ativos
- [ ] Adaptar `useConversationsList` para receber os filtros e passar ao provider

**Validação:** aplicar combinações de filtros refletem na URL; refresh restaura estado.

#### Fase 3: Real-time Simulado

**Objetivo:** simulação de chegada de mensagens novas

**Ações:**

- [ ] Criar hook `useRealtimeConversations()` que inicializa timer e gera mensagens simuladas via mutations no mock store
- [ ] Criar `<RealtimeToggle>` no header da lista
- [ ] Implementar persistência do toggle em `localStorage`
- [ ] Mensagem simulada deve usar Faker com vocabulário plausível (templates curtos: "Você ainda tem aquela peça?", "Quanto fica com frete?", etc.)
- [ ] Atualizar `lastMessageAt` da conversa para que ela suba na ordenação default

**Validação:** com real-time ativo, observar conversas subirem ao topo conforme novas mensagens são geradas.

#### Fase 4: Ações Rápidas, Badges e Empty States

**Objetivo:** completar interatividade e estados visuais

**Ações:**

- [ ] Implementar 3 botões de ação rápida no hover (Atribuir-me, Transferir, Arquivar)
- [ ] Cada ação chama `useConversationsProvider().update()` ou similar
- [ ] Integrar `<Toast>` de feedback com botão "Desfazer" (rollback de 5s)
- [ ] Implementar todos os badges (canal, SDR, temperatura, novo, status border)
- [ ] Criar `<InboxEmptyState>` com texto adaptado aos filtros aplicados
- [ ] Validar permissões via `<Can>` do PRD-006

**Validação:** Vendedor vê apenas "Atribuir-me"; Owner vê todas as ações; toast com desfazer funciona.

#### Fase 5: Responsividade, A11y e Performance

**Objetivo:** polish final para produção

**Ações:**

- [ ] Implementar comportamento responsivo (desktop / tablet / mobile)
- [ ] Adicionar atalhos de teclado (setas, Enter, /, F, R)
- [ ] Implementar virtual scroll com `@tanstack/react-virtual` quando > 100 itens
- [ ] Adicionar `aria-label`, `role`, ordem de tab adequada
- [ ] Validar com testes manuais em viewports 360px, 768px, 1280px
- [ ] Garantir focus ring visível usando `--accent` do tema ativo

**Validação:** navegação por teclado fluida; mobile usável em iPhone SE (375px); virtual scroll mantém 60fps com 500+ itens.

---

## Dependências

### PRDs Anteriores

| PRD     | Descrição                                      | Status                                             |
| ------- | ---------------------------------------------- | -------------------------------------------------- |
| PRD-003 | Shell do App, Navegação e Layouts Base         | ⏳ Pendente (`<ConversationLayout>` consumido)     |
| PRD-004 | Geradores de Dados Fictícios e Camada de Mocks | ⏳ Pendente (80 conversas mockadas)                |
| PRD-005 | Arquitetura de Provedores de Dados             | ⏳ Pendente (`useConversationsProvider` consumido) |
| PRD-006 | Sistema de Roles, Permissões e Auditoria       | ⏳ Pendente (filtragem implícita por scope)        |
| PRD-007 | Multi-Loja                                     | ⏳ Pendente (filtragem implícita por loja)         |

### Serviços Externos

| Serviço                                      | Tipo | Status     |
| -------------------------------------------- | ---- | ---------- |
| `date-fns` ou `dayjs` (timestamps relativos) | Lib  | A instalar |
| `@tanstack/react-virtual` (virtual scroll)   | Lib  | A instalar |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

Este PRD é o **primeiro do épico "Bloco 1 — CRM e Central de Atendimento"** e a porta de entrada da feature mais consumida diariamente.

| Ordem   | PRD         | Título                              | Status       | Relação                  |
| ------- | ----------- | ----------------------------------- | ------------ | ------------------------ |
| Bloco 0 | 001–007     | Fundação                            | 📝 Redigido  | Pré-requisito            |
| **1**   | **PRD-010** | **Inbox Unificado**                 | **🔄 ATUAL** | Primeiro do CRM          |
| 2       | PRD-011     | Conversa com Histórico Multicanal   | ⏳           | Depende de 010           |
| 3       | PRD-012     | Ficha Unificada do Cliente          | ⏳           | Depende de 011 e 016     |
| 4       | PRD-013     | Regras de Distribuição e Roteamento | ⏳           | Depende de 010           |
| 5       | PRD-014     | Painel do Gestor — Métricas         | ⏳           | Depende de 010, 011, 013 |
| ...     |             | (demais PRDs do Bloco 1)            | ⏳           |                          |

**Legenda:** ✅ Implementado | 📝 Redigido | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### Filtragem implícita protege dados

O isolamento por papel (Vendedor vê só `own`) e por loja (`store`) é garantido pela combinação **PRD-006 + PRD-007** já aplicada no provider. Este PRD **não** implementa filtragem própria — confia na infraestrutura.

### Busca em mensagens

A busca textual pesquisa em mensagens das conversas do escopo permitido. Vendedor pesquisar "frota" só retorna resultados de conversas atribuídas a ele. Implementação na Fase 2 (Supabase) deve replicar essa lógica via RLS + função `searchpath` própria.

### Persistência em localStorage

Apenas IDs e flags persistidos (`gallo-last-conversation-id`, `gallo-realtime-enabled`, `gallo-conversation-last-view-*`). Sem PII.

### Audit log de transferências

Quando Owner/Gestor transfere conversa, `auditLog` registra `actorId`, `before.assignedSellerId`, `after.assignedSellerId` — rastreabilidade completa.

---

## Fluxos de Usuário

### Fluxo Principal — Vendedor inicia o dia

1. Carlos Santos faz login → vai para `/app/atendimento`
2. Vê lista de conversas atribuídas a ele (filtragem implícita)
3. Lista ordenada por "Mais recentes" (default)
4. Identifica conversas com badge "Novo!" e clica para abrir
5. Conversa abre na coluna central (PRD-011); ficha à direita (PRD-012)
6. Termina, volta para inbox e abre próxima

### Fluxo Alternativo — Gestor avalia carga

1. Marina (Gestor) abre `/app/atendimento`
2. Aplica filtro "Sem atribuição" → vê conversas órfãs
3. Aplica ordenação "Tempo de espera" → identifica gargalos
4. Clica em conversa aguardando há 4h
5. Hover mostra botões → clica "Transferir" → seleciona Carlos
6. Toast confirma: "Conversa transferida para Carlos Santos"
7. Conversa some da lista filtrada de "sem atribuição"

### Fluxo de Real-time — Demonstração ao cliente

1. Time da AILA está demonstrando ao cliente GALLO
2. Demonstrador pausa real-time no toggle para ter ambiente controlado
3. Apresenta features sem ruído de mensagens chegando
4. Ao final, reativa real-time para mostrar dinamismo
5. Conversas começam a se reordenar conforme novas mensagens chegam

### Fluxo Mobile — Vendedor no celular

1. Vendedor abre app no celular (viewport 390px)
2. Lista ocupa tela inteira (sem coluna central visível)
3. Toca em conversa → navega para `/app/atendimento/:id` em tela cheia
4. Vê a conversa (PRD-011) com botão "voltar" no canto superior esquerdo
5. Toca em "voltar" → retorna à lista preservando scroll position

### Fluxo de Erro — Conversa transferida durante visualização

1. Carlos está visualizando conversa X
2. Marina transfere conversa X para outra vendedora
3. Mock atualiza assignedSellerId
4. Real-time simulado propaga a mudança
5. Lista do Carlos atualiza: conversa X some (não está mais atribuída a ele)
6. Coluna central mostra mensagem "Esta conversa foi transferida para outro vendedor"
7. Carlos clica "voltar à inbox" para retomar

---

## Convenções de Código (Referência Rápida)

| Elemento              | Convenção                                      | Exemplo                                                               |
| --------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| **Componentes**       | PascalCase                                     | `<ConversationListItem>`, `<RealtimeToggle>`                          |
| **Hooks**             | camelCase + `use`                              | `useConversationsList`, `useInboxFilters`, `useRealtimeConversations` |
| **Pasta da feature**  | kebab-case                                     | `src/features/conversations/`                                         |
| **Subpastas**         | kebab-case                                     | `components/`, `hooks/`, `pages/`, `utils/`                           |
| **URL query params**  | kebab-case                                     | `?status=aguardando&canal=whatsapp`                                   |
| **localStorage keys** | kebab-case com prefixo `gallo-`                | `gallo-realtime-enabled`                                              |
| **Strings de UI**     | Em arquivo `i18n/pt-BR.json` (preparação i18n) | —                                                                     |
| **Git commits**       | Conventional Commits                           | `feat(conversations): add inbox with filters and realtime`            |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Você é o Claude Opus 4.7 operando via Claude Code CLI v2.1.3.

### Esclarecimento de Dúvidas

> **💬 Antes de implementar, faça perguntas para esclarecer qualquer ambiguidade.**

### Instruções Obrigatórias

> **⚠️ ANTES:** Explore, planeje, revise antes de implementar.
> **⚠️ APÓS:** Incrementar SemVer; atualizar CHANGELOG; renomear arquivo com `_DONE`; atualizar Status; atualizar INDEX.

### Princípios de Implementação

| Princípio                            | Descrição                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| **Inbox é a tela do dia inteiro**    | UX precisa ser excepcional — vendedor passa 6+ horas aqui. Cada microinteração conta                      |
| **Filtragem confia em providers**    | Não duplicar lógica de RBAC ou multi-loja neste componente. O provider já filtra                          |
| **Real-time é mock que parece real** | Timer + Faker + Zustand. Na Fase 2, troca por Supabase Realtime sem mudar a feature                       |
| **URL é estado**                     | Filtros e ordenação na URL permitem compartilhar views; vital para Owner mandar "olha isso aqui" no Slack |
| **Empty states orientam**            | Sem texto vazio. Sempre dizer ao user o que aconteceu e o que ele pode fazer                              |
| **Acessibilidade desde o início**    | Não adicionar depois. Teclado + leitores de tela funcionais desde a primeira implementação                |

### Orientações Gerais

| Aspecto                  | Orientação                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Timestamps relativos** | `date-fns` `formatDistanceToNow` em pt-BR; atualizar a cada minuto via `useEffect` com `setInterval`                              |
| **Debounce de busca**    | `useDeferredValue` do React ou `useDebouncedCallback` de uma lib pequena                                                          |
| **Virtual scroll**       | Só ativar acima de 100 itens; abaixo disso, render normal evita bug visual de altura                                              |
| **Avatares**             | Usar `<Avatar>` do shadcn (PRD-001) com fallback de iniciais e cor consistente baseada em hash do id                              |
| **Cores de canal**       | Tokens semânticos: `--channel-whatsapp`, `--channel-ecommerce`, etc.; manter coerência entre tema diesel/parts/service/industrial |
| **Tooltips**             | Usar `<Tooltip>` do shadcn em badges com significado não-óbvio (SDR, status border)                                               |

### O que NÃO Fazer

| ❌ Evitar                                                                |
| ------------------------------------------------------------------------ |
| Implementar conversa central neste PRD — é PRD-011                       |
| Implementar ficha do cliente — é PRD-012                                 |
| Implementar regras de distribuição automática — é PRD-013                |
| Calcular métricas agregadas (TMA, TMR) — é PRD-014                       |
| Filtrar manualmente por papel/loja no componente — provider já faz       |
| Polling de 30s para simular real-time — usar mutation reativa do Zustand |
| Esquecer empty state contextual                                          |
| Tornar real-time não-pausável (sem toggle) — dificulta demos             |
| Esquecer scroll infinito ou virtual scroll para listas grandes           |
| Usar `Date` em vez de `ISO8601` em qualquer lugar                        |

---

## Status de Implementação

| Campo                     | Valor                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Status**                | ✅ IMPLEMENTADO                                                                                                    |
| **Data de Implementação** | 25/05/2026                                                                                                         |
| **Versão do App**         | v0.7.0                                                                                                             |
| **Codinome**              | Hub                                                                                                                |
| **Implementado por**      | Claude Opus 4.7 (Claude Code CLI)                                                                                  |
| **Observações**           | Virtual scroll postergado — 80 conversas rodam fluidas com scroll infinito + IntersectionObserver. Sem novas deps. |

---

## Histórico

| Data       | Versão | Alteração                                                                           |
| ---------- | ------ | ----------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — inbox unificado com filtros, busca, ordenação, real-time simulado |

---

**AILA - Sistemas Inteligentes**
