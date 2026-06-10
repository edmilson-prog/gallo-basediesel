# PRD-117: Gerenciamento da Janela de 24h (WhatsApp Session)

> ✅ **CONCLUÍDO em 2026-06-10** (branch `feat/prd-117-session-window`). A Fase 1 já havia entregue `useMetaWindow` + `MetaWindowIndicator` (tick 30s, estados, input desabilitado); este PRD extraiu o engine puro (`engine/sessionWindow.ts`, 8 testes), adicionou a RPC `public.last_inbound_at` (SECURITY INVOKER, grant `authenticated`) consumida via `IMessagesProvider.getLastInboundAt` na fonte `supabase` (corrigindo o fallback impreciso por `lastMessageAt`) e o CTA "Selecionar template" no banner fechado → `TemplatePicker` (PRD-116). Desvios registrados em `docs/dev/whatsapp-session-window.md` (schema `public`, nomes da casa, thresholds Fase 1, audit de transições deferido conforme o próprio PRD). Fonte `mock` byte-idêntica à Fase 1.

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `src/features/conversations/` + helpers SQL_ |
| **Objetivo** | Tornar visível e gerenciável a **janela de 24h do WhatsApp Cloud API (Meta)** dentro do CRM: helper consolidado (`isWithin24hWindow`), UI com timer ("Janela aberta — fecha em 8h27min"), banner de fora-da-janela com CTA direto para template, audit de transições (entrou na janela / saiu da janela), exposição via Realtime para timer atualizar live |
| **Tipo** | Feature |
| **Complexidade** | Média |
| **Total de Fases** | 3 |
| **Prioridade** | P1 — UX crítica para vendedores não tropeçarem em fora-de-janela |
| **Épico** | Onda 5 — WhatsApp Real (v2.1.0 Bridge) |
| **PRDs Relacionados** | PRD-114 (atualiza `last_inbound_at` via webhook); PRD-115 (consome janela para pre-check); PRD-116 (template é o caminho fora-da-janela); PRD-111 (capabilities.supportsTemplates determina se aplica); PRD-011 Fase 1 (tela de Conversa — UX) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Helper TS em `src/features/conversations/session.ts` + função SQL `crm.is_within_24h_window` (já criada no PRD-115) |

### Critérios de Complexidade

> **Justificativa de Média:** lógica simples (math de timestamp) com UX crítica (vendedor sem visibilidade da janela perde mensagens). Real-time update do timer requer tick eficiente (não query a cada segundo). Distinção provider Meta vs Evolution (Evolution não tem janela). Decisões pequenas mas impactam dezenas de telas.

---

## Contexto do Problema

A Meta Cloud API impõe **janela de 24 horas**: após receber a última mensagem do cliente, a empresa pode enviar texto livre por 24h. Passado isso, **apenas templates HSM aprovados** (PRD-116). Esse fato regula 100% da operação outbound de vendedores.

Hoje o vendedor descobre o limite **quando tenta enviar e falha** — UX ruim:
- Tenta enviar texto → recebe erro `TEMPLATE_REQUIRED` → tem que abrir picker → escolher template → preencher variáveis
- Se ele soubesse com antecedência que está fora da janela, já abriria o picker direto

Este PRD entrega visibilidade ativa: vendedor sempre **vê o status** da janela na tela de Conversa, e a UX se adapta proativamente.

---

## Conceito da Solução

### Modelo Mental

Para cada conversa Meta, há um estado derivado:

```
last_inbound_at = max(messages.created_at WHERE direction='inbound')
hoursLeft = 24 - hoursSince(last_inbound_at)

if hoursLeft > 0  → "Janela aberta — fecha em Xh Ymin"
else              → "Fora da janela — use um template"
```

Evolution: ignora — sempre "janela aberta" conceitualmente (não há limite).

### Helper Consolidado

```typescript
// src/features/conversations/session.ts
export interface SessionWindow {
  applies: boolean              // só Meta — Evolution: false
  isOpen: boolean
  hoursLeft: number             // 0 se fechada
  minutesLeft: number
  lastInboundAt: string | null
  closesAt: string | null        // ISO timestamp em que a janela fecha
}

export function computeSessionWindow(input: {
  providerName: 'meta' | 'evolution'
  lastInboundAt: string | null
}): SessionWindow {
  if (input.providerName !== 'meta') {
    return { applies: false, isOpen: true, hoursLeft: 24, minutesLeft: 0, lastInboundAt: null, closesAt: null }
  }
  
  if (!input.lastInboundAt) {
    return { applies: true, isOpen: false, hoursLeft: 0, minutesLeft: 0, lastInboundAt: null, closesAt: null }
  }
  
  const closesAt = new Date(input.lastInboundAt).getTime() + 24 * 3600_000
  const now = Date.now()
  const msLeft = Math.max(0, closesAt - now)
  
  return {
    applies: true,
    isOpen: msLeft > 0,
    hoursLeft: Math.floor(msLeft / 3600_000),
    minutesLeft: Math.floor((msLeft % 3600_000) / 60_000),
    lastInboundAt: input.lastInboundAt,
    closesAt: new Date(closesAt).toISOString(),
  }
}
```

Pure function — fácil testar. Componentes derivam via `useMemo` a cada render.

### UI na Tela de Conversa

```
┌─────────────────────────────────────────────────┐
│ ◀ João Silva (5555-91234-5678)                  │
│                                                  │
│ ✅ Janela aberta — fecha em 8h 27min            │
│                                                  │
│ ... mensagens ...                                │
│                                                  │
│ ┌────────────────────────────────┐ [📎] [Enviar]│
│ │ Digite uma mensagem...          │              │
│ └────────────────────────────────┘              │
└─────────────────────────────────────────────────┘
```

Fora da janela:
```
┌─────────────────────────────────────────────────┐
│ ◀ João Silva (5555-91234-5678)                  │
│                                                  │
│ ⚠️ Fora da janela de 24h — última mensagem do   │
│    cliente há 30h. [Selecionar Template HSM]    │
│                                                  │
│ ... mensagens ...                                │
│                                                  │
│ ┌────────────────────────────────┐              │
│ │ (campo desabilitado)            │ [Template ▾]│
│ └────────────────────────────────┘              │
└─────────────────────────────────────────────────┘
```

Banner clicável abre o `TemplatePicker` direto (PRD-116). Campo de texto desabilitado para evitar tentativa frustrada.

### Tick do Timer

Atualizar timer toda hora seria ineficiente; toda minute é caro também. Solução:
- Estado inicial via `computeSessionWindow`
- Re-compute a cada **30 segundos** via `setInterval` enquanto a tela está ativa
- Em mudança visível (passou de "Xh Ymin" para "Y-1min"), re-render
- Quando timer atinge 0: re-compute imediato, transiciona para "Fora da janela"
- Realtime (PRD-105) propaga novas inbound → `last_inbound_at` muda → recomputa

Performance: 30s tick é trivial; só re-render se valor mudou (memoization).

### Audit de Transições

Bonus opcional (Onda 8/9 pode amplificar): registrar evento `window_opened` quando inbound chega após período fechado, e `window_closed` 24h após (via pg_cron job). MVP: não automatizar — apenas exibir.

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Function SQL retorna timestamp; frontend só consome | Bom para pre-check Edge Function (PRD-115); mas UI precisa tick local |
| Computar no backend e enviar via Realtime a cada segundo | Caro; tick local é trivial |
| Mostrar só "open/closed" sem timer | Pior UX — vendedor não sabe quanto tempo tem |
| Auto-templatizar quando vendedor está digitando perto do limite | Magic; melhor explicitar e deixar humano decidir |
| Computar janela no Realtime hook | Mistura responsabilidades; manter session puro |

---

## Escopo

### Incluído

- ✅ Helper puro `computeSessionWindow` em `src/features/conversations/session.ts`
- ✅ Hook `useSessionWindow(conversationId)` que combina:
  - Lê `last_inbound_at` da conversation (via provider PRD-104)
  - Determina provider via account
  - Tick de 30s
  - Reage a Realtime updates (PRD-105) — nova inbound reseta janela
- ✅ Componente `SessionBanner` exibindo status (verde aberta / amarelo last 2h / vermelho fechada)
- ✅ Integração na tela de Conversa (PRD-011):
  - Banner no topo
  - Campo de texto desabilitado se fechada
  - Botão "Selecionar Template" CTA direto
- ✅ Pre-fetch: ao carregar conversa, já calcula session — não há flash de UI inconsistente
- ✅ Função SQL `crm.last_inbound_at(conversation_id)` (sugar sobre `is_within_24h_window` — retorna timestamp em vez de boolean)
- ✅ Testes unitários do helper (boundary cases: exatamente 24h, sem inbound, Evolution)
- ✅ Documentação `docs/dev/whatsapp-session-window.md`

### Excluído

- ❌ Cobrança/billing-aware (Meta cobra por categoria de conversa — futuro PRD)
- ❌ Auto-templatização (vendedor decide template manualmente)
- ❌ Notification proativa "Sua janela fechará em 1h" (Onda 8 — engagement)
- ❌ Histórico de quantas janelas abriram/fecharam (Onda 9 — analytics)
- ❌ Bypass / override para Owner ("Janela fechada mas envio mesmo assim") — impossível tecnicamente (Meta bloqueia), e não-desejável

---

## Requisitos Funcionais

### Helper Puro

- **RF-001:** Função `computeSessionWindow(input)` em `src/features/conversations/session.ts` conforme conceito.
- **RF-002:** Pure function: dado o mesmo input, retorna o mesmo output. Sem side effects, sem I/O.
- **RF-003:** Output type `SessionWindow` exportado.
- **RF-004:** Para `providerName === 'evolution'`: retorna `{ applies: false, isOpen: true, ... }` (sempre aberta conceitualmente).

### Hook `useSessionWindow`

- **RF-010:** `useSessionWindow(conversationId)` retorna `SessionWindow` reativo:
  - Carrega `last_inbound_at` e provider via query
  - Calcula via `computeSessionWindow`
  - Re-calcula a cada 30s (setInterval com cleanup)
  - Re-calcula quando Realtime traz nova message inbound (subscribe ao PRD-105 `useMessagesRealtime`)
- **RF-011:** `useMemo` para evitar re-render se valor não mudou (precisão: minuto, não segundo).

### Componente `SessionBanner`

- **RF-020:** Componente em `src/features/conversations/components/SessionBanner.tsx`:
  - Verde 🟢 se `hoursLeft > 2`
  - Amarelo 🟡 se `hoursLeft <= 2` (atenção, fechando)
  - Vermelho 🔴 se `!isOpen`
  - Texto: "Janela aberta — fecha em Xh Ymin" / "Janela fechada — última mensagem há Xh" / "Provider Evolution — sem janela"
- **RF-021:** Em vermelho: botão "Selecionar template" CTA acionando `TemplatePicker` (PRD-116) inline.
- **RF-022:** Acessível: `aria-label` claro, contraste de cor adequado.

### Integração com Tela de Conversa

- **RF-030:** PRD-011 (Conversa) renderiza `<SessionBanner conversationId={...} />` no topo.
- **RF-031:** Campo de texto / botão "Enviar" desabilitados se `applies && !isOpen`.
- **RF-032:** Tooltip no campo desabilitado: "Fora da janela — use template".
- **RF-033:** `MediaUploader` (PRD-115 RF-080) também desabilitado se fora da janela.

### Function SQL

- **RF-040:** Função `crm.last_inbound_at(conversation_id uuid) RETURNS timestamptz LANGUAGE sql STABLE`:
  ```sql
  SELECT max(created_at) FROM crm.messages
  WHERE conversation_id = p_conversation_id AND direction = 'inbound';
  ```
- **RF-041:** GRANT EXECUTE para `authenticated`.
- **RF-042:** Pode ser usada por Edge Functions (PRD-115) ou frontend (provider expõe `getConversationLastInbound(id)`).

### Testes

- **RF-050:** Testes unitários `session.test.ts`:
  - Evolution: sempre `isOpen=true`, `applies=false`
  - Meta com `last_inbound_at` 1h atrás → `isOpen=true, hoursLeft=22`
  - Meta com 23h59m → `isOpen=true, hoursLeft=0, minutesLeft=1`
  - Meta com exatamente 24h → `isOpen=false`
  - Meta sem inbound → `isOpen=false`
- **RF-051:** Teste de integração: simular nova mensagem inbound → banner atualiza via Realtime.

### Documentação

- **RF-060:** `docs/dev/whatsapp-session-window.md`:
  - Explicação da janela 24h Meta (link doc Meta)
  - Como o helper funciona
  - UX padrões (verde/amarelo/vermelho)
  - Como Evolution se comporta
  - Bridge automático para templates

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Hook tick a cada 30s; re-render só em mudança visível. CPU negligenciável.
- **RNF-002 (UX):** Status sempre visível ao vendedor; sem flash de UI inconsistente ao carregar.
- **RNF-003 (Precisão):** Timer com precisão de minuto (vendedor não precisa segundo). Drift aceitável até 30s.
- **RNF-004 (Acessibilidade):** Cores acompanhadas de ícone/texto (não depende de cor sozinha).
- **RNF-005 (Reatividade):** Nova inbound atualiza janela em < 2s (latência Realtime).

---

## Critérios de Aceitação

### RF-001 + Boundaries

```gherkin
DADO providerName='meta', lastInboundAt = ISO 1 hora atrás
QUANDO computeSessionWindow(input)
ENTÃO retorna { applies: true, isOpen: true, hoursLeft: 22, minutesLeft: ~59, closesAt: ISO 23h depois }

DADO lastInboundAt = exatamente 24h atrás
QUANDO compute
ENTÃO isOpen=false, hoursLeft=0

DADO providerName='evolution'
QUANDO compute
ENTÃO applies=false, isOpen=true (Evolution sem janela)
```

### RF-020 + RF-030: Banner Reativo

```gherkin
DADO conversa Meta com janela aberta (5h restantes)
QUANDO vendedor abre a tela
ENTÃO SessionBanner mostra verde "Janela aberta — fecha em 5h Xmin"

QUANDO o tempo passa e fica < 2h restantes
ENTÃO banner muda para amarelo

QUANDO 24h passam sem nova inbound
ENTÃO banner fica vermelho
  E campo de texto fica desabilitado
  E botão "Selecionar template" aparece
```

### RF-031: Campo Desabilitado

```gherkin
DADO conversa fora da janela
QUANDO vendedor abre
ENTÃO campo de texto está disabled
  E tooltip explica "Fora da janela — use template"
  E vendedor não consegue digitar
```

### RF-011: Realtime Atualiza

```gherkin
DADO conversa fechada há 30h
  E vendedor com a tela aberta
QUANDO cliente envia nova mensagem (chega via webhook PRD-114)
  E Realtime propaga INSERT em messages
ENTÃO useSessionWindow detecta nova inbound
  E recomputa
  E banner muda imediatamente para verde "Janela aberta — 24h restantes"
  E campo de texto reabilita
```

---

## Fases de Implementação

### Fase 1 — Helper + Testes (meio dia)
- `session.ts` com `computeSessionWindow`
- Testes unitários boundary cases
- Function SQL `crm.last_inbound_at`

### Fase 2 — Hook + Componente (1 dia)
- `useSessionWindow` com tick + Realtime
- `SessionBanner` componente
- Storybook (opcional)

### Fase 3 — Integração + Docs (meio dia)
- Integração na tela de Conversa (PRD-011)
- Tooltip do campo desabilitado
- `docs/dev/whatsapp-session-window.md`
- E2E test: simular janela fechando
- `_DONE`

---

## Dependências

- **Depende de:** PRD-101 (messages, conversations), PRD-105 (Realtime), PRD-114 (webhook atualiza last_inbound_at indiretamente via INSERT messages), PRD-111 (capabilities.supportsTemplates check)
- **Bloqueia:** UX completa da Onda 5; nada técnico depende
- **Decisões Pendentes:** banner em outras telas além de Conversa? (sugerido: só Conversa MVP); threshold "fechando" 2h ok? (sugerido sim)

---

## Considerações de Segurança

- Pure function sem dados sensíveis
- Realtime já protegido por RLS (PRD-103) — vendedor só vê janela das próprias conversas
- Sem PII na UI além do que já existe

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.1.0-rc.7; CHANGELOG; renomear `PRD-117-whatsapp-session-24h_DONE.md`.

| Princípio | Descrição |
|-----------|-----------|
| **Pure function** | session.ts sem I/O — fácil testar |
| **Tick eficiente** | 30s; só re-render se mudou |
| **Evolution sem janela** | applies=false; UI esconde banner ou mostra info-only |
| **Realtime bridge** | Inbound nova → recomputa imediato |

| ❌ Evitar |
|-----------|
| Tick a cada segundo (overkill) |
| Lógica de janela no backend (UI precisa local) |
| Permitir vendedor "ignorar" (Meta bloqueia) |
| Mostrar timer com segundos (ruído) |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ✅ CONCLUÍDO |
| **Data** | 2026-06-10 |
| **Versão** | v0.80.0 (pós-merge) |
| **Por** | Claude Code CLI |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 27/05/2026 | v1 | Criação inicial — Sub-lote 2c do Lote 2 (Onda 5) |

---

**AILA - Sistemas Inteligentes**
