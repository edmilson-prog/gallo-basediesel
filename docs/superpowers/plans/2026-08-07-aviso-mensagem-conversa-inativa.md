# Aviso sonoro + toast para mensagens em conversa não ativa — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando chega mensagem numa conversa atribuída ao usuário logado e essa conversa não está na frente dele, tocar o som que já existe e mostrar um toast clicável que leva direto à conversa.

**Architecture:** O monitor global que já existe (`useInboxActivityMonitor`) continua sendo o único gatilho: ele ganha uma guarda ("essa conversa está ativa? então nem som nem aviso") e passa a publicar um evento em um emitter minúsculo. Um componente novo (`InboundToastHost`) consome esse evento, resolve o nome do contato e renderiza o toast. O monitor não conhece sonner, router nem provider de contatos; o host não conhece realtime.

**Tech Stack:** React 19 + TypeScript strict, TanStack Router (file-based), sonner (toast), Vitest, Tailwind v4 + shadcn/ui, Zustand. Gerenciador: **bun**.

**Spec:** `docs/superpowers/specs/2026-08-07-aviso-mensagem-conversa-inativa-design.md`

## Global Constraints

- **Worktree obrigatória.** Todo o trabalho acontece em `.claude/worktrees/feat-inbound-toast-alerts` (branch `worktree-feat-inbound-toast-alerts`). Nunca commitar no diretório principal.
- **Zona congelada do atendimento.** Não alterar query keys de mensagens/mídia, o pipeline de assinatura em lote, `useRealtimeMessages` nem `useRealtimeConversations`. **As dependências do `useEffect` principal de `useInboxActivityMonitor.ts` (`[conversationsProvider, messagesProvider, currentStoreId, sellerId]`) devem permanecer idênticas.**
- **Escopo de arquivos:** só `src/features/inbox-alerts/`. Sem migration, sem Edge Function, sem mudança em contrato de provider.
- **Idioma:** identificadores e comentários em inglês; texto visível ao usuário em português do Brasil com acentuação correta.
- **TypeScript strict**, sem `any`. Interfaces de domínio prefixadas com `I`.
- **Tokens semânticos apenas** em classes de estilo (`text-xs`, `opacity-70` são utilitários neutros e aceitáveis; nunca `--gallo-*` nem hex).
- **Testes:** Vitest, arquivos `*.test.ts` co-localizados ao lado do módulo.
- **Gate final:** `bun run test` e `bun run build` (o build **não** faz type-check; `bunx tsc --noEmit` tem baseline de erros pré-existentes — avaliar só o delta dos arquivos novos).
- **Commits:** Conventional Commits em inglês, um por task.

---

### Task 1: Engine — qual conversa está ativa

Função pura que responde "a conversa X está na frente do usuário agora?". Extrai também o id da rota, que a Task 6 usa para dispensar o toast quando o atendente abre a conversa.

**Files:**
- Create: `src/features/inbox-alerts/engine/activeConversation.ts`
- Test: `src/features/inbox-alerts/engine/activeConversation.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `activeConversationIdFromPath(pathname: string): string | null`
  - `isConversationActive(pathname: string, conversationId: string, visibility: DocumentVisibilityState): boolean`

- [ ] **Step 1: Write the failing test**

Criar `src/features/inbox-alerts/engine/activeConversation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { activeConversationIdFromPath, isConversationActive } from "./activeConversation";

describe("activeConversationIdFromPath", () => {
  it("extracts the id from the conversation route", () => {
    expect(activeConversationIdFromPath("/app/atendimento/abc-123")).toBe("abc-123");
  });

  it("tolerates a trailing slash", () => {
    expect(activeConversationIdFromPath("/app/atendimento/abc-123/")).toBe("abc-123");
  });

  it("tolerates a query string", () => {
    expect(activeConversationIdFromPath("/app/atendimento/abc-123?status=aberta")).toBe("abc-123");
  });

  it("returns null on the Inbox list without a selection", () => {
    expect(activeConversationIdFromPath("/app/atendimento")).toBeNull();
    expect(activeConversationIdFromPath("/app/atendimento/")).toBeNull();
  });

  it("returns null outside the conversation route", () => {
    expect(activeConversationIdFromPath("/app/clientes")).toBeNull();
    expect(activeConversationIdFromPath("/app/gestao/atendimento-analise/abc-123")).toBeNull();
  });

  it("returns null for a nested path under a conversation", () => {
    expect(activeConversationIdFromPath("/app/atendimento/abc-123/midias")).toBeNull();
  });
});

describe("isConversationActive", () => {
  it("is active when the route matches and the tab is visible", () => {
    expect(isConversationActive("/app/atendimento/abc-123", "abc-123", "visible")).toBe(true);
  });

  it("is not active when the tab is hidden", () => {
    expect(isConversationActive("/app/atendimento/abc-123", "abc-123", "hidden")).toBe(false);
  });

  it("is not active for a different conversation", () => {
    expect(isConversationActive("/app/atendimento/abc-123", "zzz-999", "visible")).toBe(false);
  });

  it("is not active on another screen", () => {
    expect(isConversationActive("/app/clientes", "abc-123", "visible")).toBe(false);
  });

  it("is not active for an empty conversation id", () => {
    expect(isConversationActive("/app/atendimento/", "", "visible")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/features/inbox-alerts/engine/activeConversation.test.ts`
Expected: FAIL — "Failed to resolve import ./activeConversation".

- [ ] **Step 3: Write minimal implementation**

Criar `src/features/inbox-alerts/engine/activeConversation.ts`:

```ts
/** Route that renders a single conversation — `src/routes/app.atendimento.$id.tsx`. */
const CONVERSATION_ROUTE_PREFIX = "/app/atendimento/";

/**
 * Conversation id currently open in the URL, or `null` when the user is
 * anywhere else (including the Inbox list with no selection).
 *
 * Tolerates a trailing slash and a query string so it works with any caller's
 * flavour of "pathname" — TanStack Router hands over a bare pathname, but a
 * future caller passing `location.href`'s tail should not silently miss.
 */
export function activeConversationIdFromPath(pathname: string): string | null {
  const path = pathname.split("?")[0].split("#")[0];
  if (!path.startsWith(CONVERSATION_ROUTE_PREFIX)) return null;
  const tail = path.slice(CONVERSATION_ROUTE_PREFIX.length).replace(/\/+$/, "");
  // A nested segment means the user is on a sub-route, not on the conversation.
  if (!tail || tail.includes("/")) return null;
  return tail;
}

/**
 * True when `conversationId` is the conversation the user is actually looking
 * at: open in the route AND with the tab in the foreground. A conversation open
 * behind a minimized window or a background tab is NOT active — the seller is
 * not seeing it, so the alert must still fire.
 */
export function isConversationActive(
  pathname: string,
  conversationId: string,
  visibility: DocumentVisibilityState,
): boolean {
  if (visibility !== "visible") return false;
  if (!conversationId) return false;
  return activeConversationIdFromPath(pathname) === conversationId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/features/inbox-alerts/engine/activeConversation.test.ts`
Expected: PASS — 11 testes.

- [ ] **Step 5: Commit**

```bash
git add src/features/inbox-alerts/engine/activeConversation.ts src/features/inbox-alerts/engine/activeConversation.test.ts
git commit -m "feat(inbox-alerts): add engine to resolve the active conversation from the route"
```

---

### Task 2: Engine — prévia da mensagem

Transforma `text` + `media_type` (crus, vindos do payload de Realtime) no texto que aparece no corpo do toast.

**Files:**
- Create: `src/features/inbox-alerts/engine/inboundPreview.ts`
- Test: `src/features/inbox-alerts/engine/inboundPreview.test.ts`

**Interfaces:**
- Consumes: `MessageMediaType` de `@/shared/types`.
- Produces:
  - `inboundPreview(text: string | null | undefined, mediaType?: MessageMediaType | null): string`
  - `PREVIEW_FALLBACK: string` (`"Nova mensagem"`)

- [ ] **Step 1: Write the failing test**

Criar `src/features/inbox-alerts/engine/inboundPreview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { inboundPreview, PREVIEW_FALLBACK } from "./inboundPreview";

describe("inboundPreview", () => {
  it("uses the plain text when present", () => {
    expect(inboundPreview("Bom dia, tem esse filtro?")).toBe("Bom dia, tem esse filtro?");
  });

  it("collapses line breaks into single spaces", () => {
    expect(inboundPreview("Bom dia\n\nPreciso de duas peças")).toBe("Bom dia Preciso de duas peças");
  });

  it("truncates a long text with an ellipsis", () => {
    const long = "a".repeat(200);
    const result = inboundPreview(long);
    expect(result).toHaveLength(91); // 90 chars + ellipsis
    expect(result.endsWith("…")).toBe(true);
  });

  it("does not truncate a text exactly at the limit", () => {
    const exact = "b".repeat(90);
    expect(inboundPreview(exact)).toBe(exact);
  });

  it("labels media that carries no caption", () => {
    expect(inboundPreview("", "image")).toBe("Foto");
    expect(inboundPreview(undefined, "audio")).toBe("Áudio");
    expect(inboundPreview(null, "video")).toBe("Vídeo");
    expect(inboundPreview("", "document")).toBe("Documento");
    expect(inboundPreview("", "sticker")).toBe("Figurinha");
  });

  it("prefers the caption over the media label", () => {
    expect(inboundPreview("Olha a peça quebrada", "image")).toBe("Olha a peça quebrada");
  });

  it("always labels structured content, never its encoded text", () => {
    // `location`/`contact` encode their payload INSIDE `text` (see
    // providers/whatsapp/contentFormat.ts) — showing it raw would leak
    // coordinates / vCard noise into the toast.
    expect(inboundPreview("-27.3586,-53.3958\nRua Ademar", "location")).toBe("Localização");
    expect(inboundPreview("João Silva\n5555999998888", "contact")).toBe("Contato");
  });

  it("falls back when there is neither text nor media", () => {
    expect(inboundPreview("", undefined)).toBe(PREVIEW_FALLBACK);
    expect(inboundPreview("   ", null)).toBe(PREVIEW_FALLBACK);
    expect(inboundPreview(undefined)).toBe(PREVIEW_FALLBACK);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/features/inbox-alerts/engine/inboundPreview.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

Criar `src/features/inbox-alerts/engine/inboundPreview.ts`:

```ts
import type { MessageMediaType } from "@/shared/types";

/** Shown when the message carries neither text nor a recognizable media type —
 *  notably the `last_message_at` fallback path, which has no message row. */
export const PREVIEW_FALLBACK = "Nova mensagem";

/** Max characters before truncation, chosen to fit two lines of the toast body. */
export const PREVIEW_MAX_LENGTH = 90;

const MEDIA_LABEL: Record<MessageMediaType, string> = {
  image: "Foto",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
  sticker: "Figurinha",
  location: "Localização",
  contact: "Contato",
};

/**
 * STRUCTURED content: `location` and `contact` have no binary payload — their
 * data lives ENCODED in `text` (see `@/providers/whatsapp/contentFormat`). The
 * label always wins for these, otherwise the toast would show raw coordinates
 * or vCard fragments.
 */
const STRUCTURED_MEDIA: readonly MessageMediaType[] = ["location", "contact"];

/**
 * One-line preview of an inbound message for the toast body. A caption always
 * beats the media label (it is what the customer actually wrote), except for
 * structured content.
 */
export function inboundPreview(
  text: string | null | undefined,
  mediaType?: MessageMediaType | null,
): string {
  if (mediaType && STRUCTURED_MEDIA.includes(mediaType)) return MEDIA_LABEL[mediaType];

  const collapsed = (text ?? "").replace(/\s+/g, " ").trim();
  if (collapsed) {
    return collapsed.length > PREVIEW_MAX_LENGTH
      ? `${collapsed.slice(0, PREVIEW_MAX_LENGTH)}…`
      : collapsed;
  }

  if (mediaType) return MEDIA_LABEL[mediaType] ?? PREVIEW_FALLBACK;
  return PREVIEW_FALLBACK;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/features/inbox-alerts/engine/inboundPreview.test.ts`
Expected: PASS — 8 testes.

- [ ] **Step 5: Commit**

```bash
git add src/features/inbox-alerts/engine/inboundPreview.ts src/features/inbox-alerts/engine/inboundPreview.test.ts
git commit -m "feat(inbox-alerts): add inbound message preview engine"
```

---

### Task 3: Engine — acumulador de mensagens por conversa

Guarda, por conversa, a prévia mais recente e quantas mensagens chegaram desde que o toast apareceu. É também o registro de "esse toast está vivo" — a Task 6 usa `peek()` para não ressuscitar um toast já fechado.

**Files:**
- Create: `src/features/inbox-alerts/engine/inboundToastAccumulator.ts`
- Test: `src/features/inbox-alerts/engine/inboundToastAccumulator.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `interface IInboundToastEntry { preview: string; count: number }`
  - `interface IInboundToastAccumulator { register(id: string, preview: string): IInboundToastEntry; peek(id: string): IInboundToastEntry | null; clear(id: string): void; clearAll(): void }`
  - `createInboundToastAccumulator(): IInboundToastAccumulator`

- [ ] **Step 1: Write the failing test**

Criar `src/features/inbox-alerts/engine/inboundToastAccumulator.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createInboundToastAccumulator } from "./inboundToastAccumulator";

describe("createInboundToastAccumulator", () => {
  it("starts a conversation at count 1", () => {
    const acc = createInboundToastAccumulator();
    expect(acc.register("conv-1", "Bom dia")).toEqual({ preview: "Bom dia", count: 1 });
  });

  it("counts up and keeps the most recent preview", () => {
    const acc = createInboundToastAccumulator();
    acc.register("conv-1", "Bom dia");
    acc.register("conv-1", "Tem esse filtro?");
    expect(acc.register("conv-1", "E o preço?")).toEqual({ preview: "E o preço?", count: 3 });
  });

  it("keeps conversations independent", () => {
    const acc = createInboundToastAccumulator();
    acc.register("conv-1", "Bom dia");
    acc.register("conv-1", "Tem esse filtro?");
    expect(acc.register("conv-2", "Boa tarde")).toEqual({ preview: "Boa tarde", count: 1 });
    expect(acc.peek("conv-1")?.count).toBe(2);
  });

  it("peeks without mutating", () => {
    const acc = createInboundToastAccumulator();
    acc.register("conv-1", "Bom dia");
    expect(acc.peek("conv-1")).toEqual({ preview: "Bom dia", count: 1 });
    expect(acc.peek("conv-1")).toEqual({ preview: "Bom dia", count: 1 });
  });

  it("peeks null for an unknown conversation", () => {
    expect(createInboundToastAccumulator().peek("nope")).toBeNull();
  });

  it("restarts the count after clear", () => {
    const acc = createInboundToastAccumulator();
    acc.register("conv-1", "Bom dia");
    acc.register("conv-1", "Tem esse filtro?");
    acc.clear("conv-1");
    expect(acc.peek("conv-1")).toBeNull();
    expect(acc.register("conv-1", "Voltei")).toEqual({ preview: "Voltei", count: 1 });
  });

  it("clears every conversation at once", () => {
    const acc = createInboundToastAccumulator();
    acc.register("conv-1", "Bom dia");
    acc.register("conv-2", "Boa tarde");
    acc.clearAll();
    expect(acc.peek("conv-1")).toBeNull();
    expect(acc.peek("conv-2")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/features/inbox-alerts/engine/inboundToastAccumulator.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

Criar `src/features/inbox-alerts/engine/inboundToastAccumulator.ts`:

```ts
/** What the toast body renders for one conversation. */
export interface IInboundToastEntry {
  /** Preview of the most recent message. */
  preview: string;
  /** Messages accumulated since this toast was raised (1 = first). */
  count: number;
}

export interface IInboundToastAccumulator {
  /** Record an inbound message and return the state the toast should render. */
  register(conversationId: string, preview: string): IInboundToastEntry;
  /** Current state without mutating — `null` when no toast is live. */
  peek(conversationId: string): IInboundToastEntry | null;
  /** Forget a conversation (toast dismissed, auto-closed, or opened). */
  clear(conversationId: string): void;
  clearAll(): void;
}

/**
 * Per-conversation accumulation for the inbound toast. Pure and timer-free: the
 * host owns the lifecycle and calls `clear` when its toast goes away, which is
 * why a present entry doubles as "this toast is still on screen".
 */
export function createInboundToastAccumulator(): IInboundToastAccumulator {
  const entries = new Map<string, IInboundToastEntry>();

  return {
    register(conversationId, preview) {
      const previous = entries.get(conversationId);
      const next: IInboundToastEntry = {
        preview,
        count: (previous?.count ?? 0) + 1,
      };
      entries.set(conversationId, next);
      return { ...next };
    },
    peek(conversationId) {
      const entry = entries.get(conversationId);
      return entry ? { ...entry } : null;
    },
    clear(conversationId) {
      entries.delete(conversationId);
    },
    clearAll() {
      entries.clear();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/features/inbox-alerts/engine/inboundToastAccumulator.test.ts`
Expected: PASS — 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/features/inbox-alerts/engine/inboundToastAccumulator.ts src/features/inbox-alerts/engine/inboundToastAccumulator.test.ts
git commit -m "feat(inbox-alerts): add per-conversation toast accumulator"
```

---

### Task 4: Emitter do evento de inbound

Canal mínimo entre o monitor (que sabe do realtime) e o host (que sabe de UI). Sem React, sem imports de UI — é o que permite o monitor continuar ignorando sonner e router.

**Files:**
- Create: `src/features/inbox-alerts/events/inboundOnMine.ts`
- Test: `src/features/inbox-alerts/events/inboundOnMine.test.ts`

**Interfaces:**
- Consumes: `MessageMediaType` de `@/shared/types`.
- Produces:
  - `interface IInboundOnMineEvent { conversationId: string; text?: string | null; mediaType?: MessageMediaType | null }`
  - `emitInboundOnMine(event: IInboundOnMineEvent): void`
  - `subscribeInboundOnMine(listener: (event: IInboundOnMineEvent) => void): () => void`

- [ ] **Step 1: Write the failing test**

Criar `src/features/inbox-alerts/events/inboundOnMine.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { emitInboundOnMine, subscribeInboundOnMine } from "./inboundOnMine";

describe("inboundOnMine emitter", () => {
  it("delivers the event to a subscriber", () => {
    const listener = vi.fn();
    const off = subscribeInboundOnMine(listener);
    emitInboundOnMine({ conversationId: "conv-1", text: "Bom dia", mediaType: null });
    expect(listener).toHaveBeenCalledWith({
      conversationId: "conv-1",
      text: "Bom dia",
      mediaType: null,
    });
    off();
  });

  it("stops delivering after unsubscribe", () => {
    const listener = vi.fn();
    const off = subscribeInboundOnMine(listener);
    off();
    emitInboundOnMine({ conversationId: "conv-1" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("delivers to every subscriber", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeInboundOnMine(a);
    const offB = subscribeInboundOnMine(b);
    emitInboundOnMine({ conversationId: "conv-1" });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });

  it("does not throw with no subscriber", () => {
    expect(() => emitInboundOnMine({ conversationId: "conv-1" })).not.toThrow();
  });

  it("keeps delivering when one listener throws", () => {
    const boom = vi.fn(() => {
      throw new Error("boom");
    });
    const healthy = vi.fn();
    const offBoom = subscribeInboundOnMine(boom);
    const offHealthy = subscribeInboundOnMine(healthy);
    expect(() => emitInboundOnMine({ conversationId: "conv-1" })).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);
    offBoom();
    offHealthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/features/inbox-alerts/events/inboundOnMine.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

Criar `src/features/inbox-alerts/events/inboundOnMine.ts`:

```ts
import type { MessageMediaType } from "@/shared/types";

/**
 * An inbound message landed on a conversation assigned to the signed-in seller
 * WHILE that conversation was not on screen. Raw message fields — formatting is
 * the consumer's job (see `engine/inboundPreview`).
 */
export interface IInboundOnMineEvent {
  conversationId: string;
  /** Absent on the `last_message_at` fallback path, which has no message row. */
  text?: string | null;
  mediaType?: MessageMediaType | null;
}

type InboundOnMineListener = (event: IInboundOnMineEvent) => void;

const listeners = new Set<InboundOnMineListener>();

/**
 * Publish the event. Deliberately UI-free so the Realtime monitor never has to
 * import sonner or the router.
 *
 * Iterates over a copy so a listener that unsubscribes during dispatch cannot
 * disturb the walk, and isolates listener failures: one broken consumer must
 * not swallow the alert for the others.
 */
export function emitInboundOnMine(event: IInboundOnMineEvent): void {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      /* a failing consumer must not break the others */
    }
  }
}

/** Subscribe; returns the unsubscribe function. */
export function subscribeInboundOnMine(listener: InboundOnMineListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/features/inbox-alerts/events/inboundOnMine.test.ts`
Expected: PASS — 5 testes.

- [ ] **Step 5: Commit**

```bash
git add src/features/inbox-alerts/events/inboundOnMine.ts src/features/inbox-alerts/events/inboundOnMine.test.ts
git commit -m "feat(inbox-alerts): add inbound-on-mine event emitter"
```

---

### Task 5: Ligar o monitor — guarda de conversa ativa + publicação do evento

Delta cirúrgico em `useInboxActivityMonitor.ts`. **Ler o arquivo inteiro antes de editar.** Três mudanças, nada mais.

**Files:**
- Modify: `src/features/inbox-alerts/hooks/useInboxActivityMonitor.ts`

**Interfaces:**
- Consumes: `isConversationActive` (Task 1), `emitInboundOnMine` (Task 4).
- Produces: nada de novo para fora — o hook continua com assinatura `(): void`.

- [ ] **Step 1: Adicionar os imports**

No topo do arquivo, junto dos imports existentes de engine:

```ts
import { useRouterState } from "@tanstack/react-router";
```

e, junto dos imports relativos:

```ts
import { isConversationActive } from "../engine/activeConversation";
import { emitInboundOnMine } from "../events/inboundOnMine";
```

Também estender a interface de linha de mensagem já declarada no arquivo (`IMessageRealtimeRow`), acrescentando os dois campos que o payload de Realtime já entrega:

```ts
/** Raw `public.messages` row — only the fields this monitor needs. */
interface IMessageRealtimeRow {
  conversation_id: string;
  direction: "in" | "out";
  sent_at: string;
  /** Body text — carried straight into the toast preview (no extra query). */
  text: string | null;
  media_type: MessageMediaType | null;
}
```

O arquivo hoje **não** importa nada de `@/shared/types` — acrescentar a linha de import de tipo:

```ts
import type { MessageMediaType } from "@/shared/types";
```

- [ ] **Step 2: Espelhar a rota num ref**

Logo abaixo de `const { play } = useSoundEventPlayer();`, antes dos `useRef` existentes:

```ts
  // Route mirrored into a ref ON PURPOSE: the main effect below owns the
  // Realtime subscriptions, and adding the pathname to its dependency array
  // would tear the channels down and re-join them on every navigation. Same
  // pattern as `useSoundEventPlayer`'s settings ref.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
```

**Não alterar o array de dependências do `useEffect` principal.** Ele deve continuar exatamente `[conversationsProvider, messagesProvider, currentStoreId, sellerId]`.

- [ ] **Step 3: Reescrever `maybeBeepMine`**

Substituir a função `maybeBeepMine` existente por:

```ts
    function maybeBeepMine(
      conversationId: string,
      candidateSentAt: string,
      message?: { text: string | null; mediaType: MessageMediaType | null },
    ) {
      const nowIso = new Date().toISOString();
      const lastAlerted = lastAlertedInbound.get(conversationId) ?? null;
      if (!isFreshInboundTimestamp(candidateSentAt, lastAlerted, nowIso, MAX_EVENT_AGE_MS)) return;
      lastAlertedInbound.set(conversationId, candidateSentAt);
      useInboxActivityStore.getState().setHasUnreadMine(true);

      // The seller is looking straight at this conversation — no sound, no
      // toast. A conversation open behind a hidden tab does NOT count as active
      // (see engine/activeConversation), so the alert still fires there.
      if (isConversationActive(pathnameRef.current, conversationId, document.visibilityState)) {
        return;
      }

      // Raised BEFORE the sound throttle on purpose: the toast is keyed by
      // conversation id and updates in place, so a burst must keep bumping its
      // counter even while the throttle is silencing the extra beeps.
      emitInboundOnMine({
        conversationId,
        text: message?.text ?? null,
        mediaType: message?.mediaType ?? null,
      });

      const nowMs = Date.now();
      if (shouldThrottle(lastMineBeepAtRef.current, nowMs, MIN_BEEP_INTERVAL_MS)) return;
      lastMineBeepAtRef.current = nowMs;
      play("inboxAssignedMine");
    }
```

- [ ] **Step 4: Passar o conteúdo da mensagem no caminho rápido**

No listener de `messages`, na última linha, trocar a chamada para carregar texto e mídia:

```ts
    const offMessages = subscribeToTable("messages", (payload) => {
      const row = payload.new as Partial<IMessageRealtimeRow> | null;
      if (!row?.conversation_id || row.direction !== "in" || !row.sent_at) return;
      const cached = cache.get(row.conversation_id);
      if (!sellerId || !cached || cached.assignedSellerId !== sellerId) return;
      maybeBeepMine(row.conversation_id, row.sent_at, {
        text: row.text ?? null,
        mediaType: row.media_type ?? null,
      });
    });
```

O caminho de fallback (`getLastInboundAt`, dentro do listener de `conversations`) permanece **inalterado** — chama `maybeBeepMine(conversationId, iso)` sem o terceiro argumento, e o toast cai na prévia genérica.

- [ ] **Step 5: Verificar que nada do realtime mudou**

Run: `git diff src/features/inbox-alerts/hooks/useInboxActivityMonitor.ts`

Conferir na saída:
- O array de dependências do `useEffect` principal **não** aparece como alterado.
- Nenhuma mudança em `subscribeToTable`, `revalidateQueue`, `revalidateMine`, nos debounces ou no cleanup.
- As únicas linhas novas são: imports, o par pathname/ref, a guarda + `emit` dentro de `maybeBeepMine`, os dois campos de `IMessageRealtimeRow` e o terceiro argumento no listener de `messages`.

- [ ] **Step 6: Rodar a suíte da feature**

Run: `bun run test -- src/features/inbox-alerts`
Expected: PASS — todos os testes de engine da feature seguem verdes.

- [ ] **Step 7: Commit**

```bash
git add src/features/inbox-alerts/hooks/useInboxActivityMonitor.ts
git commit -m "feat(inbox-alerts): suppress alerts on the active conversation and publish inbound events"
```

---

### Task 6: O host do toast

Consome o evento, resolve o nome do contato, renderiza o toast clicável e o dispensa quando o atendente abre a conversa.

**Files:**
- Create: `src/features/inbox-alerts/components/InboundToastHost.tsx`
- Modify: `src/features/inbox-alerts/components/InboxActivityGuard.tsx`
- Modify: `src/features/inbox-alerts/index.ts`

**Interfaces:**
- Consumes: `subscribeInboundOnMine` (Task 4 — o tipo `IInboundOnMineEvent` chega por inferência, **não** importar), `inboundPreview` (Task 2), `createInboundToastAccumulator` + `IInboundToastEntry` (Task 3), `activeConversationIdFromPath` (Task 1), `useConversationsProvider` de `@/providers/data`.
- Produces: `InboundToastHost(): null` — componente sem UI própria fora do toast.

- [ ] **Step 1: Criar o host**

Criar `src/features/inbox-alerts/components/InboundToastHost.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { useConversationsProvider } from "@/providers/data";
import { activeConversationIdFromPath } from "../engine/activeConversation";
import { inboundPreview } from "../engine/inboundPreview";
import {
  createInboundToastAccumulator,
  type IInboundToastEntry,
} from "../engine/inboundToastAccumulator";
import { subscribeInboundOnMine } from "../events/inboundOnMine";

/** Long enough to read the preview and click through without hunting. */
const TOAST_DURATION_MS = 8_000;
/** Title while the contact name has not resolved (or failed to). */
const UNKNOWN_CONTACT_TITLE = "Nova mensagem";

/**
 * Renders the clickable toast for inbound messages that land on the seller's
 * conversations while they are elsewhere. Mounted once, next to the Inbox
 * activity monitor — the monitor decides WHETHER to alert (freshness, dedupe,
 * active-conversation guard); this host decides HOW it looks.
 *
 * One toast per conversation: sonner keys by `id`, so a burst updates the same
 * toast in place and only bumps its counter instead of stacking.
 */
export function InboundToastHost() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const conversationsProvider = useConversationsProvider();

  const accumulatorRef = useRef(createInboundToastAccumulator());
  /** conversationId → resolved contact name. */
  const namesRef = useRef(new Map<string, string>());
  /** Conversations with a `listContacts` call in flight — never ask twice. */
  const pendingNamesRef = useRef(new Set<string>());

  useEffect(() => {
    const accumulator = accumulatorRef.current;
    const names = namesRef.current;
    const pendingNames = pendingNamesRef.current;

    function raise(conversationId: string, entry: IInboundToastEntry) {
      const name = names.get(conversationId);
      toast(name ? `💬 ${name}` : UNKNOWN_CONTACT_TITLE, {
        id: conversationId,
        description: (
          <span className="flex flex-col gap-0.5">
            <span>{entry.preview}</span>
            {entry.count > 1 && (
              <span className="text-xs opacity-70">{entry.count} novas mensagens</span>
            )}
          </span>
        ),
        duration: TOAST_DURATION_MS,
        action: {
          label: "Abrir",
          onClick: () => {
            accumulator.clear(conversationId);
            void navigate({ to: "/app/atendimento/$id", params: { id: conversationId } });
          },
        },
        // A cleared entry also means "no toast on screen" — see the re-raise
        // guard below, which is what keeps a late-arriving name from
        // resurrecting a toast the seller already dismissed.
        onDismiss: () => accumulator.clear(conversationId),
        onAutoClose: () => accumulator.clear(conversationId),
      });
    }

    return subscribeInboundOnMine((event) => {
      const { conversationId } = event;
      const entry = accumulator.register(
        conversationId,
        inboundPreview(event.text, event.mediaType),
      );
      // Show immediately — the name is a nicety, never a blocker.
      raise(conversationId, entry);

      if (names.has(conversationId) || pendingNames.has(conversationId)) return;
      pendingNames.add(conversationId);
      void conversationsProvider
        .listContacts([conversationId])
        .then((rows) => {
          pendingNames.delete(conversationId);
          const name = rows[0]?.name?.trim();
          if (!name) return;
          names.set(conversationId, name);
          // Only re-raise while the toast is still live, so a slow RPC cannot
          // pop a closed toast back onto the screen.
          const current = accumulator.peek(conversationId);
          if (current) raise(conversationId, current);
        })
        .catch(() => {
          pendingNames.delete(conversationId);
          /* best-effort — the toast already showed without the name */
        });
    });
  }, [conversationsProvider, navigate]);

  // Opening the conversation answers the alert: drop its toast and reset the
  // counter so a later message starts a fresh one.
  useEffect(() => {
    const openId = activeConversationIdFromPath(pathname);
    if (!openId) return;
    toast.dismiss(openId);
    accumulatorRef.current.clear(openId);
  }, [pathname]);

  return null;
}
```

- [ ] **Step 2: Montar o host junto do monitor**

Substituir o conteúdo de `src/features/inbox-alerts/components/InboxActivityGuard.tsx` por:

```tsx
import { useInboxActivityMonitor } from "../hooks/useInboxActivityMonitor";
import { InboundToastHost } from "./InboundToastHost";

/**
 * Mounts the global Inbox activity monitor for the whole session, plus the host
 * that renders its inbound toasts. No UI of its own.
 */
export function InboxActivityGuard() {
  useInboxActivityMonitor();
  return <InboundToastHost />;
}
```

Nenhuma mudança em `AppLayout.tsx` — `<InboxActivityGuard />` já está montado lá (linha 80).

- [ ] **Step 3: Exportar pelo barrel**

Em `src/features/inbox-alerts/index.ts`, acrescentar ao final:

```ts
export { InboundToastHost } from "./components/InboundToastHost";
```

- [ ] **Step 4: Rodar a suíte inteira**

Run: `bun run test`
Expected: PASS — sem novas falhas (a suíte tem baseline verde; qualquer falha nova é regressão desta branch).

- [ ] **Step 5: Verificar o build**

Run: `bun run build`
Expected: build conclui sem erro.

- [ ] **Step 6: Verificar tipos do código novo (por delta)**

Run: `bunx tsc --noEmit`

O projeto tem baseline de ~315 erros pré-existentes. Conferir que **nenhum** erro cita os arquivos criados/alterados nesta branch:
`activeConversation.ts`, `inboundPreview.ts`, `inboundToastAccumulator.ts`, `inboundOnMine.ts`, `InboundToastHost.tsx`, `InboxActivityGuard.tsx`, `useInboxActivityMonitor.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/features/inbox-alerts/components/InboundToastHost.tsx src/features/inbox-alerts/components/InboxActivityGuard.tsx src/features/inbox-alerts/index.ts
git commit -m "feat(inbox-alerts): render clickable toast for inbound messages off-screen"
```

---

## Verificação final

- [ ] `bun run test` verde
- [ ] `bun run build` verde
- [ ] `bunx tsc --noEmit` sem erro novo nos arquivos desta branch
- [ ] `git diff main...HEAD --stat` mostra apenas `src/features/inbox-alerts/**` e os dois documentos em `docs/superpowers/`
- [ ] Abrir PR (rascunho) descrevendo as duas mudanças de comportamento: som suprimido na conversa ativa, e toast independente do liga/desliga de som

## Smoke manual (dono, em produção)

Validação visual/sonora é do dono — não abrir navegador para testar.

1. Com a conversa A aberta, receber mensagem em A → **sem som e sem toast**.
2. Com a conversa A aberta, receber mensagem em B (também sua) → som + toast com o nome de B; clicar abre B.
3. Em outra tela (ex.: Clientes), receber mensagem → som + toast; clicar leva à conversa.
4. Cliente manda 3 mensagens seguidas → um único toast, com "3 novas mensagens".
5. Com a conversa A aberta e a aba em segundo plano, receber mensagem em A → som + toast (ele não estava vendo).
6. Desligar `inboxAssignedMine` na Central de Sons → toast continua aparecendo, sem som.
