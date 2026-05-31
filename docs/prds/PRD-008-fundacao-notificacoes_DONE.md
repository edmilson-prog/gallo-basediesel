# PRD-008: Fundação de Notificações (Modelo, Event Bus e Providers de Canal)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _A definir após criação no Lovable_ |
| **Objetivo** | Estabelecer a camada-fundação de notificações da plataforma — entidade `INotification`, barramento de eventos de domínio, roteamento por regras/preferências e providers de canal (Provider Pattern) — preparada para os dois públicos (interno e cliente final) e para a plugagem dos canais reais da Onda 8 sem reescrita |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | Alta |
| **Épico** | Bloco 0 — Fundação |
| **PRDs Relacionados** | PRD-002 (Modelo Conceitual — recebe delta), PRD-004 (Mocks), PRD-005 (Provider Pattern), PRD-006 (RBAC), PRD-007 (Multi-Loja), PRD-014 (Painel do Gestor — alertas absorvidos), PRD-009 (Notification Center — consome esta fundação), PRDs 141–150 (Onda 8 — plugam os canais reais) |
| **Implementação** | 🔵 Claude Code CLI (sobre o scaffold do Lovable) |
| **Padrão de código** | Tipos em `src/shared/types/`; providers em `src/providers/notifications/` espelhando a estrutura de `src/providers/data/` (contracts/impl/channels/hooks/factory); barramento, regras e reconciliadores na mesma raiz |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios |
|--------------|-----------|
| **Baixa** | 1 arquivo, sem dependências externas, < 100 linhas |
| **Média** | 2-5 arquivos, banco OU integração, funcionalidade isolada |
| **Alta** | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** define uma abstração transversal consumida por praticamente todos os módulos (atendimento, carteira, leads, metas, gamificação, vendas, e-commerce, portal B2B); introduz dois eixos de Provider distintos (persistência Mock/Supabase + entrega multicanal); absorve a lógica de alertas hoje dispersa no PRD-014; e precisa nascer compatível com a Onda 8 (drop-in dos canais reais na Fase 2). Escolher errado aqui custa retrabalho em dez PRDs futuros (141–150) e na UI (PRD-009).

---

## Contexto do Problema

A plataforma já produz notificações hoje — só que de forma fragmentada e sem um nome comum. Existem **três mecanismos desconexos**: toasts efêmeros que somem em segundos sem deixar histórico (PRD-010/011), alertas calculados no Painel do Gestor com dismiss em `localStorage` e recálculo via `setInterval` a cada 30s (PRD-014), e o badge de não-lidas alimentado pelo real-time simulado do inbox (PRD-010). Nenhum deles se conhece, nenhum deles persiste de forma unificada, e nenhum deles respeita preferências do destinatário.

Ao mesmo tempo, o roadmap da Fase 2 prevê uma **Onda 8 inteira de notificações reais** (PRDs 141–150: email transacional, WhatsApp HSM, SMS, push, Notification Center, preferências LGPD, drip, carrinho abandonado). O PRD-146 está descrito literalmente como aquele que "substitui o toast-only do MVP". Se a Fase 1 seguir produzindo notificações ad-hoc e a fundação só nascer na Onda 8, repete-se o anti-padrão que o PRD-005 já resolveu para dados: features acopladas a um mecanismo que será trocado, divergências que só aparecem em runtime, e ausência de um template canônico para os canais futuros.

Este PRD resolve a origem do problema **antes** de a UI existir: cria a entidade única `INotification` (ainda ausente do modelo do PRD-002), o barramento que desacopla "o que aconteceu" de "quem é avisado e por onde", a camada de preferências que governará o opt-in/out da LGPD, e os providers de canal — com `inApp` e `toast` ativos na Fase 1 e `email`/`whatsapp`/`sms`/`push` como esqueletos que apontam para os PRDs 141–150. É a "fundação invisível" das notificações, par direto do PRD-005.

---

## Conceito da Solução

### Situação Atual (As-Is)

Não existe entidade de notificação no modelo de domínio (`src/shared/types/`). O que há é:

- **Toasts** disparados localmente dentro de features (ex.: PRD-011 dispara "Resolvido" com Desfazer), sem persistência nem histórico.
- **Alertas do Painel do Gestor** (PRD-014): três hooks (`useAlertClienteADormente`, `useAlertVendedorSobrecarregado`, `useAlertConversaSemResposta`) que recalculam estado a cada 30s e gravam dismisses em `localStorage` (`gallo-alert-dismissed-{hash}`). São notificações **derivadas** disfarçadas de "alertas de painel".
- **Badge de não-lidas** no inbox, derivado de `IConversation`.

Cada mecanismo vive isolado, sem fonte única de verdade.

### Situação Desejada (To-Be)

Uma fundação de três camadas, espelhando a filosofia do correio (remetente → triagem → entrega):

1. **Origem (event bus).** Qualquer feature anuncia um fato de domínio (`notificationBus.emit('lead.assigned', payload)`) **sem saber** quem recebe nem por qual canal. Desacoplamento total entre quem gera o evento e quem o consome.
2. **Triagem (rules + preferências).** Um mapa de regras resolve cada evento em destinatários, categoria, severidade e canais-alvo, cruzando com as preferências do destinatário (matriz canal × categoria) e aplicando deduplicação (`dedupeKey`), agrupamento (`groupKey`) e — quando configurado — janelas de silêncio.
3. **Entrega (channel providers).** Cada canal é um provider que implementa o mesmo contrato `send(notification)`. Na Fase 1, `InAppChannel` e `ToastChannel` entregam de verdade; `Email/WhatsApp/SMS/Push` são esqueletos que registram a tentativa como `deferred` e lançam erro descritivo apontando o PRD da Onda 8 que os ativará.

Em paralelo, a **persistência** das notificações segue o mesmo Provider Pattern do PRD-005, parametrizada por `VITE_DATA_SOURCE` (Mock ativo, Supabase esqueleto). E um **reconciliador de derivadas** assume o papel dos hooks do PRD-014: cria a notificação quando o estado entra na condição (cliente A dormente, vendedor sobrecarregado, conversa sem resposta) e a expira automaticamente quando o estado sai — eliminando o `localStorage` ad-hoc e dando um único lugar de verdade.

> **Distinção conceitual central:** notificações têm dois ciclos de vida. **Evento** (`lifecycle: 'event'`) é um fato imutável que aconteceu num instante (pedido confirmado, transferência recebida, meta batida) e permanece no histórico. **Derivada** (`lifecycle: 'derived'`) é um estado calculado a partir dos dados (cliente dormente há 95 dias) que nasce e morre por reconciliação. O modelo unifica os dois sob a mesma entidade, distinguidos pelo discriminante.

### Alternativas Consideradas

| Alternativa | Por que foi descartada |
|-------------|------------------------|
| Manter toasts e alertas isolados e só unificar na Onda 8 | Repete o acoplamento que o PRD-005 já provou custar semanas de refatoração; e o PRD-009 (Notification Center) precisaria de uma fundação inexistente |
| Tratar derivadas como cálculo puro (sem persistir), só "espelhando" no center | Dois lugares de verdade (cálculo + espelho) divergem; reconciliar numa única entidade foi a decisão aprovada com o Arquiteto |
| Fan-out na leitura (calcular notificações por destinatário no momento de exibir) | Complexidade desnecessária para o volume de uma distribuidora; write-time (uma `INotification` por destinatário) é mais simples e suficiente |
| Canais externos já parcialmente implementados na Fase 1 | Viola Frontend First — entrega real (email/WhatsApp/SMS/push) é Fase 2 por definição (Onda 8); aqui são esqueletos |
| Usar uma lib externa de notificação pronta | Acopla a plataforma a um modelo de terceiros e não cobre as notificações derivadas específicas do domínio (curva ABC, positivação, carteira) |

---

## Escopo

### Incluído

- ✅ Entidade `INotification` e tipos auxiliares (`NotificationLifecycle`, `NotificationCategory`, `NotificationSeverity`, `NotificationStatus`, `NotificationChannel`, `NotificationRecipientType`, `ChannelDeliveryStatus`, `INotificationAction`, `INotificationPreference`) em `src/shared/types/`, exportados via barrel
- ✅ Delta no glossário (`docs/glossario.md`) e nota de extensão ao PRD-002 (modelo é fonte única; este PRD apenas **estende**, não redefine)
- ✅ Catálogo tipado de eventos de domínio (`NotificationEventType` — union literal) cobrindo atendimento, carteira, leads, metas/gamificação, comercial/relacional, vendas/pedidos, e-commerce, portal B2B e sistema
- ✅ `notificationBus` — barramento de emissão de eventos de domínio (in-app, síncrono, mock)
- ✅ Camada de roteamento por regras: mapa evento → destinatários + categoria + severidade + canais-alvo
- ✅ Camada de preferências: modelo `INotificationPreference` (matriz canal × categoria por destinatário) + provider + conjunto de **defaults sensatos por papel/tipo**
- ✅ **Persistence Provider** de notificações e preferências (Mock ativo + Supabase esqueleto), parametrizado por `VITE_DATA_SOURCE`, seguindo o template do PRD-005
- ✅ **Channel Providers** em `src/providers/notifications/channels/`: `InApp` e `Toast` funcionais (mock); `Email`, `WhatsApp`, `SMS`, `Push` como esqueletos `deferred-phase-2` com erro descritivo apontando o PRD da Onda 8 correspondente
- ✅ **Channel registry** que declara quais canais estão ativos na fase atual (Fase 1: apenas `inApp` + `toast`)
- ✅ Deduplicação por `dedupeKey` (evita duplicar quando real-time e reconciliação coincidem)
- ✅ Agrupamento por `groupKey` (estrutura + agrupamento visual simples; digest agendado fica para a Onda 8)
- ✅ Reconciliador de notificações derivadas (cliente A dormente, vendedor sobrecarregado, conversa sem resposta) — **absorve a lógica dos três hooks do PRD-014**
- ✅ Hooks de consumo que escondem a origem dos dados (`useNotifications`, `useUnreadCount`, `useNotificationPreferences`)
- ✅ Geradores de mock (Faker) com seed inicial de notificações fictícias plausíveis para os dois públicos, a serem consumidos pela UI do PRD-009
- ✅ Aplicação de RBAC/escopo (PRD-006/007) na camada de provider: Owner cross-store, Gestor restrito à loja, Vendedor restrito ao próprio, Cliente restrito às próprias
- ✅ Suporte de modelo a `recipientType: 'customer'` (cliente final), com os eventos de e-commerce/portal já mapeados (entrega externa adormecida até a Onda 8)

### Excluído

- ❌ Qualquer UI visível — sino, dropdown, página `/app/notificacoes`, página do portal do cliente, tela de preferências → **PRD-009**
- ❌ Providers reais de canais externos (email, WhatsApp HSM, SMS, push) → **Onda 8 (PRDs 141, 143, 144, 145)**
- ❌ Templates de email/HSM editáveis → PRDs 142/143
- ❌ Drip campaigns e carrinho abandonado → PRDs 148/149
- ❌ Digest agendado sofisticado (resumo periódico por canal) → Onda 8; aqui só agrupamento visual por `groupKey`
- ❌ Janela de silêncio (quiet hours) ativa — o campo é modelado, mas a lógica de supressão fica adormecida no MVP
- ❌ Implementação real do `SupabaseNotificationProvider` — é esqueleto (Fase 2)
- ❌ Persistência real de consentimento LGPD com trilha legal completa → PRD-147 (aqui as preferências são funcionais via mock)

---

## Requisitos Funcionais

### Modelo de domínio

- **RF-001:** Definir a entidade `INotification` em `src/shared/types/`, contendo no mínimo: `id`, `dedupeKey`, `lifecycle` (`'event' | 'derived'`), `type` (`NotificationEventType`), `category`, `severity`, `recipientId`, `recipientType` (`'seller' | 'customer'`), `storeId` (opcional), `title`, `body`, `entityRef` (opcional, `{ type, id }`), `actions` (opcional), `status` (`'unread' | 'read' | 'archived'`), `channels` (canais-alvo resolvidos), `deliveryStatus` (opcional, por canal), `groupKey` (opcional), `source` (`'system' | 'rule' | 'user'`), `createdAt` (ISO8601), `readAt` (opcional), `expiresAt` (opcional), `metadata` (opcional).
- **RF-002:** Definir os union types literais auxiliares (sem usar `enum`): `NotificationLifecycle`, `NotificationCategory` (`'transactional' | 'commercial' | 'operational' | 'gamification' | 'system' | 'marketing'`), `NotificationSeverity` (`'info' | 'success' | 'warning' | 'critical'`), `NotificationStatus`, `NotificationChannel` (`'inApp' | 'toast' | 'email' | 'whatsapp' | 'sms' | 'push'`), `NotificationRecipientType`, `ChannelDeliveryStatus` (`'pending' | 'sent' | 'delivered' | 'failed' | 'skipped' | 'deferred'`).
- **RF-003:** Definir `INotificationAction` representando uma ação inline (identificador, rótulo, e tipo de ação — navegação por rota ou mutação nomeada). A definição deve ser descritiva o suficiente para o PRD-009 renderizar botões "Ver", "Resolver", "Transferir" sem reinterpretar a estrutura.
- **RF-004:** Definir `INotificationPreference` por destinatário: identificação (`recipientId` + `recipientType`), a matriz de canais habilitados por categoria, campo de janela de silêncio (modelado, adormecido), e `updatedAt` (ISO8601).
- **RF-005:** Campos de tempo sempre em ISO8601 (string), nunca `Date`. Campos ausentes sempre opcionais (`?`), nunca `| null` — nulidade é responsabilidade da camada de provider.
- **RF-006:** Notificações de evento devem capturar `title`/`body` como **snapshot** no momento da criação (não referência ao registro de origem), para que o histórico sobreviva a mudanças posteriores no cliente, pedido ou lead.
- **RF-007:** Registrar no glossário as definições de "notificação", "notificação de evento", "notificação derivada", "categoria", "canal" e "reconciliação"; e registrar a extensão do modelo no histórico do PRD-002 (delta), sem redefinir entidades existentes.

### Catálogo de eventos

- **RF-008:** Definir `NotificationEventType` como union literal cobrindo, no mínimo, os eventos da tabela do **Anexo A** deste PRD, agrupados por módulo.
- **RF-009:** Cada evento do catálogo deve ter uma regra de roteamento associada que defina: categoria default, severidade default, função de resolução de destinatário(s) e canais-alvo default na fase atual.
- **RF-010:** Eventos marcados como derivados no Anexo A não são emitidos manualmente por features — são produzidos exclusivamente pelo reconciliador (RF-024 a RF-027).
- **RF-011:** Eventos cujos canais-alvo incluem canais externos (e-commerce/portal para o cliente) devem, na Fase 1, resolver entrega efetiva apenas para os canais ativos (`inApp`/`toast`) e marcar os canais externos como `deferred` no `deliveryStatus`.

### Barramento de eventos (event bus)

- **RF-012:** Disponibilizar `notificationBus` com capacidade de **emitir** um evento de domínio (tipo + payload) e de **assinar** eventos (para a camada de roteamento consumir). A feature emissora não conhece destinatários nem canais.
- **RF-013:** A emissão deve ser não-bloqueante para o fluxo principal: uma falha no processamento de uma notificação nunca pode interromper a ação de negócio que a originou (Princípio "Não bloquear fluxo principal").
- **RF-014:** Toda emissão deve gerar um `dedupeKey` determinístico a partir de `type` + `entityRef` + janela temporal, de modo que o mesmo fato emitido duas vezes na mesma janela resulte em **uma** notificação por destinatário.

### Roteamento e preferências

- **RF-015:** A camada de roteamento deve resolver cada evento em uma ou mais `INotification` (uma por destinatário — fan-out write-time), aplicando categoria, severidade e canais-alvo da regra.
- **RF-016:** Antes de persistir/entregar, o roteamento deve cruzar os canais-alvo com a `INotificationPreference` do destinatário: um canal desabilitado para aquela categoria é removido dos canais-alvo (e registrado como `skipped`).
- **RF-017:** Notificações de categoria `transactional` e `system` (severidade crítica) **não podem ser totalmente silenciadas** via preferências — pelo menos o canal `inApp` permanece. Categorias `marketing` e `gamification` são integralmente opcionais (respeitam opt-out completo).
- **RF-018:** Fornecer defaults de preferência por papel/tipo quando o destinatário ainda não tiver preferências salvas (ver **Anexo B**).
- **RF-019:** Aplicar `groupKey` para colapsar notificações da mesma natureza (ex.: várias "conversa atribuída" no mesmo curto intervalo → um grupo "N novas conversas"). O agrupamento é estrutural e visual; não há envio de digest agendado nesta fase.

### Persistência (Provider Pattern)

- **RF-020:** Definir o contrato `INotificationStore` (persistência) com, no mínimo: listar por destinatário com paginação e filtros (categoria, status, severidade), obter por id, criar, marcar como lida, marcar todas como lidas, arquivar, e reconciliar derivadas (upsert/expire em lote).
- **RF-021:** Definir o contrato `INotificationPreferenceStore` com: obter preferências do destinatário (com fallback para defaults) e atualizar preferências.
- **RF-022:** Implementar `MockNotificationStore` e `MockNotificationPreferenceStore` (Fase 1, ativos) e os esqueletos `SupabaseNotificationStore`/`SupabaseNotificationPreferenceStore` que lançam erro descritivo indicando o PRD futuro de ativação. A factory seleciona a implementação por `VITE_DATA_SOURCE`, retornando sempre a mesma instância (referência estável), de forma síncrona.
- **RF-023:** A camada de persistência deve aplicar escopo de RBAC/multi-loja (PRD-006/007): nenhuma listagem retorna notificações fora do escopo do solicitante, mesmo sob manipulação de parâmetros no front (Owner cross-store; Gestor restrito à loja ativa; Vendedor restrito ao próprio `recipientId`; Cliente restrito ao próprio `recipientId`).

### Reconciliador de derivadas

- **RF-024:** Implementar um reconciliador que avalia periodicamente as condições derivadas e produz/expira `INotification` com `lifecycle: 'derived'`. Ele **substitui** os hooks `useAlertClienteADormente`, `useAlertVendedorSobrecarregado` e `useAlertConversaSemResposta` do PRD-014.
- **RF-025:** Condições derivadas mínimas: cliente curva A em status dormente; vendedor com carga acima do limite configurado; conversa em status "aguardando" há mais que o limite configurado. Os limiares devem ser parametrizáveis (origem nas configurações de admin — PRD-019/PRD-014), não hardcoded.
- **RF-026:** Quando a condição deixa de ser verdadeira (cliente comprou, carga normalizou, conversa respondida), a notificação derivada correspondente é expirada/arquivada automaticamente na próxima reconciliação — sem intervenção do usuário.
- **RF-027:** A cadência de reconciliação deve ser configurável e não pode degradar a responsividade da UI; o processamento ocorre fora do caminho de renderização.

### Entrega (channel providers)

- **RF-028:** Definir o contrato `INotificationChannel` com a capacidade `send(notification)` retornando um resultado de entrega (`ChannelDeliveryStatus` + detalhe). Todos os canais implementam o mesmo contrato.
- **RF-029:** Implementar `InAppChannel` (persiste a notificação para consumo do Notification Center) e `ToastChannel` (sinaliza exibição efêmera) como canais **ativos** na Fase 1.
- **RF-030:** Implementar `EmailChannel`, `WhatsAppChannel`, `SmsChannel` e `PushChannel` como **esqueletos**: registram a tentativa, retornam `deferred` e lançam erro descritivo no formato "Canal X não implementado — ativar no PRD-NNN (Onda 8)".
- **RF-031:** O `channel registry` declara o conjunto de canais ativos na fase corrente. A camada de entrega só aciona canais ativos; canais inativos resolvem como `deferred` sem quebrar o fluxo.

### Hooks de consumo

- **RF-032:** Disponibilizar `useNotifications(filters)` (lista paginada por destinatário, respeitando escopo), `useUnreadCount()` (contagem de não-lidas para o badge) e `useNotificationPreferences()` (leitura/escrita da matriz). Os hooks escondem inteiramente a origem (mock/supabase) e o provider de canal.

### Mocks e validação

- **RF-033:** Gerar seed inicial de notificações fictícias plausíveis para `seller` (todas as categorias internas) e `customer` (transacionais de e-commerce/portal), com distribuição realista de `status` e `severity`, para o PRD-009 consumir.
- **RF-034:** Disponibilizar um harness de validação na rota de design-system existente (`src/routes/design-system.tsx` ou equivalente) que permita emitir eventos de teste e observar o resultado do roteamento/entrega no console — já que esta fundação não tem UI própria.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Marcar como lida / arquivar deve refletir em menos de 100 ms na camada mock. A reconciliação de derivadas não pode bloquear o thread de renderização (processamento debounced/agendado).
- **RNF-002 (Escalabilidade):** O modelo de fan-out write-time e a listagem paginada devem suportar volumes da ordem de milhares de notificações por usuário sem degradar a UI; filtros aplicados na camada de provider, não em memória no componente.
- **RNF-003 (Compatibilidade de fase):** Os contratos de persistência e de canal devem ser idênticos entre mock e implementação real — o drop-in da Onda 8 e do Supabase não pode exigir mudança nas assinaturas nem nos hooks consumidores.
- **RNF-004 (Observabilidade):** Em modo de desenvolvimento, registrar em console o roteamento de cada evento (destinatários resolvidos, canais-alvo, canais `skipped`/`deferred`) e o `VITE_DATA_SOURCE` ativo.
- **RNF-005 (Internacionalização):** Conteúdo (`title`/`body`) e rótulos em português brasileiro; estrutura preparada para futura externalização de strings.
- **RNF-006 (Privacidade / LGPD):** A matriz de preferências deve ser respeitada na resolução de canais; categorias opcionais (marketing/gamificação) honram opt-out completo. A trilha legal de consentimento é responsabilidade do PRD-147 (Fase 2).
- **RNF-007 (Isolamento):** Importações cruzadas bloqueadas por ESLint (`no-restricted-imports`) no mesmo espírito do PRD-005 — features consomem apenas o barrel público de `src/providers/notifications`, nunca implementações internas.

---

## Critérios de Aceitação

### RF-001/RF-002: Modelo de domínio

```gherkin
DADO o modelo de tipos da plataforma
QUANDO inspeciono src/shared/types/
ENTÃO encontro INotification e os union types auxiliares exportados via barrel
  E nenhum campo de tempo usa o tipo Date (todos são ISO8601 string)
  E nenhum campo usa "| null" (apenas opcional com "?")
  E nenhum enum do TypeScript é usado (apenas union types literais)
```

### RF-012/RF-013: Barramento desacoplado

```gherkin
DADO uma feature que conclui uma ação de negócio
QUANDO ela emite um evento via notificationBus
ENTÃO a feature não referencia destinatários nem canais
  E a ação de negócio é concluída mesmo que o processamento da notificação falhe
```

### RF-014: Deduplicação

```gherkin
DADO um mesmo fato de domínio emitido duas vezes na mesma janela temporal
QUANDO o roteamento processa as duas emissões
ENTÃO apenas uma INotification por destinatário é criada
  E o dedupeKey das duas emissões coincide
```

### RF-016/RF-017: Preferências e canais protegidos

```gherkin
DADO um destinatário que desabilitou o canal toast para a categoria gamification
QUANDO um evento de gamificação é roteado para ele
ENTÃO o canal toast é removido dos canais-alvo e marcado como skipped
  E o canal inApp permanece (se habilitado)

DADO um destinatário que tentou silenciar uma notificação transactional crítica
QUANDO o evento é roteado
ENTÃO o canal inApp permanece ativo independentemente da preferência
```

### RF-022/RF-023: Provider e escopo

```gherkin
DADO VITE_DATA_SOURCE=mock
QUANDO a factory de notificações é resolvida
ENTÃO retorna a implementação Mock (mesma instância em chamadas repetidas)

DADO um Vendedor solicitando sua lista de notificações
QUANDO ele tenta manipular o parâmetro de recipientId para o de outro vendedor
ENTÃO a camada de provider ignora a manipulação e retorna apenas as notificações do próprio solicitante

DADO um Gestor de uma loja
QUANDO lista notificações
ENTÃO não recebe notificações de outra loja, mesmo via parâmetro de storeId manipulado
```

### RF-024/RF-026: Reconciliação de derivadas

```gherkin
DADO um cliente curva A que atinge o limiar de dormência configurado
QUANDO o reconciliador executa
ENTÃO uma INotification derivada "cliente.dormente" é criada para o vendedor responsável e o gestor

DADO que esse mesmo cliente realiza uma compra (sai da condição)
QUANDO o reconciliador executa novamente
ENTÃO a notificação derivada correspondente é expirada/arquivada automaticamente
  E nenhum dismiss manual em localStorage é necessário
```

### RF-030/RF-031: Canais diferidos

```gherkin
DADO que o canal whatsapp não está no channel registry da Fase 1
QUANDO um evento cujos canais-alvo incluem whatsapp é entregue
ENTÃO o resultado do canal whatsapp é "deferred"
  E o fluxo prossegue normalmente nos canais ativos (inApp/toast)

DADO uma chamada direta ao EmailChannel.send na Fase 1
QUANDO executada
ENTÃO lança erro descritivo indicando o PRD da Onda 8 que ativará o canal
```

### Cenários de Erro

```gherkin
DADO que o MockNotificationStore falha ao listar
QUANDO um hook de consumo é acionado
ENTÃO o erro é tratado graciosamente (estado de erro exposto ao consumidor)
  E o badge de não-lidas não quebra a TopBar

DADO uma chamada ao SupabaseNotificationStore na Fase 1
QUANDO executada
ENTÃO lança NotImplementedError indicando claramente provider, método e PRD futuro de ativação

DADO um evento emitido com type fora do catálogo NotificationEventType
QUANDO o roteamento o recebe
ENTÃO ele é ignorado com log de aviso em dev, sem criar notificação nem lançar exceção ao emissor
```

---

## Fases de Implementação

| Fase | Objetivo | Arquivos Estimados |
|------|----------|-------------------|
| 1 | Modelo de domínio + glossário + delta PRD-002 | 3-4 |
| 2 | Persistência (contratos + mock + esqueleto Supabase + factory + hooks + ESLint) | 8-10 |
| 3 | Barramento + roteamento + dedupe + preferências (modelo + provider + defaults) | 6-8 |
| 4 | Channel providers (inApp/toast ativos + email/wa/sms/push esqueletos) + registry | 7-9 |
| 5 | Reconciliador de derivadas + groupKey/agrupamento + seeds de mock + harness de validação | 5-7 |

### Detalhamento das Fases

#### Fase 1: Modelo de Domínio

**Objetivo:** entidade e tipos disponíveis como fonte única, antes de qualquer lógica.

**Ações:**
- [ ] Criar arquivo de tipos de notificação em `src/shared/types/` com `INotification`, `INotificationAction`, `INotificationPreference` e os union types literais
- [ ] Exportar explicitamente via barrel (`index.ts`), sem `export *`
- [ ] Adicionar entradas de glossário em `docs/glossario.md` com JSDoc `@see` nas interfaces
- [ ] Registrar a extensão no histórico do PRD-002 (delta), sem redefinir entidades existentes

**Validação:** `tsc` em strict mode sem erros; tipos importáveis via `@/shared/types`; glossário linkado.

#### Fase 2: Persistência (Provider Pattern)

**Objetivo:** ler/escrever notificações e preferências via abstração, com mock ativo e Supabase esqueleto.

**Ações:**
- [ ] Criar `src/providers/notifications/contracts/` com `INotificationStore` e `INotificationPreferenceStore`
- [ ] Implementar `impl/mock/` (ativo) delegando à camada de mocks/Faker
- [ ] Criar `impl/supabase/` (esqueleto) com erro descritivo apontando PRD futuro
- [ ] Criar `factory.ts` parametrizada por `VITE_DATA_SOURCE` (síncrona, instância estável)
- [ ] Criar hooks `useNotifications`, `useUnreadCount`, `useNotificationPreferences`
- [ ] Configurar `no-restricted-imports` no ESLint isolando implementações internas
- [ ] Tipar `VITE_DATA_SOURCE` em `src/vite-env.d.ts` (se ainda não coberto pelo PRD-005)

**Validação:** alternar `VITE_DATA_SOURCE` troca a implementação; ESLint bloqueia import interno; escopo de RBAC aplicado nas listagens.

#### Fase 3: Barramento, Roteamento e Preferências

**Objetivo:** transformar eventos de domínio em notificações roteadas e filtradas por preferência.

**Ações:**
- [ ] Criar `notificationBus` (emit/subscribe) na raiz de `src/providers/notifications/`
- [ ] Criar `NotificationEventType` (catálogo do Anexo A) e o mapa de regras de roteamento
- [ ] Implementar geração de `dedupeKey` determinístico
- [ ] Implementar resolução de destinatários (fan-out write-time)
- [ ] Implementar cruzamento com `INotificationPreference` e regras de canais protegidos (RF-017)
- [ ] Implementar defaults de preferência por papel/tipo (Anexo B)

**Validação:** emitir evento de teste cria as notificações corretas por destinatário; preferência desabilitada remove o canal; dedupe colapsa emissões repetidas.

#### Fase 4: Entrega Multicanal

**Objetivo:** entregar pelos canais ativos e deixar os externos prontos como esqueletos.

**Ações:**
- [ ] Criar contrato `INotificationChannel` e o `channel registry`
- [ ] Implementar `InAppChannel` e `ToastChannel` (ativos)
- [ ] Implementar `EmailChannel`, `WhatsAppChannel`, `SmsChannel`, `PushChannel` (esqueletos `deferred`)
- [ ] Conectar a saída do roteamento aos canais ativos do registry
- [ ] Religar os toasts hoje disparados localmente (PRD-010/011) para passarem pelo `ToastChannel` (sem alterar a UX visível — isso será consolidado no PRD-009)

**Validação:** evento roteado entrega em inApp/toast; canais externos resolvem `deferred` sem quebrar; chamada direta a canal externo lança erro descritivo.

#### Fase 5: Reconciliador, Agrupamento e Seeds

**Objetivo:** absorver os alertas do PRD-014, agrupar e popular dados de demonstração.

**Ações:**
- [ ] Implementar o reconciliador de derivadas (cliente A dormente, vendedor sobrecarregado, conversa sem resposta) lendo limiares das configurações (PRD-019/PRD-014)
- [ ] Garantir criação e expiração automática conforme entrada/saída da condição
- [ ] Implementar agrupamento por `groupKey` (colapso visual simples)
- [ ] Gerar seed de notificações fictícias para `seller` e `customer`
- [ ] Criar harness de validação na rota de design-system para emitir eventos e inspecionar o resultado
- [ ] Marcar no PRD-014 que os três hooks de alerta passam a delegar ao reconciliador (nota de migração)

**Validação:** condição derivada cria/expira sem dismiss manual; grupos colapsam; seed visível para o PRD-009 consumir; harness funcional.

---

## Dependências

### PRDs Anteriores

| PRD | Descrição | Status |
|-----|-----------|--------|
| PRD-002 | Modelo Conceitual (recebe delta com `INotification`) | ✅ Concluído |
| PRD-004 | Mocks e geradores de dados (base para seeds) | ✅ Concluído |
| PRD-005 | Provider Pattern (template de persistência e factory) | ✅ Concluído |
| PRD-006 | RBAC e permissões (escopo das listagens, auditoria de preferências) | ✅ Concluído |
| PRD-007 | Multi-Loja (escopo `storeId` das notificações) | ✅ Concluído |
| PRD-014 | Painel do Gestor (alertas que serão absorvidos pelo reconciliador) | ✅ Concluído |

### Serviços Externos

| Serviço | Tipo | Status |
|---------|------|--------|
| Provedores de email (SendGrid/Resend/SES) | API | A configurar na Onda 8 (PRD-141) |
| WhatsApp Cloud API / Evolution | API | A configurar na Onda 8 (PRD-143) |
| SMS (Twilio) | API | A configurar na Onda 8 (PRD-144) |
| Web Push (Service Worker + Push API) | API do navegador | A configurar na Onda 8 (PRD-145) |

> Nenhum serviço externo é integrado neste PRD — todos entram como esqueletos de canal.

### Decisões Pendentes

- [ ] **Limiares das derivadas:** confirmar a origem definitiva dos limiares (dias de dormência, horas de SLA, carga máxima). Recomendação: ler das configurações de admin (PRD-019), com fallback para os defaults hoje usados no PRD-014.
- [ ] **Codinome de versão:** sugestão **"Herald"** (arauto/mensageiro) para a fundação Fase 1 — distinto de "Reach", já reservado à Onda 8.
- [ ] **Cadência de reconciliação:** confirmar intervalo default (o PRD-014 usa 30s para os alertas); avaliar se a fundação mantém 30s ou adota valor próprio configurável.

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Sistema de Notificações da Plataforma"** (Bloco 0 — Fundação, com continuidade na Onda 8 da Fase 2).

| Ordem | PRD | Título | Status | Relação |
|-------|-----|--------|--------|---------|
| 1 | PRD-005 | Provider Pattern (Mock/Supabase) | ✅ | Template de persistência |
| 2 | PRD-006 / PRD-007 | RBAC / Multi-Loja | ✅ | Escopo das notificações |
| **3** | **PRD-008** | **Fundação de Notificações** | **🔄 ATUAL** | Depende de 002, 004, 005, 006, 007, 014 |
| 4 | PRD-009 | Notification Center & Preferências (UI) | ⏳ | Depende de PRD-008 |
| 5+ | PRDs 141–150 | Onda 8 — Notificações Reais | ⏳ | Plugam os canais reais sobre esta fundação |

> **Nota:** Implemente na ordem indicada. O PRD-009 (UI) só deve iniciar com o PRD-008 ✅. Os PRDs 141–150 deixam de redefinir infraestrutura e passam a **referenciar** esta fundação (ver "Impacto no Roadmap" abaixo).

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### Dados Sensíveis

| Dado | Classificação | Proteção |
|------|---------------|----------|
| Nome/identificação de cliente em `title`/`body` | PII | Escopo por RBAC + `storeId`; cliente só vê as próprias notificações |
| Valores comerciais (estimativa de lead, valor de pedido) | Sensível (negócio) | Restrito ao escopo do destinatário; nunca cross-store para Gestor |
| Métricas de desempenho de vendedor (carga, sobrecarga) | Sensível (RH) | Visível apenas a Gestor/Owner; nunca a outros vendedores |
| Preferências de canal do cliente | PII / consentimento | Base para LGPD; trilha legal completa no PRD-147 |

### Autenticação e Autorização

A camada de persistência **não confia no front**: toda listagem e mutação resolve o escopo a partir do solicitante autenticado (papel + `storeId` + `recipientId`), espelhando a disciplina dos PRDs 005/006/007. Manipulação de parâmetros (recipientId/storeId) é ignorada pela camada de provider.

### Auditoria

Alterações de preferências de notificação são auditáveis via o log do PRD-006 (autor + timestamp). Opt-out de categorias marketing/gamificação é registrado para fins de LGPD. As notificações em si são imutáveis após criação (eventos); derivadas têm seu ciclo de vida (criação/expiração) registrado pelo reconciliador.

---

## Fluxos de Usuário

> Esta é uma fundação sem UI própria. Os fluxos abaixo descrevem o comportamento **observável via dados/console e pela UI futura do PRD-009**.

### Fluxo Principal (Happy Path) — Evento transacional interno

1. Vendedor conclui uma transferência de carteira (PRD-018).
2. A feature emite `carteira.transferenciaRecebida` no `notificationBus` (sem conhecer destinatário/canal).
3. O roteamento resolve o destinatário (vendedor de destino), define categoria `operational`, severidade `info`, canais-alvo `[inApp, toast]`.
4. As preferências do destinatário são aplicadas; `dedupeKey` evita duplicidade.
5. `InAppChannel` persiste a notificação; `ToastChannel` sinaliza exibição efêmera.
6. O badge de não-lidas (PRD-009) incrementa; a notificação aparece na lista.

### Fluxo de Exceção — Notificação derivada que se resolve sozinha

1. Cliente curva A cruza o limiar de dormência → reconciliador cria `cliente.dormente` para vendedor + gestor.
2. A notificação aparece na lista (e na view filtrada que sucede o `<ActiveAlertsList>` do PRD-014).
3. O cliente realiza uma compra; o estado sai da condição.
4. Na próxima reconciliação, a notificação derivada é expirada/arquivada automaticamente — sem dismiss manual.

### Fluxo de Erro — Canal externo na Fase 1

1. Evento de e-commerce para o cliente (`ecom.pedidoRecebido`) é roteado com canais-alvo `[inApp, email, whatsapp]`.
2. `inApp` entrega (visível quando o cliente acessa o portal).
3. `email` e `whatsapp` não estão no registry da Fase 1 → resolvem como `deferred`, registrados no `deliveryStatus`.
4. O fluxo prossegue sem erro; a entrega externa real será ativada na Onda 8 (PRDs 141/143) sem alterar este roteamento.

---

### Convenções de Código (Referência Rápida)

> **Consulte a Seção 5 do `guia-prd.md` para a versão completa.**

| Elemento | Convenção | Exemplo |
|----------|-----------|---------|
| **Componentes React** | PascalCase | `NotificationBell.tsx` (no PRD-009) |
| **Hooks** | camelCase + `use` | `useNotifications.ts` |
| **Services/Providers** | camelCase + sufixo | `mockNotificationStore.ts` |
| **Pastas** | kebab-case | `providers/notifications/` |
| **Variáveis/Funções** | camelCase | `dedupeKey`, `resolveRecipients()` |
| **Constantes** | UPPER_SNAKE_CASE | `DEFAULT_RECONCILE_INTERVAL` |
| **Interfaces** | PascalCase + `I` | `INotification`, `INotificationChannel` |
| **Union types** | PascalCase sem `I` | `NotificationCategory` |
| **Tabelas (banco)** | snake_case (plural) | `notifications` (Fase 2) |
| **Colunas (banco)** | snake_case | `created_at`, `recipient_id` (Fase 2) |
| **Env vars (frontend)** | `VITE_` prefix | `VITE_DATA_SOURCE` |
| **Git commits** | Conventional Commits | `feat:`, `refactor:` |
| **Estrutura de pastas** | Feature-based | `src/providers/notifications/` |
| **Imports** | Ordem: React → libs → components → hooks → utils → types | — |
| **Ícones** | Iconify (`@iconify/react`) | `<Icon icon="mdi:bell" />` (no PRD-009) |
| **Tema** | Light + Dark obrigatório | aplicável à UI do PRD-009 |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Você é o Claude Opus 4.5 operando via Claude Code CLI v2.1.3. Este PRD foi criado pelo Agente Arquiteto (Claude Opus 4.5 na plataforma web).

### Esclarecimento de Dúvidas

> **💬 Antes de implementar, faça perguntas para esclarecer qualquer ambiguidade sobre: a forma final de `INotificationAction`, a origem dos limiares das derivadas, a cadência de reconciliação e qualquer divergência entre este PRD e o modelo já implementado no PRD-002.**

### Instruções Obrigatórias

> **⚠️ 1. ANTES DE IMPLEMENTAR:**
> "Lembre-se: explore a estrutura dos dados, planeje primeiro cada passo, analise, investigue a fundo, pense e revise tudo antes de realizar qualquer atualização ou implementação."

> **⚠️ 2. APÓS IMPLEMENTAR:**
> - Incrementar a versão do app seguindo [SemVer](https://semver.org/) (MINOR — nova funcionalidade compatível)
> - Gerar codinome em inglês (sugestão: **Herald**)
> - Atualizar o CHANGELOG.md seguindo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
> - Renomear este arquivo adicionando `_DONE` ao final (`PRD-008-fundacao-notificacoes_DONE.md`)
> - Atualizar a seção "Status de Implementação" (status, data, versão, codinome, observações)
> - Registrar o delta no histórico do PRD-002

### Guia de Versionamento (SemVer)

| Tipo de Mudança | Ação | Exemplo |
|-----------------|------|---------|
| Correção de bug | PATCH +1 | 1.0.0 → 1.0.1 |
| Nova funcionalidade | MINOR +1, PATCH = 0 | 1.0.1 → 1.1.0 |
| Mudança incompatível | MAJOR +1, outros = 0 | 1.1.0 → 2.0.0 |

**Codinomes:** para MINOR/MAJOR, gerar codinome em inglês baseado no contexto. Sugestão para este PRD: **Herald**.

🔗 Referência: https://semver.org/

### Guia de Changelog (Keep a Changelog)

Tipos de mudança a documentar: **Added** (novas funcionalidades), **Changed** (mudanças existentes), **Deprecated** (a remover), **Removed** (removidas), **Fixed** (correções), **Security** (vulnerabilidades).

🔗 Referência: https://keepachangelog.com/en/1.1.0/

### Princípios de Implementação

| Princípio | Descrição |
|-----------|-----------|
| **Não bloquear fluxo principal** | A emissão/entrega de notificação nunca interrompe a ação de negócio que a originou |
| **Fail gracefully** | Falha de canal ou de provider não derruba a UI; estado de erro é exposto, não propagado como exceção ao emissor |
| **Preservar evidências** | Notificações de evento são snapshots imutáveis; o histórico sobrevive a mudanças no registro de origem |
| **Testar incrementalmente** | Validar cada fase (tipos → persistência → roteamento → entrega → reconciliação) antes de avançar |
| **Documentar decisões** | Registrar no CHANGELOG e nas observações qualquer divergência de implementação |

### Orientações Gerais

| Aspecto | Orientação |
|---------|------------|
| **Espelhar o PRD-005** | A estrutura de `src/providers/notifications/` deve espelhar `src/providers/data/` (contracts/impl/hooks/factory). Quem já leu o PRD-005 deve reconhecer o padrão imediatamente |
| **Dois eixos de Provider** | Não confundir persistência (Mock/Supabase, via `VITE_DATA_SOURCE`) com entrega (channel providers, via channel registry). São perpendiculares |
| **Mensagens de erro dos esqueletos** | Devem citar canal, método e PRD futuro. Ex.: `"WhatsAppChannel.send — implementar no PRD-143 (Onda 8 / WhatsApp HSM)"` |
| **Derivadas não são emitidas à mão** | Apenas o reconciliador produz `lifecycle: 'derived'`. Features emitem somente eventos |
| **dedupeKey determinístico** | Mesmo fato → mesma chave. É o que protege contra a duplicação real-time + reconciliação |
| **Limiares parametrizáveis** | Nunca hardcodar dias de dormência/horas de SLA/carga; ler de configurações (PRD-019/PRD-014) |
| **Snapshot em title/body** | Copiar o texto no momento da criação; não referenciar o registro de origem |

### O que NÃO Fazer

| ❌ Evitar |
|----------|
| Implementar qualquer UI (sino, dropdown, página, tela de preferências) — é escopo do PRD-009 |
| Integrar provedores externos reais (email/WhatsApp/SMS/push) — são esqueletos; integração é Onda 8 |
| Implementar o `SupabaseNotificationStore` de verdade — é esqueleto |
| Usar `enum` do TypeScript — sempre union types literais |
| Usar `Date` em campos de tempo — sempre ISO8601 string |
| Usar `| null` no modelo — apenas opcional com `?` |
| Persistir dismiss de derivadas em `localStorage` — o ciclo de vida é por reconciliação |
| Emitir notificações derivadas manualmente a partir de features |
| Acoplar features à camada de persistência — consumir apenas o barrel público |
| Bloquear o fluxo de negócio aguardando a entrega de notificação |
| Silenciar totalmente notificações transacionais críticas via preferências |
| Hardcodar limiares de dormência/SLA/carga |

---

## Anexo A — Catálogo de Eventos de Domínio (Fase 1)

> `lifecycle: derived` = produzido pelo reconciliador (RF-024+). Canais externos resolvem `deferred` na Fase 1.

| Evento (`type`) | Módulo | Lifecycle | Categoria | Severidade | Destinatário(s) | Canais-alvo (Fase 1) |
|-----------------|--------|-----------|-----------|------------|-----------------|----------------------|
| `conversa.atribuida` | Atendimento | event | operational | info | Vendedor (assignee) | inApp, toast |
| `conversa.semResposta` | Atendimento | derived | operational | warning | Vendedor + Gestor | inApp |
| `sdr.escalonou` | Atendimento | event | operational | warning | Vendedor / Gestor | inApp, toast |
| `carteira.transferenciaRecebida` | Carteira | event | operational | info | Vendedor (destino) | inApp, toast |
| `carteira.autoRevertAgendado` | Carteira | event | operational | info | Vendedor | inApp |
| `carteira.autoRevertExecutado` | Carteira | event | operational | info | Vendedor | inApp |
| `lead.novo` | Leads | event | commercial | info | Vendedor (owner) | inApp, toast |
| `lead.esfriando` | Leads | derived | commercial | warning | Vendedor | inApp |
| `lead.perdido` | Leads | event | commercial | info | Vendedor + Gestor | inApp |
| `meta.atingidaParcial` | Metas | event | gamification | info | Vendedor | inApp, toast |
| `meta.batida` | Metas | event | gamification | success | Vendedor + Gestor | inApp, toast |
| `badge.conquistado` | Gamificação | event | gamification | success | Vendedor | inApp, toast |
| `ranking.mudouPosicao` | Gamificação | event | gamification | info | Vendedor | inApp |
| `cliente.dormente` | Comercial | derived | commercial | warning | Vendedor (owner) + Gestor | inApp |
| `vendedor.sobrecarregado` | Operacional | derived | operational | warning | Gestor + Owner | inApp |
| `positivacao.emRisco` | Comercial | derived | commercial | warning | Vendedor | inApp |
| `abc.clienteMudouClasse` | Comercial | event | commercial | info | Vendedor | inApp |
| `pedido.criado` | Vendas | event | transactional | info | Vendedor + Cliente | inApp (+ email/whatsapp deferred p/ cliente) |
| `pedido.statusMudou` | Vendas | event | transactional | info | Vendedor + Cliente | inApp (+ deferred) |
| `pedido.confirmado` | Vendas | event | transactional | success | Vendedor + Cliente | inApp (+ deferred) |
| `nf.emitida` | Vendas | event | transactional | info | Cliente | inApp (+ deferred) |
| `ecom.pedidoRecebido` | E-commerce | event | transactional | success | Cliente | inApp (+ deferred) |
| `ecom.pagamentoConfirmado` | E-commerce | event | transactional | success | Cliente | inApp (+ deferred) |
| `ecom.pedidoEnviado` | E-commerce | event | transactional | info | Cliente | inApp (+ deferred) |
| `ecom.carrinhoAbandonado` | E-commerce | event | marketing | info | Cliente | deferred (PRD-149) |
| `portal.orcamentoAprovado` | Portal B2B | event | transactional | success | Cliente | inApp (+ deferred) |
| `portal.faturaDisponivel` | Portal B2B | event | transactional | info | Cliente | inApp (+ deferred) |
| `portal.creditoProximoLimite` | Portal B2B | derived | commercial | warning | Cliente | inApp (+ deferred) |
| `sistema.manutencao` | Sistema | event | system | warning | Interno + Cliente | inApp, toast |
| `sistema.novoRecurso` | Sistema | event | system | info | Interno + Cliente | inApp |

---

## Anexo B — Defaults de Preferência por Papel/Tipo

> Matriz canal × categoria aplicada quando o destinatário ainda não tem preferências salvas. `✓` = habilitado por default; `—` = desabilitado por default; `🔒` = não silenciável (inApp sempre ativo).

| Categoria | Vendedor | Gestor | Owner | Cliente |
|-----------|----------|--------|-------|---------|
| transactional | inApp 🔒, toast ✓ | inApp 🔒, toast ✓ | inApp 🔒, toast ✓ | inApp 🔒 (+ email/whatsapp ✓ na Onda 8) |
| operational | inApp ✓, toast ✓ | inApp ✓, toast ✓ | inApp ✓, toast — | — |
| commercial | inApp ✓, toast — | inApp ✓, toast — | inApp ✓, toast — | inApp ✓ |
| gamification | inApp ✓, toast ✓ | inApp ✓, toast — | inApp —, toast — | — |
| system | inApp 🔒, toast ✓ | inApp 🔒, toast ✓ | inApp 🔒, toast ✓ | inApp 🔒 |
| marketing | — | — | — | inApp — (+ email/whatsapp opt-in na Onda 8) |

---

## Anexo C — Impacto no Roadmap (Onda 8)

> Bloco informativo para o Arquiteto e o Frederico decidirem o ajuste dos PRDs 141–150. **Não implementar nada disto aqui** — é apenas o registro de que a Onda 8 passa a referenciar esta fundação.

| PRD da Onda 8 | Ajuste sugerido em função do PRD-008 |
|---------------|--------------------------------------|
| PRD-141 (Email Transacional) | Implementa `EmailChannel` real sobre o contrato já existente; não recria modelo |
| PRD-143 (WhatsApp HSM) | Implementa `WhatsAppChannel` real; reaproveita roteamento e `deliveryStatus` |
| PRD-144 (SMS) | Implementa `SmsChannel` real |
| PRD-145 (Push Web) | Implementa `PushChannel` real |
| PRD-146 (Notification Center) | **Possível absorção pelo PRD-009** (UI já entregue na Fase 1); reavaliar se o 146 vira apenas "ativação dos canais reais na UI" |
| PRD-147 (Preferências LGPD) | Estende a matriz já existente com trilha legal de consentimento; não recria a tela |
| PRD-148 (Drip) / PRD-149 (Carrinho Abandonado) | Consomem o catálogo de eventos e os canais reais |
| PRD-150 (Migração de Stubs) | Troca os esqueletos de canal pelas implementações reais; remove os marcadores `deferred` |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ✅ CONCLUÍDO |
| **Data de Implementação** | 2026-05-31 |
| **Versão do App** | 0.52.0 |
| **Codinome** | Herald |
| **Implementado por** | Claude (Claude Code CLI) |
| **Observações** | Fundação invisível: modelo `INotification`, barramento de eventos, roteamento por regras/preferências, persistência via Provider Pattern (mock ativo / Supabase stub), canais (in-app/toast ativos; e-mail/WhatsApp/SMS/push como stubs deferidos para a Onda 8) e reconciliador de condições derivadas compartilhadas com o PRD-014. Harness de validação em `/design-system` (dev-only). UI no PRD-009 (Chime). |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 30/05/2026 | v1 | Criação inicial — fundação de notificações (modelo `INotification`, event bus, roteamento por regras/preferências, persistência via Provider Pattern, channel providers com inApp/toast ativos e email/whatsapp/sms/push como esqueletos, reconciliador absorvendo alertas do PRD-014). Dois públicos (interno + cliente final). Onda 8 mapeada no Anexo C |

---

**AILA - Sistemas Inteligentes**
