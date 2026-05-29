# PRD-105: Realtime (Subscriptions Supabase)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                                                                                                                                                                                                           |
| **Repositório**       | _Repositório vivo da Fase 1, diretórios `src/providers/supabase/` e `src/hooks/realtime/`_                                                                                                                                                                                                                                                                                                                                                         |
| **Objetivo**          | Implementar subscriptions Supabase Realtime para mudanças em tempo real nas tabelas de alta frequência: `messages` (nova mensagem em conversa), `leads` (mudança de stage, atribuição), `notifications` futuras, `audit_logs` (para painel gestor). Padrão `useSubscription<T>` hook React reutilizável. Channels filtrados por `storeId + sellerId` para reduzir tráfego. Cleanup automático, reconexão transparente, rate limiting de re-renders |
| **Tipo**              | Feature                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Complexidade**      | Alta                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Total de Fases**    | 4                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Prioridade**        | P1 — não-bloqueante para go-live (sistema funciona com polling), mas eleva UX significativamente                                                                                                                                                                                                                                                                                                                                                   |
| **Épico**             | Onda 4 — Backend Supabase Real (v2.0.0 Engine)                                                                                                                                                                                                                                                                                                                                                                                                     |
| **PRDs Relacionados** | PRD-104 (Provider Real — pré-requisito); PRD-101 (Schema — tabelas que recebem subscriptions); PRD-103 (RLS — filtra eventos Realtime conforme policies); PRD-115 (Envio WhatsApp — produz mensagens que disparam updates); PRD-014 Fase 1 (Painel Gestor — consome realtime); PRD-017 Fase 1 (Pipeline Leads — consome realtime)                                                                                                                  |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Padrão de código**  | Hooks React em `src/hooks/realtime/`; lógica de subscription em `src/providers/supabase/realtime/`                                                                                                                                                                                                                                                                                                                                                 |

### Critérios de Complexidade

> **Justificativa de Alta:** Realtime adiciona uma dimensão completamente nova ao app (state distribuído server → multiplos clients). Gerenciamento de lifecycle de subscriptions (mount/unmount), reconexão automática em network blip, deduplicação de eventos, performance (re-renders em massa não-controlados podem travar UI), interação com RLS (Realtime aplica policies — eventos filtrados antes de chegar ao cliente), throttle/debounce de UI updates. Erro aqui causa memory leak (subscriptions órfãs) ou storm de re-renders (5000 mensagens/min derrubam a tela).

---

## Contexto do Problema

A Fase 1 entregou telas que **carregam uma vez** (`useEffect` + provider) e dependem de refetch manual ou polling. Em produção real isso é insuficiente para 2 use cases:

1. **Caixa de Mensagens (Inbox PRD-010):** vendedor abre conversa com cliente; mensagem nova chega via webhook WhatsApp (PRD-114). Sem Realtime, a mensagem só aparece se o vendedor fizer refresh manual ou esperar polling (que consome egress e adiciona latência).

2. **Painel Gestor (PRD-014):** gestor monitora pipeline em tempo real. Vendedor da equipe move lead "Negociando" → "Ganho"; KPI de conversão deve refletir imediatamente.

Polling resolve, mas:

- **Latência:** polling a cada 5s = média 2.5s de delay
- **Custo:** N clientes × queries frequentes = quota egress consumida
- **UX inferior:** "esperar próxima rodada" sente lento mesmo em LAN

Supabase Realtime resolve tudo isso nativamente: WebSocket gerenciado pelo Supabase, RLS aplica automaticamente (eventos filtrados antes de sair do servidor), latência sub-segundo.

A complexidade não está no Supabase em si — está em **integrar Realtime ao padrão de hooks React** sem causar memory leaks, sem flooded re-renders, e mantendo a interface estável (provider continua sendo a fachada — Realtime é peer, não substitui).

---

## Conceito da Solução

### Arquitetura

```
src/
├── providers/supabase/
│   ├── realtime/
│   │   ├── RealtimeManager.ts      ← singleton: gerencia channels
│   │   ├── channels.ts             ← definições de channels (messages, leads, etc.)
│   │   └── filters.ts              ← filtros server-side via Realtime
│   └── ...
├── hooks/realtime/
│   ├── useSubscription.ts          ← hook genérico
│   ├── useMessagesRealtime.ts      ← específico para messages
│   ├── useLeadsRealtime.ts         ← específico para leads
│   └── ...
└── ...
```

### Hook Genérico `useSubscription<T>`

```typescript
// src/hooks/realtime/useSubscription.ts
import { useEffect, useState } from "react";
import { RealtimeManager } from "@/providers/supabase/realtime/RealtimeManager";
import { useDataProvider } from "@/providers/useDataProvider";

type SubscriptionOptions<T> = {
  table: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  filter?: string; // formato Supabase Realtime: 'column=eq.value'
  schema?: "crm" | "storefront";
  onInsert?: (row: T) => void;
  onUpdate?: (row: T, oldRow: T) => void;
  onDelete?: (oldRow: T) => void;
  enabled?: boolean;
};

export function useSubscription<T>({
  table,
  event = "*",
  filter,
  schema = "crm",
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
}: SubscriptionOptions<T>): { connected: boolean; error: Error | null } {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const channelKey = `${schema}.${table}:${filter ?? "*"}`;
    const channel = RealtimeManager.getOrCreateChannel(channelKey, schema, table, event, filter);

    const insertHandler = onInsert ? (payload: any) => onInsert(payload.new) : undefined;
    const updateHandler = onUpdate
      ? (payload: any) => onUpdate(payload.new, payload.old)
      : undefined;
    const deleteHandler = onDelete ? (payload: any) => onDelete(payload.old) : undefined;

    if (insertHandler)
      channel.on("postgres_changes", { event: "INSERT", table, schema, filter }, insertHandler);
    if (updateHandler)
      channel.on("postgres_changes", { event: "UPDATE", table, schema, filter }, updateHandler);
    if (deleteHandler)
      channel.on("postgres_changes", { event: "DELETE", table, schema, filter }, deleteHandler);

    channel.subscribe((status) => {
      setConnected(status === "SUBSCRIBED");
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setError(new Error(`Realtime: ${status}`));
      }
    });

    return () => {
      RealtimeManager.releaseChannel(channelKey);
    };
  }, [table, event, filter, schema, enabled]);

  return { connected, error };
}
```

### Hook específico — `useMessagesRealtime`

```typescript
// src/hooks/realtime/useMessagesRealtime.ts
import { useSubscription } from "./useSubscription";
import { useState, useCallback } from "react";
import type { IMessage } from "@/types/domain/message";
import { rowToMessage } from "@/providers/supabase/mappers/message";

export function useMessagesRealtime(conversationId: string) {
  const [newMessages, setNewMessages] = useState<IMessage[]>([]);

  const handleInsert = useCallback((row: any) => {
    setNewMessages((prev) => [...prev, rowToMessage(row)]);
  }, []);

  const { connected, error } = useSubscription({
    table: "messages",
    schema: "crm",
    event: "INSERT",
    filter: `conversation_id=eq.${conversationId}`,
    onInsert: handleInsert,
    enabled: !!conversationId,
  });

  return { newMessages, connected, error };
}
```

### `RealtimeManager` (singleton)

Centraliza gestão de channels para evitar criar 50 channels para a mesma tabela:

```typescript
// src/providers/supabase/realtime/RealtimeManager.ts
import { RealtimeChannel } from "@supabase/supabase-js";
import { crmClient, lojaClient } from "../clients";

class _RealtimeManager {
  private channels = new Map<string, { channel: RealtimeChannel; refCount: number }>();

  getOrCreateChannel(
    key: string,
    schema: string,
    table: string,
    event: string,
    filter?: string,
  ): RealtimeChannel {
    const existing = this.channels.get(key);
    if (existing) {
      existing.refCount++;
      return existing.channel;
    }
    const client = schema === "storefront" ? lojaClient : crmClient;
    const channel = client.channel(key);
    this.channels.set(key, { channel, refCount: 1 });
    return channel;
  }

  releaseChannel(key: string): void {
    const entry = this.channels.get(key);
    if (!entry) return;
    entry.refCount--;
    if (entry.refCount === 0) {
      entry.channel.unsubscribe();
      this.channels.delete(key);
    }
  }

  releaseAll(): void {
    for (const [, entry] of this.channels) entry.channel.unsubscribe();
    this.channels.clear();
  }
}

export const RealtimeManager = new _RealtimeManager();
```

### RLS aplicado a Realtime

Supabase Realtime **respeita RLS automaticamente** — eventos filtrados server-side antes de saírem para o WebSocket. Vendedor A não recebe evento de UPDATE em customer de vendedor B mesmo subscrevendo "\*".

**Implicação:** subscriptions podem ser "amplas" no cliente (ex: `table: 'customers'` sem filter); RLS limita o que chega. Mas filtros server-side via `filter: 'seller_id=eq.<id>'` reduzem tráfego de rede (Realtime filtra antes de processar).

### Reconexão Automática

Supabase JS lida com isso nativamente — em network blip, channels reconectam. Hook expõe `connected: boolean` para UI mostrar indicador discreto ("⚠️ Reconectando..."). Lógica de "missed events": após reconexão, o consumidor deve fazer **refetch** (via provider) para garantir consistência — Realtime não garante delivery durante desconexão.

### Throttle / Debounce

Cenário: 100 mensagens em 5 segundos → 100 re-renders. Solução: o hook acumula eventos por janela (ex: 100ms) e dispara batch. Implementação opcional para começar — adicionar quando profiling mostrar necessidade.

### Alternativas Consideradas

| Alternativa                                          | Por que descartada                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Polling com setInterval                              | Funciona mas latência alta + custo de egress                                           |
| Server-Sent Events (SSE) próprio                     | Reinventaria a roda. Supabase já tem Realtime gerenciado                               |
| Pusher / Ably (provider externo)                     | Custo adicional, integração extra, sem ganho real                                      |
| Realtime sem filtro server-side (`filter` no client) | Tráfego de rede 10× maior — vendedor recebe eventos da loja toda e descarta no cliente |
| Reescrever provider para incluir auto-realtime       | Acopla demais — provider para CRUD, hooks para subscriptions é mais clean              |
| React Query / SWR para Realtime                      | Adiciona dependência grande; hook customizado resolve com menos código                 |
| WebSocket próprio em Edge Function                   | Edge Functions não são WebSocket-friendly; Supabase Realtime é o caminho               |

---

## Escopo

### Incluído

- ✅ `RealtimeManager` singleton em `src/providers/supabase/realtime/RealtimeManager.ts`
- ✅ Hook genérico `useSubscription<T>` em `src/hooks/realtime/useSubscription.ts`
- ✅ Hooks específicos: `useMessagesRealtime(conversationId)`, `useLeadsRealtime({storeId, sellerId})`, `useConversationsRealtime(sellerId)` (lista de conversas com unread count atualizado)
- ✅ Integração na tela "Conversa" (PRD-011) — mensagens novas aparecem em tempo real
- ✅ Integração no "Painel Gestor" (PRD-014) — KPIs atualizam em real-time quando lead muda de stage
- ✅ Integração no "Pipeline de Leads" (PRD-017) — kanban atualiza quando outro user move card
- ✅ Indicador visual de status de conexão Realtime (canto inferior direito): 🟢 conectado / 🟡 reconectando / 🔴 falha
- ✅ Configuração no Supabase Dashboard: habilitar Realtime nas tabelas relevantes (`crm.messages`, `crm.leads`, `crm.conversations`, `crm.audit_logs` para Owner)
- ✅ Reconexão automática (nativo Supabase JS)
- ✅ Cleanup de subscriptions em unmount (via `releaseChannel` no useEffect cleanup)
- ✅ Documentação `docs/dev/realtime.md` com: arquitetura, como criar novo hook específico, como debugar, performance considerations
- ✅ Testes E2E (Playwright): abrir 2 abas do browser logadas como mesmo user, em uma adicionar mensagem, na outra ver aparecer
- ✅ Métricas: contagem de channels ativos exposta para debug

### Excluído

- ❌ Throttle/debounce sofisticado de re-renders — adicionar em PRD-108 se profiling indicar
- ❌ Optimistic updates (UI antecipa update antes do servidor confirmar) — fora de escopo
- ❌ Conflict resolution em mutations concorrentes — fora de escopo (servidor sempre vence)
- ❌ Presence (mostrar "vendedor X está digitando") — fora de escopo do MVP; pode entrar em Onda futura
- ❌ Broadcast channels (chat genérico entre users sem persistir) — fora de escopo
- ❌ Realtime no `storefront` (cliente B2C raramente precisa) — pode ser adicionado em PRD-149 (Carrinho Abandonado) ou similar
- ❌ Realtime para audit logs amplo (apenas Owner com permissão specific subscribe)
- ❌ Channels de Storage events — fora de escopo
- ❌ Subscriptions cross-store (multi-loja) — Onda 12 PRD-189 reavalia

---

## Requisitos Funcionais

### Configuração Supabase

- **RF-001:** Habilitar Realtime nas tabelas: `crm.messages`, `crm.leads`, `crm.conversations`, `crm.audit_logs`, `crm.notifications` (se existir no schema; senão entra com PRD-146). Habilitação via Supabase Dashboard (Database → Replication) ou via SQL: `ALTER PUBLICATION supabase_realtime ADD TABLE crm.<tabela>`.
- **RF-002:** Documentar quais tabelas têm Realtime em `docs/db/realtime-tables.md`. Decisão tomada por demanda (não habilitar tudo — quota Realtime é limitada).
- **RF-003:** Configurar limite de conexões Realtime no plano Pro: 500 concurrent peak. Cada usuário ativo no /app consome ~3 channels (messages, leads, audit). 100 users simultâneos consomem 300 conexões — dentro do limite.

### RealtimeManager

- **RF-010:** Implementar `RealtimeManager` como singleton em `src/providers/supabase/realtime/RealtimeManager.ts`.
- **RF-011:** Método `getOrCreateChannel(key, schema, table, event, filter): RealtimeChannel`:
  - Se channel com mesmo key já existe: incrementa refCount, retorna
  - Senão: cria novo channel via `client.channel(key)`, refCount=1
- **RF-012:** Método `releaseChannel(key): void`:
  - Decrementa refCount
  - Se chega a 0: chama `channel.unsubscribe()` e remove do mapa
- **RF-013:** Método `releaseAll(): void`: usado em logout — limpa todos os channels.
- **RF-014:** Reuso de channels: 10 abas/componentes subscrevendo `crm.messages` com mesmo filter compartilham UM channel (otimização de conexões).

### Hook Genérico `useSubscription<T>`

- **RF-020:** Implementar em `src/hooks/realtime/useSubscription.ts`.
- **RF-021:** Aceitar opções: `table`, `event` ('INSERT' | 'UPDATE' | 'DELETE' | '\*'), `filter` (formato Supabase: `column=eq.value`), `schema` ('crm' | 'storefront'), `onInsert/onUpdate/onDelete` (callbacks), `enabled` (boolean para condicional).
- **RF-022:** Retornar `{ connected: boolean, error: Error | null }` para UI exibir status.
- **RF-023:** Em mount: chamar `RealtimeManager.getOrCreateChannel` e atachar handlers.
- **RF-024:** Em unmount: chamar `RealtimeManager.releaseChannel` — limpeza garantida mesmo com erro no componente.
- **RF-025:** Re-mount quando `filter` ou `enabled` mudam: limpa old channel, atacha novo.

### Hooks Específicos

#### `useMessagesRealtime(conversationId)`

- **RF-030:** Subscreve INSERTS em `crm.messages` com filter `conversation_id=eq.<id>`.
- **RF-031:** Acumula mensagens novas em state local; consumidor (tela de conversa) faz merge com lista do provider.
- **RF-032:** Quando `conversationId` muda (vendedor abre outra conversa), automaticamente troca a subscription.

#### `useConversationsRealtime(sellerId)`

- **RF-033:** Subscreve UPDATEs em `crm.conversations` com filter `seller_id=eq.<id>` (ou sem filter — RLS já filtra).
- **RF-034:** Atualiza unread count, last_message_at no estado do consumidor.

#### `useLeadsRealtime(opts)`

- **RF-035:** Subscreve `crm.leads`, eventos `*` (INSERT, UPDATE, DELETE).
- **RF-036:** Opções: `sellerId` (vendedor: ver próprios), `storeId` (manager: ver todos da loja — confiar em RLS para filtrar).
- **RF-037:** Especialmente útil para Pipeline (PRD-017) — card move em tempo real quando outro vendedor age.

#### `useAuditLogRealtime(storeId)` — Owner/Manager only

- **RF-038:** Subscreve INSERT em `crm.audit_logs` (RLS filtra para Owner/Manager).
- **RF-039:** Mostra notification toast quando ação crítica (price_change, override_request) acontece.

### Indicador Visual de Conexão

- **RF-040:** Componente `RealtimeStatusBadge` no canto inferior direito do `/app`:
  - 🟢 "Conectado" (oculto após 3s se conectado)
  - 🟡 "Reconectando..." (visível enquanto não-conectado)
  - 🔴 "Sem conexão em tempo real" (após 30s sem conseguir reconectar)
- **RF-041:** Click no badge expande tooltip com detalhes (quantos channels ativos, último erro).
- **RF-042:** Configuração para esconder o badge via setting (`settings.show_realtime_status` em `crm.platform_settings` ou local storage).

### Integração nas Telas Fase 1

- **RF-050:** Tela "Conversa" (PRD-011): integrar `useMessagesRealtime(conversationId)`. Mensagens novas aparecem com animação suave de entrada (não jump cut).
- **RF-051:** Tela "Inbox de Conversas" (PRD-010): integrar `useConversationsRealtime(sellerId)`. Lista reordena quando nova mensagem chega.
- **RF-052:** Tela "Pipeline de Leads" (PRD-017): integrar `useLeadsRealtime`. Card pula de coluna automaticamente quando outro vendedor move.
- **RF-053:** Tela "Painel Gestor" (PRD-014): integrar `useLeadsRealtime(storeId)` + recompute de KPIs. KPI "Conversão do dia" atualiza em real-time.

### Reconexão e Resilience

- **RF-060:** Supabase JS lida com reconexão nativamente. Hook expõe `connected` para UI.
- **RF-061:** Após reconexão, consumidores devem chamar **refetch** via provider para recuperar eventos missed. Padrão sugerido: `useEffect(() => { if (connected) refetch() }, [connected])`.
- **RF-062:** Falha persistente (> 30s): hook expõe `error`; componente decide se mostra fallback (ex: "Atualize a página").

### Performance

- **RF-070:** Hook genérico não dispara re-render desnecessário — apenas quando handler é chamado.
- **RF-071:** Para listas grandes (mais de 100 itens), consumidor deve adotar virtualização (react-window ou similar) para suportar bursts sem travar.
- **RF-072:** Logger estruturado registra cada conexão/desconexão de channel (level `debug`) — útil para profiling.

### Testes

- **RF-080:** Testes unitários para `RealtimeManager`: refCount funciona, releaseAll limpa tudo.
- **RF-081:** Testes unitários para `useSubscription`: callbacks são chamados, cleanup acontece em unmount.
- **RF-082:** Teste E2E (Playwright):
  1. Abrir 2 abas do mesmo browser, ambas logadas como mesmo user
  2. Aba 1: navegar para conversa X
  3. Aba 2: enviar mensagem na conversa X (via provider direto, ou simular webhook)
  4. Aba 1: validar que mensagem aparece em < 2s sem refresh
- **RF-083:** Teste E2E adicional: simular disconnect (force offline browser tab) → reconnect → validar que `connected` volta a `true`.

### Documentação

- **RF-090:** `docs/dev/realtime.md` com:
  - Arquitetura geral
  - Como criar novo hook específico (template baseado em `useMessagesRealtime`)
  - Como configurar nova tabela para Realtime (Supabase Dashboard + SQL)
  - RLS e Realtime: como policies filtram eventos
  - Debug: como usar Supabase Dashboard Realtime tab
  - Performance: quando virtualizar lista, quando throttle, quando refetch
  - Limites do plano Pro (500 concurrent peak)

---

## Requisitos Não-Funcionais

- **RNF-001 (Latência):** Latência entre mutation no banco e evento no cliente: < 1 segundo p95 em rede normal. Aceitação: testes E2E medem.
- **RNF-002 (Quota — channels):** Total de channels ativos por usuário < 5. Reuso via `RealtimeManager` garante.
- **RNF-003 (Memory leak):** Zero subscriptions órfãs após navegação entre telas. Validação: abrir DevTools, inspecionar mapas internos do `RealtimeManager` após 100 navegações.
- **RNF-004 (Re-renders):** Eventos não disparam re-render desnecessário. Use `useCallback` e `useMemo` consistentemente.
- **RNF-005 (Logout cleanup):** Logout chama `RealtimeManager.releaseAll()`. Zero conexões pendentes após.
- **RNF-006 (Browser tab inactive):** Browsers throttle WebSocket em tabs inativas; isso é aceitável. Ao reativar tab, refetch para recuperar.
- **RNF-007 (Security):** Realtime respeita RLS (Supabase nativo). Sem configuração adicional necessária.

---

## Critérios de Aceitação

### RF-050 + RF-082: Mensagem em Tempo Real

```gherkin
DADO 2 abas do browser logadas como mesmo user em conversa X
QUANDO uma mensagem é inserida em crm.messages com conversation_id=X
ENTÃO a aba que está visualizando a conversa exibe a mensagem em < 2s
  E sem refresh manual
  E com animação suave de entrada
```

### RF-052 + RF-035: Pipeline em Tempo Real

```gherkin
DADO o pipeline aberto na tela mostrando 10 leads em "Negociando"
QUANDO um outro vendedor (mesma loja) move um lead para "Ganho"
  E o usuário atual tem permissão de visualizar (RLS aceita)
ENTÃO o card pula visualmente de "Negociando" para "Ganho"
  E o contador da coluna "Negociando" decrementa
  E o contador de "Ganho" incrementa
  E nenhum erro é exibido
```

### RF-024 + RNF-003: Cleanup de Subscriptions

```gherkin
DADO a tela de conversa X aberta com useMessagesRealtime ativo
  E o channel para conversa X registrado no RealtimeManager
QUANDO o usuário navega para outra tela
ENTÃO o useEffect cleanup chama releaseChannel
  E o refCount do channel cai para 0
  E o channel é unsubscribed
  E o tamanho do map de channels diminui em 1
```

### RF-040 + RF-061: Status Visual e Reconexão

```gherkin
DADO uma conexão Realtime ativa (badge oculto após 3s)
QUANDO o browser perde conexão (offline mode)
ENTÃO em até 5s o badge muda para 🟡 "Reconectando"
  E hooks expõem connected=false

QUANDO a conexão volta
ENTÃO o badge volta a 🟢 (oculto após 3s)
  E hooks expõem connected=true
  E consumidores que escutam connected disparam refetch
```

### RF-001 + Subscriptions Multi-Tabela

```gherkin
DADO crm.messages habilitada em supabase_realtime publication
  E crm.leads habilitada
  E crm.audit_logs habilitada
QUANDO um usuário abre /app/inbox (consome useMessagesRealtime + useConversationsRealtime)
  E navega para /app/pipeline (consome useLeadsRealtime)
ENTÃO ambas as telas funcionam concorrentemente
  E total de channels ativos é <= 3 (não cresce indefinidamente)
```

---

## Fases de Implementação

### Fase 1 — Infra: RealtimeManager + useSubscription (1 dia)

- Habilitar Realtime nas tabelas via Dashboard + migration SQL
- Criar `RealtimeManager` singleton
- Criar hook genérico `useSubscription<T>`
- Testes unitários básicos

### Fase 2 — Hooks específicos (1 dia)

- `useMessagesRealtime`
- `useConversationsRealtime`
- `useLeadsRealtime`
- `useAuditLogRealtime` (Owner only)
- Testes

### Fase 3 — Integração nas telas Fase 1 (1.5 dias)

- Tela Conversa: integrar `useMessagesRealtime`
- Tela Inbox: integrar `useConversationsRealtime`
- Pipeline: integrar `useLeadsRealtime`
- Painel Gestor: integrar realtime nos KPIs
- `RealtimeStatusBadge` no layout `/app`
- E2E test #1: mensagem em 2 abas

### Fase 4 — Resilience + Docs + Handoff (1 dia)

- Validar reconexão automática manualmente (browser offline mode)
- Logger estruturado de conexões
- E2E test #2: reconnect
- Documentação `docs/dev/realtime.md`
- Demo Edmilson + Frederico
- Marcar como `_DONE`

---

## Dependências

### PRDs

- **Bloqueia:** PRD-115 (Envio WhatsApp — produz eventos esperados), PRD-114 (Webhook WhatsApp — também produz)
- **Depende de:**
  - **PRD-101** (tabelas existindo)
  - **PRD-103** (RLS — Realtime aplica policies)
  - **PRD-104** (provider — pelo menos provider básico para refetch funcionar)
  - PRD-107 parcial (JWT precisa carregar claims para RLS filtrar — caso contrário usuário recebe 0 eventos)

### Bibliotecas

- `@supabase/supabase-js` (já no projeto)
- Nenhuma adicional

### Decisões Pendentes

- **Lista final de tabelas com Realtime:** decidir caso a caso. MVP propõe: messages, leads, conversations, audit_logs.
- **Throttle/debounce:** opt-in posterior; MVP sem throttle.

---

## Cadeia de PRDs

```
   ┌──────────────┐
   │ PRD-104      │
   │ Provider     │
   └──────┬───────┘
          │
   ┌──────▼───────┐
   │ PRD-105      │ ← ESTE
   │ Realtime     │
   └──────┬───────┘
          │
   ┌──────┼──────────┐
   ▼      ▼          ▼
 PRD-115 Onda 5+   Onda 8 (notifications)
```

---

## Considerações de Segurança

- **RLS aplicado:** Realtime respeita policies do PRD-103. Vendedor não recebe eventos sobre dados que não pode ler.
- **Channels não vazam segredos:** filtros server-side (`seller_id=eq.X`) são metadados, não dados sensíveis.
- **Reconexão preserva JWT:** Supabase JS re-envia JWT atual na reconnection — não há flap de identidade.
- **DoS via subscriptions:** atacante pode tentar criar muitos channels para esgotar quota. Supabase já impõe limite por user; quota MVP é confortável.
- **Logger não loga payloads:** apenas metadados de eventos (table, event type, timestamp). PII fica fora dos logs.

---

## Fluxos de Uso

### Fluxo principal — Vendedor recebe nova mensagem

```
[Cliente envia mensagem via WhatsApp]
   ──▶ Webhook WhatsApp (PRD-114) recebe
   ──▶ Edge Function insere row em crm.messages
   ──▶ Postgres dispara evento Realtime
   ──▶ Supabase filtra via RLS — apenas vendedor responsável
   ──▶ WebSocket envia para o cliente do vendedor
   ──▶ useMessagesRealtime recebe payload.new
   ──▶ rowToMessage(payload.new) → IMessage
   ──▶ setNewMessages adiciona à lista
   ──▶ Componente renderiza nova mensagem com animação
   ──▶ Vendedor vê em < 1s
```

### Fluxo de reconexão

```
[User com /app aberto]
   ──▶ Modem cai, network blip de 10s
   ──▶ Supabase JS detecta desconnect
   ──▶ RealtimeStatusBadge muda 🟢 → 🟡 "Reconectando"
   ──▶ Supabase JS tenta reconectar automaticamente (exponential backoff)
   ──▶ Após 8s, conexão volta
   ──▶ Channels re-subscribem automaticamente
   ──▶ Hooks expõem connected=true
   ──▶ Componentes chamam refetch (via useEffect dependendo de connected)
   ──▶ Estado sincroniza com banco
   ──▶ Badge volta 🟢 (oculta após 3s)
```

### Fluxo de unmount

```
[User navega de /app/inbox para /app/clientes]
   ──▶ Component Inbox unmount
   ──▶ useMessagesRealtime cleanup executa
   ──▶ RealtimeManager.releaseChannel('crm.messages:conversation_id=eq.X')
   ──▶ refCount do channel decrementa de 1 para 0
   ──▶ channel.unsubscribe() é chamado
   ──▶ Mapa interno remove a entry
   ──▶ Conexão WebSocket fechada
   ──▶ Sem subscriptions órfãs
```

---

## Convenções de Código (Referência Rápida)

| Elemento               | Convenção                                       | Exemplo                                |
| ---------------------- | ----------------------------------------------- | -------------------------------------- |
| **Diretório hooks**    | `src/hooks/realtime/`                           | `useMessagesRealtime.ts`               |
| **Diretório provider** | `src/providers/supabase/realtime/`              | `RealtimeManager.ts`                   |
| **Hook naming**        | `use<Entidade>Realtime`                         | `useLeadsRealtime`                     |
| **Channel key**        | `<schema>.<table>:<filter>`                     | `crm.messages:conversation_id=eq.X`    |
| **Filter format**      | Supabase Realtime nativo                        | `column=eq.value`, `column=in.(a,b,c)` |
| **Status enum**        | `'connected' \| 'connecting' \| 'disconnected'` | —                                      |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Claude Code CLI. PRD pelo Arquiteto na web.

### Esclarecimento de Dúvidas

> 💬 Confirme: lista de tabelas com Realtime habilitado para MVP (sugerido: messages, leads, conversations, audit_logs); animação de entrada de mensagens (CSS simples ou lib como framer-motion?).

### Instruções Obrigatórias

> ⚠️ **1. ANTES DE IMPLEMENTAR:** Estude o lifecycle de subscriptions Supabase JS (`channel`, `subscribe`, `unsubscribe`). Verifique que `RealtimeManager` realmente compartilha channels (otimização de conexões).

> ⚠️ **2. APÓS IMPLEMENTAR:**
>
> - Bump v2.0.0-rc.5
> - CHANGELOG: hooks criados, telas integradas
> - Renomear `PRD-105-realtime_DONE.md`
> - E2E tests passando
> - Demo com 2 abas

### Princípios de Implementação

| Princípio                  | Descrição                                                           |
| -------------------------- | ------------------------------------------------------------------- |
| **Cleanup obsessivo**      | Toda subscription tem retorno de cleanup. Memory leak = bug crítico |
| **Reuse de channels**      | RealtimeManager é central; nunca criar channel direto fora dele     |
| **RLS confiança**          | Cliente pode subscrever amplo; servidor filtra                      |
| **Refetch após reconnect** | Realtime não garante delivery em disconnect; refetch reconcilia     |
| **Logger estruturado**     | Connect/disconnect logados em debug; útil para diagnóstico          |
| **UX feedback**            | Badge sempre presente, sutil — usuário sabe se está em tempo real   |

### Orientações Específicas

| Aspecto             | Orientação                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| **Filter syntax**   | `column=eq.value`, `column=in.(a,b)`, `column=gt.10` — não é SQL, é DSL Supabase                          |
| **Multiple events** | Use `*` se precisa I/U/D; senão escolha o específico (mais barato)                                        |
| **Channel naming**  | Único por filtro — `crm.messages:conversation_id=eq.X` é diferente de `crm.messages:conversation_id=eq.Y` |
| **useCallback**     | Handlers passados a useSubscription DEVEM ser estáveis (useCallback) — senão re-subscreve em cada render  |
| **Status badge UX** | Não chame atenção quando tá tudo bem (oculto após 3s); destaque apenas em problema                        |
| **Logging**         | `console.debug` no dev; logger estruturado quando PRD-110 ativar                                          |

### O que NÃO Fazer

| ❌ Evitar                                                             |
| --------------------------------------------------------------------- |
| Criar channel direto via `supabase.channel()` fora do RealtimeManager |
| Esquecer cleanup no useEffect (memory leak garantido)                 |
| Subscriptions com `*` sem necessidade (mais tráfego)                  |
| Confiar em delivery garantida — Realtime é best-effort                |
| Re-render storm sem throttle em volumes altos                         |
| Realtime para dados raramente acessados (gasta quota)                 |
| Polling complementar redundante "por segurança"                       |
| Optimistic UI sem rollback (escopo PRD-105 não inclui)                |
| Logar payloads sensíveis no console                                   |
| Subscriptions em `storefront` sem necessidade clara                   |

---

## Status de Implementação

| Campo                     | Valor       |
| ------------------------- | ----------- |
| **Status**                | ⏳ PENDENTE |
| **Data de Implementação** | -           |
| **Versão do App**         | -           |
| **Implementado por**      | -           |
| **Observações**           | -           |

---

## Histórico

| Data       | Versão | Alteração                                        |
| ---------- | ------ | ------------------------------------------------ |
| 27/05/2026 | v1     | Criação inicial — Sub-lote 1b do Lote 1 (Onda 4) |

---

**AILA - Sistemas Inteligentes**
