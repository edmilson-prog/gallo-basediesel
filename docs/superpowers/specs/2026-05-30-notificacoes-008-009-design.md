# Design — Sistema de Notificações (PRD-008 `Herald` + PRD-009 `Chime`)

> **Data:** 2026-05-30
> **Sessão:** Brainstorming (superpowers) com companion visual
> **Épico:** "Sistema de Notificações da Plataforma" — Bloco 0 (Fundação) + camada de superfície
> **Ordem obrigatória:** PRD-008 (fundação invisível) → PRD-009 (UI)
> **PRDs-fonte:** [PRD-008](../../prds/PRD-008-fundacao-notificacoes.md) · [PRD-009](../../prds/PRD-009-notification-center-preferencias.md)

Este documento consolida as **decisões tomadas** e o **design visual aprovado** na sessão de brainstorming. Os PRDs permanecem como fonte de requisitos; aqui registramos resoluções de decisões pendentes, a validação contra o código existente e o design das telas (PRD-009). É o input para o plano de implementação.

---

## Parte 1 — Fundação de Notificações (PRD-008 · codinome **Herald**)

Camada **sem UI**. Estabelece modelo, barramento, roteamento, persistência (Provider Pattern), canais e reconciliador.

### 1.1 Arquitetura — dois eixos perpendiculares

- **Persistência** (Mock/Supabase via `VITE_DATA_SOURCE`): `INotificationStore` + `INotificationPreferenceStore`.
- **Entrega** (channel registry): `INotificationChannel` → `InApp`/`Toast` **ativos**; `Email`/`WhatsApp`/`SMS`/`Push` **esqueletos** (`NotImplementedError` apontando PRDs 141/143/144/145).

Espelha exatamente o padrão de [`src/providers/data/`](../../../src/providers/data/) (PRD-005): `factory` (singleton síncrono) → `context` → `contracts` → `hooks` → `impl/{mock,supabase}`, com `_storeScope` (RBAC/multi-loja), `_audit` e `NotImplementedError`.

### 1.2 Estrutura de pastas alvo (`src/providers/notifications/`)

```
notifications/
├── index.ts                 # barrel público (hooks + types) — única superfície importável por features
├── context.tsx · factory.ts # NotificationProvidersProvider; monta em __root entre Data e Auth
├── errors.ts                # reusa NotImplementedError
├── bus.ts                   # notificationBus (emit/subscribe, in-app síncrono, NÃO bloqueante)
├── events.ts                # NotificationEventType (union do Anexo A) + payloads tipados
├── routing/{rules,dedupe,router}.ts   # regra→destinatários/categoria/severidade/canais; dedupeKey; fan-out write-time
├── reconciler.ts            # derivadas: lê settings, cria/expira
├── conditions/              # ★ lógica de condição extraída (compartilhada com PRD-014) — ver 1.4
├── preferences/defaults.ts  # matriz canal×categoria por papel/tipo (Anexo B)
├── contracts/{notifications,preferences,_shared}.ts
├── channels/{_contract,inApp,toast,email,whatsapp,sms,push}.ts + registry
├── hooks/{useNotifications,useUnreadCount,useNotificationPreferences}.ts
└── impl/{mock,supabase}/{notifications,preferences}.ts
```

ESLint `no-restricted-imports` isolando `impl/*`, `contracts/*` e `factory` (mesmo padrão do PRD-005, ver [`eslint.config.js`](../../../eslint.config.js)).

### 1.3 Tipos de domínio (`src/shared/types/notification.ts`, exportado no barrel)

`INotification`, `INotificationAction`, `INotificationPreference` + unions literais: `NotificationLifecycle`, `NotificationCategory`, `NotificationSeverity`, `NotificationStatus`, `NotificationChannel`, `NotificationRecipientType`, `ChannelDeliveryStatus`. Regras: ISO8601 string (nunca `Date`), opcional com `?` (nunca `| null`), sem `enum`.

### 1.4 Decisões resolvidas

| Decisão pendente (PRD-008)             | Resolução                                                                                                                                                   | Fundamento no código                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Origem dos limiares das derivadas**  | Reusar `IManagerDashboardSettings` — já existem `conversationWaitingHoursThreshold`, `sellerOverloadThreshold`, `alert*Enabled`. **Sem novos campos.**      | [`src/shared/types/platform.ts`](../../../src/shared/types/platform.ts)                                                        |
| **Cadência de reconciliação**          | Reusar `settings.alertPollingSeconds` (mesmo valor que `useActiveAlerts` já usa)                                                                            | [`useActiveAlerts.ts`](../../../src/features/manager-dashboard/hooks/useActiveAlerts.ts)                                       |
| **Reconciliador vs `useActiveAlerts`** | **Extrair lógica de condição compartilhada** para `notifications/conditions/` — consumida pelo reconciliador E pelo PRD-014. Fonte única, zero divergência. | `buildClienteADormenteAlerts` / `buildVendedorSobrecarregadoAlerts` / `buildConversaSemRespostaAlerts` em `useActiveAlerts.ts` |
| **Codinome**                           | **Herald**                                                                                                                                                  | —                                                                                                                              |

### 1.5 Coexistência (evita "buraco" entre 008 e 009)

O 008 **não tem UI**: `<ActiveAlertsList>` + `useActiveAlerts` (PRD-014) **continuam funcionando** durante o 008. O reconciliador passa a _produzir_ as derivadas; a _migração_ do `<ActiveAlertsList>` para consumir o center é do **PRD-009** (RF-029). Durante o 008, ambos coexistem lendo a lógica de condição compartilhada.

### 1.6 Pontos de integração (mock/seed/harness)

- **Seeds:** novo gerador em [`src/mocks/generators/`](../../../src/mocks/generators/) plugado no `bootstrap.ts` (`IBootstrappedDataset`), seed determinístico, pt-BR.
- **Harness de validação:** seção dev-only em [`src/routes/design-system.tsx`](../../../src/routes/design-system.tsx) para emitir eventos de teste e inspecionar roteamento/entrega no console (RF-034).
- **ToastChannel:** religa os toasts hoje disparados localmente (sonner) sem alterar a UX visível.

### 1.7 Fases (PRD-008) — 5 fases

1. Modelo de domínio + glossário + delta PRD-002.
2. Persistência (contracts + mock + esqueleto Supabase + factory + hooks + ESLint).
3. Barramento + roteamento + dedupe + preferências (+ defaults Anexo B).
4. Channel providers (inApp/toast ativos + esqueletos) + registry.
5. Reconciliador (lógica extraída) + groupKey + seeds + harness.

---

## Parte 2 — Notification Center & Preferências (PRD-009 · codinome **Chime**)

Camada visível, consome **apenas** os hooks do PRD-008.

### 2.1 Decisões resolvidas

| Decisão pendente (PRD-009)                      | Resolução                                                                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Páginas do cliente vs PRD-065 (inexistente)** | **Rota direta sobre `LojaLayout`** agora (sessão mock "Cliente"), estruturada para plugar no menu quando o PRD-065 existir |
| **Local da preferência do cliente**             | **Página própria** `/loja/conta/preferencias`                                                                              |
| **Codinome**                                    | **Chime**                                                                                                                  |
| **Absorção do PRD-146**                         | Registrar: o 146 da Onda 8 passa a ser "ativar canais reais na UI já existente" (decisão final com o Frederico)            |

### 2.2 Sistema visual (direção do `ui-ux-pro-max`)

- **Estilo:** flat/industrial, sem sombras pesadas, transições 150–200ms.
- **★ Cores de severidade — escala dedicada.** Tokens semânticos próprios `--severity-{info,success,warning,critical}`, **constantes nos 4 temas** (diesel/parts/service/industrial), **desacoplados de `--primary`**. Tratamento **tonal** (`bg-x/15` + ícone/texto na cor) — nunca preenchimento sólido, que competiria com a cor de marca. Validado visualmente no tema PARTS (verde): `success` e marca coexistem porque o tratamento difere (tonal vs sólido). **Ação:** adicionar os tokens em [`src/styles.css`](../../../src/styles.css), com paridade light/dark (WCAG AA).
- **Badge de não-lidas:** usa `--primary` (identidade do tema) — é atenção/contagem, não severidade.
- **Tipografia:** Saira Condensed (títulos/cabeçalhos), Inter (corpo/UI), JetBrains Mono (timestamps, valores, contadores).
- **Ícones:** Iconify `mdi` (mapa categoria→ícone do Anexo A do PRD-009).

### 2.3 Telas aprovadas (mockups em `.superpowers/brainstorm/2780-1780186128/content/`)

1. **Sino + dropdown — Direção B "Edge por Severidade":** barra de cor na borda esquerda do item, respiro, ações rápidas inline, não-lido com leve realce de fundo. `Popover` (foco gerenciado), header "Notificações" + "Marcar todas lidas", grupos por `groupKey`, footer "Ver todas". (`dropdown-direction.html`)
2. **Página `/app/notificacoes` — DOIS layouts com alternador:** (`page-com-alternador.html`)
   - **Painel** (trilha lateral): segmentos (Todas/Não-lidas/Arquivadas) + categorias com contagem + severidade à esquerda; lista à direita.
   - **Lista** (barra horizontal): filtros em dropdowns no topo com chips de filtro ativo removíveis; lista full-width.
   - `<NotificationLayoutSwitcher>` (segmented "Painel/Lista") no header; preferência salva em `localStorage` (`gallo-notif-layout`) — **preferência de UI, separada** da matriz canal×categoria do PRD-008.
   - Ambos compartilham `<NotificationItem>`/`<NotificationGroup>` e os **mesmos filtros** (categoria/status/severidade sincronizados na URL). Só muda o invólucro.
3. **Matriz de preferências — Abordagem A "Matriz Completa":** os 6 canais na grade; in-app/toast editáveis; 4 canais externos em colunas esmaecidas com **selo "Fase 2"**; in-app de Transacional e Sistema com **cadeado** (não-silenciável). Legenda decodificando os estados. Mobile: vira cards por categoria. (`preferences-matrix.html`)
4. **Portal do cliente** (`/loja/conta/notificacoes`): tom comercial, tema PARTS (verde), lista de pedido/pagamento/entrega/fatura/crédito + aside de preferências simplificado (Pedidos 🔒, Orçamentos toggle, Novidades opt-in, e-mail/WhatsApp "Fase 2"). (`portal-cliente.html`)

### 2.4 Componentes (`src/features/notifications/`)

`NotificationBell`, `NotificationDropdown`, `NotificationItem`, `NotificationGroup`, `NotificationLayoutSwitcher`, `NotificationFilters`, `NotificationPreferences`, páginas internas e do cliente. Reuso shadcn/ui (`Popover`, `DropdownMenu`, `Tabs`, `Dialog`) — **nenhum layout novo** (usar `AppLayout`/`LojaLayout`).

### 2.5 Acessibilidade (não-negociável)

`focus-visible:ring-2`; HTML semântico antes de ARIA; `aria-live="polite"` no badge e toasts; ícones decorativos com `aria-hidden`; skeletons em fetch >300ms; **virtualizar/paginar listas >50**; `prefers-reduced-motion`; contraste AA em light+dark.

### 2.6 Pontos de integração com o existente

- **Substituir** o sino placeholder em [`src/features/shell/components/TopBar.tsx`](../../../src/features/shell/components/TopBar.tsx) (hoje badge estático + `useEcommerceNotificationStore`).
- **Migrar** `<ActiveAlertsList>` (PRD-014) → view filtrada por `category=operational`; "Dispensar" passa a marcar lida/arquivar via PRD-008 (sem `localStorage` próprio).
- **Real-time:** reaproveitar o mecanismo simulado de [`useRealtimeConversations.ts`](../../../src/features/conversations/hooks/useRealtimeConversations.ts) (toggle + jitter 8–15s); não criar segundo loop.

### 2.7 Fases (PRD-009) — 5 fases

1. Sino + badge + dropdown (Direção B).
2. Página `/app/notificacoes` (item, grupo, filtros na URL) + alternador de layout + estados (skeleton/empty/erro).
3. Matriz de preferências (Abordagem A) como sub-rota de `/app/configuracoes`.
4. Migração do `<ActiveAlertsList>` + consolidação dos toasts.
5. Portal do cliente (notificações + preferências) sobre `LojaLayout`.

---

## Pendências para a implementação

- [ ] Adicionar tokens `--severity-{info,success,warning,critical}` em `src/styles.css` (3 camadas, paridade light/dark, AA).
- [ ] Confirmar com o Frederico o ajuste do PRD-146 (Onda 8) frente ao 009.
- [ ] Versionamento: 008 → MINOR `Herald`; 009 → MINOR `Chime` (atualizar CHANGELOG + índice + renomear PRDs para `_DONE`).

## Referências

- Mockups visuais: `.superpowers/brainstorm/2780-1780186128/content/*.html`
- Padrão Provider: `src/providers/data/` (PRD-005)
- Settings/limiares: `src/shared/types/platform.ts` (`IManagerDashboardSettings`)
- Alertas a absorver: `src/features/manager-dashboard/{hooks/useActiveAlerts.ts,components/ActiveAlertsList.tsx}`
