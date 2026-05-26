# Changelog

All notable changes to **GALLO BASE DIESEL** are documented here.
Format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer](https://semver.org/).

## [0.8.0] — Pilot · 2026-05-25

Conversa multicanal (PRD-011) — a coluna central do `ConversationLayout`
ganha vida. O vendedor agora atende dentro da plataforma com histórico
rico, envio com optimistic UI, indicador da janela de 24h do WhatsApp Meta
e ações contextuais auditadas. **Marco: a inbox (PRD-010) deixa de ser
um placeholder no centro — todas as conversas ficam realmente operáveis,
sem necessidade de fugir para WhatsApp Web.**

### Added

- **`ConversationPage`** em `/app/atendimento/:id` substitui o
  placeholder do PRD-001; consome `<ConversationLayout>` via `<Outlet>`
  com header, histórico, indicador de janela 24h e input de mensagem
- **`<ConversationHeader>`** com avatar (iniciais coloridas por hash do
  participante), nome, canal + número (subtítulo), pill de status com cor
  semântica (4 estados: aguardando / em_andamento / aguardando_cliente /
  resolvida / arquivada), badge "SDR ativo" quando aplicável, botões
  **Criar orçamento** (navega para `/app/orcamentos?customerId=...`),
  **Ficha** (toggle persistido em `localStorage`) e menu **⋮**
- **6 tipos de bubble tipados** em `components/bubbles/`:
  `<TextBubble>` (whitespace preservado), `<ImageBubble>` (thumbnail
  clicável que abre modal + skeleton de loading + caption opcional),
  `<AudioBubble>` (player com play/pause real, waveform SVG determinística
  por id, duração formatada `mm:ss`, placeholder de transcrição),
  `<DocumentBubble>` (ícone por extensão — PDF/XLSX/DOCX/ZIP — nome,
  tamanho determinístico, botão download), `<SystemBubble>`
  (centralizado, itálico, sem balão), `<TemplateBubble>` (selo "Template"
  + parser de variáveis + linha de quick-replies)
- **`<MessageBubble>`** discriminador polimórfico — escolhe o bubble certo
  via `mediaType` / `authorType` / prefixo `[template]`
- **Direção e autoria visual**: bubbles `in` à esquerda em surface neutra;
  `out` do vendedor à direita em `--primary/10`; **bubbles do SDR à
  direita em `--brand-parts/10` com borda esquerda sólida + badge "🤖 SDR"
  no canto + tooltip "Mensagem enviada pelo agente SDR"**
- **Status visual de envio (out only)** com tooltip explicativo:
  - `sent` ✓ cinza
  - `delivered` ✓✓ cinza
  - `read` ✓✓ azul
  - `failed` ⚠ vermelho com botão "Tentar novamente"
- **`<MessageList>`** com paginação por scroll-up (`IntersectionObserver`
  + sentinela no topo carrega mais antigas preservando posição via
  delta de `scrollHeight`), auto-scroll inteligente (somente quando o
  usuário já estava no fim — não interrompe leitura), `role="log"` +
  `aria-live="polite"` para acessibilidade
- **Marcadores temporais automáticos** entre grupos de mensagens via
  `groupMessagesWithDaySeparators`: "Hoje", "Ontem", dia da semana por
  extenso (últimos 7 dias) ou "12 de maio" (mais antigas; inclui ano
  quando diferente do atual)
- **`<MessageInput>`** com textarea de auto-resize (1-5 linhas, scroll
  interno após excesso), botões de **anexo** (dropdown imagem/documento/
  áudio — placeholders com toast "em breve"), **emoji** (popover com
  16 emojis e inserção na posição do cursor), **templates** (apenas
  visível como habilitado quando provider é Meta), **enviar** (Enter
  envia, Shift+Enter quebra), e linha de **sugestões IA** estáticas
  baseadas em palavras-chave da última mensagem do cliente ("preço",
  "estoque", "prazo", "boleto") com botões clicáveis que preenchem o
  textarea
- **Optimistic UI no envio** via `useMessageSend`:
  1. mensagem aparece imediatamente como `sent` (✓ cinza)
  2. após 200-500ms transita para `delivered` (✓✓ cinza)
  3. após 1-3s extras, com 80% de probabilidade vira `read` (✓✓ azul)
  4. em 5% das tentativas vira `failed` com retry inline
  Taxas configuráveis em `utils/sendSimulation.ts`
- **`<MetaWindowIndicator>`** com 4 estados visuais:
  - 🟢 Verde (> 12h): "Janela aberta — Xh restantes"
  - 🟡 Amarelo (1-12h): mesma copy + sugestão "Considere usar template"
  - 🔴 Vermelho (< 1h): "Janela fechando — X min restantes"
  - ⚪ Cinza (= 0): "Janela fechada — apenas templates HSM"
  Re-cálculo a cada 30s via `setInterval`; aparece **apenas** para Meta
  provider com `whatsappAccount.provider === "meta"` e conversa não-
  arquivada
- **`useMetaWindow`** computa tempo restante a partir do
  `lastInboundMessageAt` derivado das mensagens no contexto, expondo
  `canSendFreeText` que o input consome para desabilitar texto quando
  a janela fecha
- **`<TemplateDialog>`** modal com seletor de templates HSM mockados
  (4 templates: follow-up de orçamento, cobrança gentil, confirmação de
  entrega, saudação inicial), inputs para variáveis (`{{nome}}`,
  `{{produto}}`, etc.), pré-visualização com substituição em tempo real
  e botão "Enviar template" — habilita apenas quando todas as variáveis
  estão preenchidas
- **`<ConversationMenu>`** (kebab no header) com permissões dinâmicas via
  `usePermission`:
  - Marcar resolvida / Reabrir (qualquer com `edit` em `own`)
  - Marcar não-lida (reseta `gallo-conversation-last-view-...` para
    forçar badge na inbox)
  - Transferir (Owner/Gestor — abre `<TransferDialog>` com dropdown de
    vendedores da loja)
  - Escalar para gestor (Vendedor, quando SDR ativo — encontra primeiro
    gestor disponível via `accessibleStoreIds.length > 1`)
  - Pausar/Retomar SDR (Owner/Gestor, quando aplicável)
  - Arquivar/Desarquivar (Owner/Gestor)
  - Adicionar nota (qualquer com `edit` em customer — abre
    `<NoteDialog>` que chama `customersProvider.addNote`)
- **Toast com botão "Desfazer" (5s)** para ações reversíveis: resolver,
  arquivar, retomar, e cada uma grava `recordAuditLog` em ambas as
  direções (a ação original e o desfazer)
- **Auditoria via PRD-006** em toda mutation sensível
  (`conversation.resolve`, `conversation.transfer`,
  `conversation.archive`, `conversation.toggle_sdr`) com `before`/`after`
- **`<TypingIndicator>`** "Cliente está digitando…" com 3 pontos
  animados; aparece probabilisticamente (30% a cada 20-40s) em
  conversas `em_andamento` / `aguardando_cliente`, dura 3-8s
- **`useConversationDetail`** carrega conversa + customer/lead +
  whatsappAccount de uma vez, expondo `notFound` para o empty state e
  `refresh` para invalidação manual após mutações
- **`useMessages`** com paginação descendente (50/página) traduzida para
  ordem ascendente de display; cache local com `appendOptimistic`,
  `commit`, `fail`, `update` e `retry` para o ciclo de envio
- **`ConversationContext`** compartilha o estado de mensagens entre
  `<MessageList>` e `<MessageInput>` para que a janela 24h e as sugestões
  IA consigam ler a última mensagem inbound sem prop drilling
- **`IWhatsAppAccountsProvider`** novo contrato + impl mock + stub
  Supabase + hook `useWhatsAppAccountsProvider`, expondo `list` e `get`
  para alimentar capabilities e número do header
- **Catálogo de templates HSM mockados** em `utils/hsmTemplates.ts` com
  4 templates representativos, `renderTemplate` para substituição de
  variáveis e `templateReady` para validação inline
- **`CONVERSATION_STRINGS`** namespace em `i18n/pt-BR.ts` cobrindo
  header, empty states, separadores temporais, bubbles, status,
  indicador 24h, input, menu e diálogos
- **Empty states** para conversa não encontrada (com botão "Voltar à
  inbox") e conversa nova sem mensagens
- **Read-only mode** no input quando vendedor não é o atribuído ou a
  conversa está arquivada — copy explícita no rodapé

### Changed

- **`/app/atendimento/:id`** — rota deixa de ser `PlaceholderPage` e
  passa a renderizar `<ConversationPage>` real
- **Barrel `@/features/conversations`** expõe `ConversationPage` ao lado
  do `InboxPage` e `InboxCenterPlaceholder`
- **`IDataProviders`** ganha campo `whatsappAccounts` na agregação
  retornada pela factory; ambas as implementações (mock + Supabase stub)
  registradas no `getDataProviders()`

### Notes

- **`@tanstack/react-virtual` ficou de fora** — o gerador de mocks produz
  no máximo 25 mensagens por conversa e o histórico renderiza
  fluidamente sem virtualização. Quando o dataset crescer na Fase 2,
  basta envolver o `.map` do `<MessageList>` no `useVirtualizer` sem
  tocar nos bubbles. Comentário de planejamento mantido no componente.
- **Emoji picker dedicado ficou de fora** — usamos um popover do
  `shadcn` com 16 emojis representativos do dia-a-dia comercial
  (caminhão, peças, dinheiro, etc.) para evitar nova dependência sob o
  supply-chain guard de 24h do `bunfig.toml`
- **Anexos reais ficaram de fora** — os botões abrem dropdown com 3
  opções (imagem/documento/áudio) e disparam `toast.info("em breve")`
  porque o MVP não tem storage; o fluxo de mídia já está modelado nos
  bubbles e nos tipos para a entrada de Fase 2
- **IA real ficou de fora** — sugestões são heurísticas estáticas
  baseadas em palavras-chave (palavra "preço" sugere "Vou te passar o
  valor…"). LangChain/OpenAI virá no PRD-101+
- **Codinome Pilot** marca o momento em que o vendedor pilota a
  plataforma de ponta a ponta: lê histórico, envia mensagem, recebe
  template HSM dentro da janela de 24h e executa ações contextuais sem
  precisar abrir outra ferramenta. O CRM deixa de ser passivo

## [0.7.0] — Hub · 2026-05-25

Inbox unificado (PRD-010) — primeira tela do Bloco 1 (CRM e Central de
Atendimento). A coluna esquerda do `ConversationLayout` ganha vida: lista
paginada de 80+ conversas mockadas, 6 filtros combinados sincronizados na
URL, 3 modos de ordenação (recência, tempo de espera, prioridade ABC),
busca textual com destaque, atualização em tempo real simulada,
ações rápidas no hover (atribuir-me, transferir, arquivar), e estados
contextuais para vazio/erro. **Marco: porta de entrada do CRM ativa —
PRD-011 (Conversa) e PRD-012 (Ficha) podem ser implementados agora.**

### Added

- **`src/features/conversations/`** em 5 subpastas (`pages`, `components`,
  `hooks`, `utils`, `i18n`) + barrel `@/features/conversations` como
  superfície pública
- **`InboxPage`** em `/app/atendimento` consumindo `<ConversationLayout>`
  via slot esquerdo, com `app.atendimento.tsx` convertido para layout
  route que orquestra lista + `<Outlet>` para a coluna central
- **`app.atendimento.index.tsx`** com `<InboxCenterPlaceholder>` para o
  estado "selecione uma conversa"
- **`<ConversationListItem>`** densamente informativo: avatar com
  iniciais coloridas por hash, nome, timestamp relativo auto-atualizado a
  cada minuto, preview da última mensagem (com handling de mídia),
  contador de não-lidas (limite 9+), badges de canal/SDR/temperatura/Novo,
  borda esquerda colorida por status, destaque de busca via `<mark>`
- **6 filtros combinados** via dropdowns shadcn: Status, Canal, Atribuição
  (contextual ao papel — Vendedor só vê "Atribuídas a mim"; Owner/Gestor
  ganha "Todas", "Sem atribuição" e sub-lista por vendedor), Tags
  multi-select, Período (24h/7d/30d), busca textual debounced 300ms
- **3 modos de ordenação**: Mais recentes (default), Tempo de espera
  (filtra `aguardando` + ordena asc), Prioridade ABC (join com
  `IABCClassification` + tiebreak por recência)
- **`useInboxFilters`** sincroniza filtros com query params da URL via
  TanStack Router `useSearch`/`useNavigate`; defaults são omitidos do
  URL para mantê-lo enxuto; `validateSearch` rejeita valores inválidos
  silenciosamente
- **`useConversationsList`** com paginação cursor-style (30/página) e
  scroll infinito via `IntersectionObserver`; suporta `refreshKey` para
  refetch em camadas (real-time refaz páginas 1..N preservando posição)
- **`useRealtimeConversations`** dispara mensagens simuladas a cada
  8-15s (jittered) chamando `messagesProvider.simulateIncoming`; bumpa
  `tick` para o `useConversationsList` refrescar; toggle persistido em
  `localStorage` chave `gallo-realtime-enabled`
- **`<RealtimeToggle>`** no header da lista (ícone `mdi:radio-tower` /
  `mdi:radio-tower-off`) com tooltip e estado "Atualização pausada"
- **`<QuickActions>`** no hover/foco do item: Atribuir-me (qualquer user
  quando conversa está sem dono), Transferir (Owner/Gestor — dropdown
  de vendedores via `useSellersProvider`), Arquivar (Owner/Gestor) —
  cada ação grava `recordAuditLog` com `before`/`after` e mostra toast
  via sonner com botão "Desfazer" (rollback de 5s)
- **`<InboxEmptyState>`** contextual: copy varia entre "sem conversas",
  "filtros vazios" e "busca sem resultados"; botão "Limpar tudo" inline
- **`useUnreadTracking`** persiste timestamp de última visualização por
  usuário+conversa (`gallo-conversation-last-view-{userId}-{convId}`)
  para bold/unbold após mark read; sync cross-tab via `storage` event
- **`useLastSelectedConversation`** lembra a última conversa aberta
  (`gallo-last-conversation-id`) e reabre automaticamente ao voltar à
  inbox sem id na URL
- **Atalhos de teclado**: `↑↓` navega entre conversas, `/` foca a busca,
  `Enter` abre (intrínseco ao Link)
- **Mobile**: `<ConversationLayout>` ganha prop `mobileShow: 'list' |
'conversation'` para alternar entre lista cheia (sem seleção) e
  conversa cheia (com seleção) em viewports < 768px
- **Real-time + SDR**: badge prominente "🤖 SDR" com tooltip explicativo
  quando `isSdrActive: true`; badge "Novo!" verde por 60s após
  `lastMessageAt`

### Changed

- **`IConversationsProvider.list`** aceita novos params: `tags?: string[]`,
  `search?: string`, `fromDate?/toDate?: string`, `unassigned?: boolean`,
  `orderBy?: 'lastMessageAt' | 'abcClass'`, `orderDir?: 'asc' | 'desc'`;
  e `status` agora aceita array (`ConversationStatus[]`)
- **`IMessagesProvider`** ganha método `simulateIncoming(conversationId,
text?)` que cria mensagem `direction: 'in'` no mock (no-op no
  Supabase stub até PRD-100+)
- **Mock `conversationsApi.list`** implementa busca textual em
  `customer.name`/`phone`/últimas 20 mensagens, filtro de tags
  (intersecta com `customer.tags`/`lead.tags`), ordenação ABC com
  tiebreak por recência
- **Mock `conversationsApi.archive`** agora seta `status: 'arquivada'`
  em vez de remover do dataset (alinhado com o status enumerado)
- **`_storeScope.ts`** ganha helper `withOwnSellerScope` que injeta
  `assignedSellerId = currentUser.id` quando o usuário tem scope `own`
  (não `store`/`all`) — Vendedor agora vê apenas conversas próprias
  sem precisar de filtragem manual no componente
- **`<ConversationLayout>`** ganha prop `mobileShow` (default
  `'conversation'`, retrocompatível) para suportar lista em tela cheia
  no mobile

### Notes

- **Sem novas dependências de runtime** — `date-fns` (timestamps),
  `sonner` (toasts) e `@tanstack/react-router` já presentes; supply-chain
  guard preservado (`bunfig.toml` intocado)
- **Virtual scroll** ficou de fora do MVP — 80 conversas mockadas
  renderizam fluidamente com scroll comum + `IntersectionObserver`;
  pode-se adicionar `@tanstack/react-virtual` em iteração futura quando
  o dataset crescer (Fase 2)
- **Codinome Hub** marca a abertura do CRM como hub central do operador:
  inbox unificada que concentra toda a comunicação multicanal num só
  lugar antes da expansão pela conversa (PRD-011), ficha (PRD-012),
  distribuição (PRD-013) e métricas gerenciais (PRD-014)

## [0.6.0] — Compass · 2026-05-25

Multi-loja (PRD-007) — fundação completa de operação cross-store. Toda
entidade comercial passa a carregar `storeId` de forma obrigatória, as
listagens dos providers ganham filtro implícito por loja ativa via
`withStoreScope`, o `<StoreSwitcher>` substitui o placeholder do TopBar e
uma página read-only em `/app/configuracoes/lojas` consolida a visão. No
MVP só existe a matriz; a infraestrutura está pronta para receber filiais
e parceiras na Fase 2 sem refatoração arquitetural. **Marco: Bloco 0
(Fundação) está completo.**

### Added

- **`src/features/multistore/` em 5 subpastas** (`hooks`, `utils`,
  `components`, `pages`, `store`) + barrel `@/features/multistore` como
  única superfície pública da camada multi-loja
- **`MultistoreProvider`** entre `<AuthProvider>` e a árvore de rotas;
  carrega o roster de lojas via `useStoresProvider()`, resolve a loja
  ativa em quatro etapas (localStorage → loja primária → primeira
  acessível → null), e persiste a escolha na chave `gallo-current-store-id`
- **Hooks reativos** `useCurrentStore()`, `useAccessibleStores()` e
  `useStoreById()` consumindo o context
- **Helper `withStoreScope(params, ctx)`** com tipagem genérica
  preservando o tipo de entrada — três comportamentos: usuário anônimo →
  `storeId='__no_user__'`; scope `all` → cross-store; demais →
  `storeId=currentStoreId`
- **Helpers `getCurrentContext()`** (acesso síncrono fora de React),
  **`getStoreForUser()`** e **`isStoreAccessible()`**
- **Holder externo `multistoreStore`** com pub/sub pequeno para o
  contexto sincronizar com chamadas fora de React (mock providers em
  selectors)
- **Helpers internos do mock layer** (`_storeScope.ts`):
  `scopedListParams`, `withCreateStoreId`, `assertImmutableStoreId`
- **`<StoreSwitcher>`** integrado ao `<TopBar>` substituindo o placeholder
  estático — sempre visível, abre dropdown mesmo com 1 loja com nota
  "Filiais e parceiras serão habilitadas na Fase 2"; `setCurrentStore`
  com fallback de toast em erro
- **`<StoreBadge store>`** pill compacta por tipo (matriz/filial/parceira)
  pronta para listas cross-store na Fase 2
- **`StoresPage`** em `/app/configuracoes/lojas` (read-only), com card
  por loja acessível mostrando CNPJ, endereço, divisões ativas, número
  de vendedores e clientes vinculados; entrada no `SettingsLayout`
  gated por `permission: { resource: 'store', action: 'view' }`
- **Auditoria de troca de loja** via `auditLog({ action: 'switch_store' })`
  reusando o pipeline do PRD-006 — visível em `/app/configuracoes/auditoria`
  quando exercitada na Fase 2
- **Campo `accessibleStoreIds?: ID[]`** em `ISeller` (extensão pontual do
  PRD-002) habilitando a Fase 2 a atribuir vendedores a múltiplas lojas
- **Campo `storeId: ID`** em `IMockUserProfile` + `accessibleStoreIds?`
  como input para o provider resolver a loja ativa por perfil mockado
- **Campo `storeId: ID`** em `ICommission` (era a única entidade
  transacional faltando o campo); generator e `commissionsApi` atualizados
- **Filtros `storeId` adicionados** em `commissionsApi`, `recommendationsApi`,
  `auditsApi` e suas contratuais correspondentes
- **`docs/multistore.md`** com filosofia, helpers, fluxos de erro,
  esqueleto de policies Supabase RLS e roteiro passo a passo para
  ativar uma filial na Fase 2
- **Glossário** ganha entradas para "Loja ativa (current store)",
  "Matriz", "Filial" e "Parceira"

### Changed

- **Todos os 11 mock providers com entidades scoped por loja** passam a
  consumir `scopedListParams(params, resource)` em `list()` —
  `customers`, `orders`, `quotes`, `leads`, `conversations`,
  `commissions`, `goals`, `transfers`, `recommendations`, `sellers`,
  `audits`
- **Mutations `create`** de `customers`, `orders`, `quotes` e `leads`
  preenchem `storeId` automaticamente quando o caller omite — via
  `withCreateStoreId`
- **Mutations `update`** das mesmas entidades bloqueiam alteração de
  `storeId` (`MockValidationError` com mensagem clara — imutabilidade
  no MVP, transferência fica para Fase 2)
- `auditLog()` e `logMockMutation()` resolvem `storeId` via
  `getCurrentContext()` (com fallback ao seed `store-matriz`), abandonando
  o hardcode anterior
- `<TopBar>` substitui o placeholder "GALLO Matriz" pelo `<StoreSwitcher>`
  reativo
- `SettingsLayout` ganha entrada "Lojas" gated por permissão
- `IListAuditsParams`, `IListCommissionsParams`, `IListRecommendationsParams`
  passam a aceitar `storeId?`

## [0.5.0] — Pilot · 2026-05-25

RBAC visual (PRD-006) — matriz canônica de permissões para os 7 papéis, com
helpers/hooks/componentes reativos, integração com o route guard do PRD-003,
auditoria visual e logging de runtime acoplado aos providers. Tudo é
disciplina de UX/UI; a segurança real entra na Fase 2 com Supabase RLS.

### Added

- **`src/features/rbac/` em 5 subpastas** (`permissions`, `utils`, `hooks`,
  `components`, `pages`) + barrel `@/features/rbac` como única superfície
  pública
- **Matriz de permissões** para 7 papéis (`Owner`, `Gestor`, `Vendedor`,
  `SDR`, `Cliente`, `VendedorExterno`, `Financeiro`) × 18 recursos × 5
  ações × 4 scopes em `permissions/matrix.ts`, com índice pré-computado
  `EFFECTIVE_PERMISSIONS_INDEX` para lookup O(1)
- **Constantes tipadas** `RESOURCES`, `ACTIONS`, `SCOPE_ORDER` com union
  literal — `ResourceName` e `PermissionAction` ganham checagem em compile-time
- **Helpers síncronos** `hasPermission()`, `compareScopes()`,
  `scopeSatisfies()`, `getEffectivePermissions()`, `getCurrentUserScope()`
- **Hooks reativos** `usePermission(resource, action, scope?)` e
  `useCurrentRole()` que consomem o `AuthProvider` do PRD-003 e
  re-renderizam ao trocar perfil
- **Componentes declarativos** `<Can resource action scope? fallback?>` e
  `<Forbidden message?>` (reusa o `EmptyState` do PRD-001)
- **Extensão de `requireAuth(pathname, roles?, permission?)`** mantendo
  retrocompatibilidade — todas as rotas existentes continuam funcionando
- **Tela `/app/configuracoes/papeis`** (read-only) com tabs para os 7
  papéis e tabela de recursos × ações × scope; badge "Edição na Fase 2"
- **Tela `/app/configuracoes/auditoria`** com lista paginada, filtros
  laterais (ator, ação, recurso, faixa de data) sincronizados com a URL,
  expansão de cada item mostrando `before`/`after` em JSON
- **Botão "Exportar CSV"** placeholder com tooltip "Disponível na Fase 2"
- **Audit log runtime**: novo `IAuditsProvider` no barrel
  `@/providers/data` com `mock` + `supabase` stub; `recordAuditLog()`
  fire-and-forget exposto publicamente; helper `auditLog()` em
  `@/features/rbac` para uso por features
- **Mock providers de `customer`, `order`, `quote`, `commission`** passam
  a registrar audit log automaticamente em `create`/`update`/`delete`
  (e `approve` em commission)
- **`AuthProvider`** registra `auth.signin` e `auth.signout` em todo
  evento de troca de perfil
- **`SettingsLayout`** ganha filtragem por permissão fina (não só por
  papel) e exibe entradas "Papéis" e "Auditoria" para quem tem `view` em
  `role` / `audit_log`
- **`docs/rbac.md`** com matriz completa, exemplos de uso e esqueleto das
  policies Supabase RLS previstas para a Fase 2

### Changed

- `requireAuth(pathname, roles?, permission?)` agora aceita um terceiro
  parâmetro opcional `permission` que aciona a checagem RBAC fina; a
  assinatura antiga `requireAuth(path, [...roles])` continua válida
- `auditsApi` (mocks/api/audits.ts) ganha `create`, suporte a filtros
  multi-valor (`actorIds`, `actions`, `resources`) e por faixa de data
  (`since`, `until`); `mutations.ts` expõe `audits` como collection
  mutável
- `package.json` → `0.5.0`

## [0.4.0] — Hub · 2026-05-25

Provider Pattern (PRD-005) — a "fundação invisível" que protege todo o app
de retrabalho na Fase 2. Features passam a consumir dados exclusivamente
através de hooks tipados; a escolha entre mock e Supabase vira uma variável
de ambiente.

### Added

- **`src/providers/data/` em 4 subpastas** (`contracts`, `impl/mock`,
  `impl/supabase`, `hooks`) + `factory.ts`, `context.tsx`, `errors.ts` e
  barrel `@/providers/data` como única superfície pública
- **16 contratos TypeScript** (`ICustomersProvider`, `IVehiclesProvider`,
  `ILeadsProvider`, `IConversationsProvider`, `IMessagesProvider`,
  `IPartsProvider`, `IQuotesProvider`, `IOrdersProvider`,
  `ICommissionsProvider`, `IGoalsProvider`, `IRecommendationsProvider`,
  `ITransfersProvider`, `ISegmentsProvider`, `ISellersProvider`,
  `IStoresProvider`, `ISettingsProvider`) espelhando 1:1 as APIs do
  PRD-004, com tipo agregador `IDataProviders`
- **16 implementações `mockXxxProvider`** delegando para `@/mocks` — pura
  delegação, sem lógica adicional
- **16 esqueletos `supabaseXxxProvider`** lançando `NotImplementedError`
  tipado com referência ao PRD futuro de implementação
- **`getDataProviders()`** lê `import.meta.env.VITE_DATA_SOURCE`
  (`mock` default | `supabase`) com fallback `mock` + `console.warn` em
  dev quando valor é inválido; instâncias são singletons para referência
  estável no React Context
- **`<DataProvidersProvider>`** inserido entre `<ThemeProvider>` e
  `<AuthProvider>` no `__root.tsx`; expõe os providers via Context
- **16 hooks** (`useCustomersProvider`, `useOrdersProvider`, etc.) com
  helper interno `useDataProviderSlice` que lança erro claro quando usado
  fora do Provider
- **`NotImplementedError`** com `instanceof Error` e mensagem completa
  (provider + método + PRD futuro)
- **`.env.example`** documentando `VITE_DATA_SOURCE`
- **`src/vite-env.d.ts`** tipando `import.meta.env.VITE_DATA_SOURCE` como
  `'mock' | 'supabase' | undefined`
- **Regras ESLint `no-restricted-imports`** bloqueando: features
  importarem `@/mocks` ou `@/mocks/api/*` (apenas `impl/mock/**` pode);
  qualquer arquivo fora de `src/providers/data/` importar `impl/*`,
  `contracts/*` ou `factory`; com exceção dev-only para
  `src/routes/design-system.tsx` (acessa `useResetMocks`)
- **`docs/provider-pattern.md`** com filosofia, diagrama de camadas,
  passo a passo de adição de novo agregado, regras de isolamento e
  aplicação futura em outras integrações (WhatsApp, pagamento, frete)

### Changed

- **`src/routes/__root.tsx`** — árvore de providers passa a ser
  `QueryClientProvider > ThemeProvider > DataProvidersProvider >
AuthProvider > <Outlet/>`

## [0.3.0] — Genesis · 2026-05-25

Camada de mocks completa (PRD-004) — a "fundação invisível" sobre a qual todo
o app vai operar até a Fase 2 (Supabase).

### Added

- **`src/mocks/` em 5 subpastas** (`config`, `data`, `generators`, `store`,
  `api`, `hooks`) com barrel raiz `@/mocks` como única superfície pública
- **Geradores determinísticos** para ~32 entidades do modelo conceitual
  (PRD-002): clientes B2B/B2C, veículos, leads, conversas, mensagens, peças,
  orçamentos, pedidos, comissões, metas, recomendações, transferências de
  carteira, segmentos, papéis, auditoria, contas WhatsApp, badges, ranking,
  positivação e curva ABC
- **Determinismo via `seedrandom`** + `@faker-js/faker` (locale `pt_BR`),
  reseedados por contexto: a mesma seed produz exatamente o mesmo dataset em
  qualquer máquina
- **Volumes realistas**: ~2200 itens no dataset default (70 clientes,
  200 peças, 80 conversas, ~600 mensagens, 120 pedidos espalhados em
  12 meses, 80 leads, 30 orçamentos, 8 metas, 25 recomendações)
- **Integridade referencial**: validador em dev percorre todas as FKs no fim
  do bootstrap e loga inconsistências sem quebrar a UI
- **Store Zustand interno** (`mockStore`) com `selectors` e `mutations`
  tipados — bootstrap automático no primeiro acesso à store
- **APIs públicas** seguindo contrato CRUD + queries específicas por agregado
  (`customersApi`, `vehiclesApi`, `leadsApi`, `conversationsApi`,
  `messagesApi`, `partsApi`, `quotesApi`, `ordersApi`, `commissionsApi`,
  `goalsApi`, `recommendationsApi`, `transfersApi`, `segmentsApi`,
  `sellersApi`, `storesApi`, `settingsApi`, `auditsApi`, `badgesApi`,
  `rankingsApi`, `positivationsApi`, `abcsApi`, `whatsappAccountsApi`,
  `rolesApi`) — assinatura idêntica à do `SupabaseProvider` da Fase 2
- **Paginação genérica** (`IPaginatedResult<T>` + `paginate()` helper)
  uniforme em todas as operações `list`
- **Simulação de latência** (80–180ms default) e **erro tipado** (`ERROR_RATE`
  default 0,5% em dev) em toda chamada de API via wrapper `runApi`
- **Erros tipados**: `MockError` base + `MockNotFoundError`,
  `MockValidationError`, `MockNetworkError`, `MockUnauthorizedError` —
  consumidores narrowing via `instanceof`
- **Logs compactos** no console em dev (`MOCK_LOGS_ENABLED`) para debug, com
  cor por status
- **Hook `useResetMocks`** + seção **"Mocks (dev only)"** em `/design-system`
  permitindo reset com seed customizada ou nova seed automática
- **Regra ESLint** `no-restricted-imports` bloqueando imports de
  `@/mocks/store/*`, `@/mocks/generators/*` e `@/mocks/data/*` fora da pasta
  `src/mocks/` — força uso do barrel público

### Changed

- `package.json` adiciona `zustand`, `@faker-js/faker`, `seedrandom` e
  `@types/seedrandom` como dependências

## [0.2.0] — Genesis · 2026-05-25

Esqueleto navegável da plataforma. PRD-003 implementado.

### Added

- **Roteamento end-to-end**: 3 árvores de rota (`/app/*` interno, `/loja/*`
  vitrine, `/auth/*` login) + rotas de erro (`/sem-permissao`, `/erro`).
  Todas as 30+ rotas funcionais com placeholders referenciando os PRDs futuros
- **Auth mockada** com 3 perfis (Owner "João Gallo", Vendedor "Carlos Santos",
  Cliente "Transportadora Aurora") em `/auth/login`, persistência em
  `localStorage` chave `gallo-mock-user`
- **AuthProvider + useAuth** hook com `signIn`, `signOut`, `hasRole`
- **Guards de role** via `beforeLoad` em rotas TanStack — `/app/*` exige
  Owner ou Vendedor; rotas de Gestão e Carteira exigem Owner
- **8 layouts reutilizáveis**: AppLayout, AuthLayout, EmptyLayout, LojaLayout,
  ConversationLayout (3 colunas), DetailLayout (2 colunas), DashboardLayout,
  SettingsLayout (sub-sidebar)
- **Sidebar** contextualizada por papel (Owner vê todos os agrupamentos;
  Vendedor vê subconjunto), expandida/colapsada com persistência em
  `localStorage` (`gallo-sidebar-collapsed`)
- **TopBar** com logo, seletor de loja (mock "GALLO Matriz"), busca global
  placeholder, notificações com badge + dropdown mockado, ThemeSwitcher,
  avatar com dropdown (Perfil, Configurações, Trocar perfil, Sair)
- **BottomNav** mobile (`<768px`) com 4 itens prioritários + Sheet "Mais"
- **LojaHeader** e **LojaFooter** para vitrine pública
- **PlaceholderPage / EmptyState** componentes reutilizáveis
- **RouteSkeleton** para `<Suspense>` fallback (lazy loading já ativo via
  `tanstackRouter({ autoCodeSplitting: true })`)
- Rota raiz `/` redireciona inteligentemente baseado em auth e papel
- Página `/app/configuracoes/aparencia` minimamente funcional (ThemeSwitcher
  integrado)

### Changed

- `__root.tsx` agora envolve a árvore em `<AuthProvider>`
- Home (`/`) deixou de ser página estática — agora é redirect via
  `beforeLoad`
- README implícito: estrutura `src/features/shell/` e `src/features/auth/`
  introduzidas

### Notes

- **Adaptação ao stack**: PRD-003 especifica React Router v6; mantivemos
  TanStack Router (já configurado e funcional). Conceitos equivalentes
  (rotas aninhadas, lazy loading, guards via `beforeLoad`, layout routes).
- Auth mockada é **UX, não segurança** — qualquer um pode editar
  localStorage. Proteção real virá na Fase 2 (Supabase Auth + RLS).
- Conteúdo funcional das 30+ telas internas será preenchido pelos PRDs
  específicos dos Blocos 1-6.

## [0.1.1] — Genesis · 2026-05-25

Modelo conceitual de domínio completo. PRD-002 implementado.

### Added

- Modelo conceitual GALLO consolidado em `src/shared/types/` (10 arquivos)
  cobrindo ~40 entidades: plataforma, pessoas, cliente, lead, conversa,
  catálogo, comercial e BI
- Tipos utilitários comuns: `ID`, `ISO8601`, `Money`, `Division`,
  `ThemeName`, `ThemeMode` em `common.ts`
- Barrel export em `src/shared/types/index.ts` — import único via
  `@/shared/types`
- `docs/glossario.md` — definições operacionais oficiais do domínio
  (termos técnicos do mercado de peças pesadas, comerciais, operacionais
  e arquiteturais)
- JSDoc com `@see` glossário nas interfaces principais
  (`ICustomer`, `IPart`, `IConversation`, `ICarteiraTransfer`,
  `IPositivation`, `IRecommendation` etc.)
- Discriminated union B2B/B2C em `ICustomer` (CNPJ vs CPF)
- Suporte modelado de 4 tipos de transferência de carteira
  (`CarteiraTransferType`)
- Capability matrix de WhatsApp (`IWhatsAppCapabilities`) preparando UI
  adaptativa por provider

### Changed

- `tsconfig.json` reforçado com `noImplicitAny`, `strictNullChecks` e
  `noUncheckedIndexedAccess`
- `src/config/themes.ts` agora re-exporta `ThemeName` e `ThemeMode` de
  `@/shared/types` (fonte única)
- `src/lib/contrast.ts` ajustado para o novo `noUncheckedIndexedAccess`
- `src/components/ui/input-otp.tsx` ajustado para acesso seguro a slots

### Notes

- `exactOptionalPropertyTypes` permanece **desativado** — incompatível
  com boilerplate atual do shadcn/ui em vários componentes
  (`context-menu`, `dropdown-menu`, `menubar`, `Icon`). Registrado como
  tech-debt; reavaliar em PRD futuro de hardening.
- Equipes (`ITeam`) modeladas mas **dormentes** no MVP.
- SERVICE e INDUSTRIAL modeladas via `Division` mas dormentes no MVP
  (todas as entidades comerciais nascem com `division: 'parts'`).

## [0.1.0] — Genesis · 2026-05-25

Fundação visual da plataforma. PRD-001 implementado.

### Added

- Identidade visual GALLO BASE DIESEL aplicada à UI
- Arquitetura de tokens em 3 camadas: primitivos → semânticos → tema
- Sistema de **4 temas × 2 modos** (8 combinações):
  Diesel (Black Gold), Parts (Forest), Service (Crimson), Industrial (Amber);
  light/dark/auto
- `ThemeProvider`, hook `useTheme()`, `ThemeSwitcher` com codinomes UI
- Persistência em `localStorage` (`gallo-theme`, `gallo-mode`) com fallback
  silencioso quando indisponível
- Script anti-FOUC inline no `<head>` aplicando tema/modo antes do primeiro paint
- Tipografia oficial: **Saira Condensed** (display), **Inter** (UI),
  **JetBrains Mono** (códigos OEM) via Google Fonts com `font-display: swap`
- Logo GALLO em variantes (`horizontal`, `vertical`, `mark`) — placeholders
  tipográficas que adaptam cor ao modo
- Favicon SVG com signo GALLO
- Wrapper `<Icon>` sobre Iconify (`@iconify/react`) com fallback gracioso
  e carregamento sob demanda
- Layout primitives: `Stack`, `Inline`, `Grid`, `Container`
- Galeria shadcn/ui customizada consumindo apenas tokens semânticos
- Rota `/design-system` (dev-only, redireciona em produção) com:
  tokens primitivos, tokens semânticos resolvidos, tipografia, espaçamento,
  raios, sombras, ícones recomendados, galeria de componentes,
  validador de contraste WCAG 2.1 em tempo real
- Respeito a `prefers-reduced-motion`

### Notes

- Logos atuais são **placeholders tipográficas**; substituir pelos SVGs
  oficiais em `public/` quando disponíveis.
- Cores funcionais (`success`/`warning`/`danger`/`info`) são propositalmente
  distintas das submarcas para evitar confusão semântica.
