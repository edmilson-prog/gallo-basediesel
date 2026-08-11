# Resumo do contato no hover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao pousar o mouse sobre uma linha da lista de conversas do Inbox, abrir um cartão somente-leitura que mostra, sem truncamento, o que a linha precisou cortar — nome, telefone, último recado inteiro, todas as tags, instância e situação por extenso.

**Architecture:** Um componente de apresentação pura (`ConversationSummaryCard`) alimentado só por props que `ConversationListItem` já tinha em mãos para desenhar a própria linha. Zero provider, zero hook de dados, zero requisição nova. As regras de "quando não abrir" e a montagem do rodapé saem do JSX e viram engines puras com Vitest.

**Tech Stack:** React 19 + TypeScript strict, Radix `HoverCard` (já presente em `src/components/ui/hover-card.tsx`), Tailwind v4 com tokens semânticos, Iconify via `@/components/Icon`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-11-conversation-hover-summary-design.md`

## Global Constraints

- **Tokens semânticos apenas** (`bg-popover`, `text-muted-foreground`, `border-border`, `text-severity-*`). Nunca primitivos `--gallo-*` nem hex direto. Única exceção: a cor da instância, que vem de `accountAccent()` e é aplicada via `style` — exatamente como `ConversationListItem.tsx:225` já faz hoje.
- **Código em inglês; texto de interface em português do Brasil com acentuação correta.** Strings de UI vivem em `src/features/conversations/i18n/pt-BR.ts`, nunca inline no JSX.
- **Interfaces de domínio prefixadas com `I`.** `strict: true`, sem `any`.
- **Ícones via `@/components/Icon`** (Iconify). Nunca emoji como ícone.
- **Código novo em `src/features/<feature>/`**; lógica de negócio em `engine/` com teste co-localizado `*.test.ts`.
- **Gate de verificação:** `bun run build` + `bun run test`. `bun run build` **não** faz type-check — para tipos, `bunx tsc --noEmit`, avaliando apenas os arquivos criados nesta branch (há ~315 erros de baseline pré-existentes).
- **Nunca editar `src/routeTree.gen.ts`** — é gerado.
- **Não abrir navegador para validar.** A validação visual é feita pelo dono do projeto.

---

### Task 1: O portão de visibilidade

Concentra as três regras de "quando o cartão não abre" numa função pura, mais o hook que detecta se o dispositivo tem hover de verdade. A função recebe a capacidade de hover como booleano em vez de ler `matchMedia` por dentro — é isso que a mantém testável sem simular ambiente de navegador.

**Files:**
- Create: `src/features/conversations/engine/summaryCardVisibility.ts`
- Test: `src/features/conversations/engine/summaryCardVisibility.test.ts`
- Create: `src/shared/hooks/useHoverCapable.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces:
  - `canShowSummaryCard(input: ISummaryCardVisibilityInput): boolean`
  - `interface ISummaryCardVisibilityInput { isSelected: boolean; hoverCapable: boolean; isMessageSearchResult: boolean }`
  - `useHoverCapable(): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/features/conversations/engine/summaryCardVisibility.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canShowSummaryCard } from "./summaryCardVisibility";

const OPEN = { isSelected: false, hoverCapable: true, isMessageSearchResult: false };

describe("canShowSummaryCard", () => {
  it("opens on a plain, unselected row of a hover-capable device", () => {
    expect(canShowSummaryCard(OPEN)).toBe(true);
  });

  it("never opens without a real hovering pointer", () => {
    expect(canShowSummaryCard({ ...OPEN, hoverCapable: false })).toBe(false);
  });

  it("never opens on the row already open in the viewer", () => {
    expect(canShowSummaryCard({ ...OPEN, isSelected: true })).toBe(false);
  });

  it("never opens while the row renders a message-search match", () => {
    // The row shows the MATCHED snippet there; a card showing the LAST message
    // would contradict what sits right next to it.
    expect(canShowSummaryCard({ ...OPEN, isMessageSearchResult: true })).toBe(false);
  });

  it("stays closed when several gates are shut at once", () => {
    expect(
      canShowSummaryCard({ isSelected: true, hoverCapable: false, isMessageSearchResult: true }),
    ).toBe(false);
  });

  it("needs every gate open — any single closed gate is enough to block", () => {
    const gates: (keyof typeof OPEN)[] = ["isSelected", "isMessageSearchResult"];
    for (const gate of gates) {
      expect(canShowSummaryCard({ ...OPEN, [gate]: true })).toBe(false);
    }
    expect(canShowSummaryCard({ ...OPEN, hoverCapable: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- summaryCardVisibility`
Expected: FAIL — `Failed to resolve import "./summaryCardVisibility"`.

- [ ] **Step 3: Write the engine**

Create `src/features/conversations/engine/summaryCardVisibility.ts`:

```ts
/** Everything that decides whether an inbox row may open its summary card. */
export interface ISummaryCardVisibilityInput {
  /** This row is the conversation currently open in the viewer. */
  isSelected: boolean;
  /** The device has a real hovering, fine pointer — see `useHoverCapable`. */
  hoverCapable: boolean;
  /** The row is rendering a search match instead of the last message. */
  isMessageSearchResult: boolean;
}

/**
 * Whether the contact summary card may open for a row.
 *
 * Three gates, all of which must be open:
 *
 *  - **hover capability** — a card that only appears on hover is invisible on a
 *    touch device, and worse, a tap would fire the row's navigation anyway.
 *  - **not selected** — the attendant is already inside that conversation, so a
 *    summary of it is noise layered over the screen they are reading.
 *  - **not a message-search match** — in that mode the row shows the snippet
 *    that matched the search; a card showing the LAST message instead would
 *    contradict what sits right beside it.
 *
 * `prefers-reduced-motion` is deliberately NOT a gate: asking for less motion
 * means less animation, not less information. The card still opens, without the
 * transition.
 */
export function canShowSummaryCard(input: ISummaryCardVisibilityInput): boolean {
  if (!input.hoverCapable) return false;
  if (input.isSelected) return false;
  if (input.isMessageSearchResult) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- summaryCardVisibility`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the hover-capability hook**

Create `src/shared/hooks/useHoverCapable.ts`:

```ts
import { useEffect, useState } from "react";

/**
 * The honest test for "this device has a hovering pointer". A width threshold
 * would be a proxy that errs both ways: a touchscreen laptop is wide and has no
 * reliable hover, a tablet driven by a trackpad is narrow and does.
 */
const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

function readHoverCapability(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(HOVER_QUERY).matches;
}

/**
 * True when the device has a real hovering, fine pointer (mouse or trackpad).
 *
 * Reactive: plugging a mouse into a tablet, or docking a 2-in-1, flips the match
 * without a reload. Defaults to `false` when `matchMedia` is unavailable —
 * failing closed means a hover-only affordance never becomes the ONLY way to
 * reach something.
 */
export function useHoverCapable(): boolean {
  const [capable, setCapable] = useState<boolean>(readHoverCapability);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(HOVER_QUERY);
    const sync = () => setCapable(mql.matches);
    mql.addEventListener("change", sync);
    sync();
    return () => mql.removeEventListener("change", sync);
  }, []);

  return capable;
}
```

- [ ] **Step 6: Run the full suite**

Run: `bun run test`
Expected: PASS — nenhuma regressão.

- [ ] **Step 7: Commit**

```bash
git add src/features/conversations/engine/summaryCardVisibility.ts src/features/conversations/engine/summaryCardVisibility.test.ts src/shared/hooks/useHoverCapable.ts
git commit -m "feat(conversations): gate the inbox summary card behind three tested rules

A hover-only affordance is invisible on touch, redundant on the row already
open, and contradictory while the row renders a search match. Concentrate
the three rules in a pure function rather than letting them rot as && in
the JSX, and detect hover with the pointer media query instead of a width
proxy that errs both ways."
```

---

### Task 2: O rodapé sem separador solto

O rodapé lista situação, atendente e instância separados por `·`. Numa loja de instância única não há instância; numa conversa na fila não há atendente. Montar isso no JSX produz, mais cedo ou mais tarde, um `·` pendurado na ponta. A engine devolve as partes presentes e o componente insere os separadores entre elas.

**Files:**
- Create: `src/features/conversations/engine/summaryFooter.ts`
- Test: `src/features/conversations/engine/summaryFooter.test.ts`

**Interfaces:**
- Consumes: nada da Task 1.
- Produces:
  - `buildSummaryFooter(input: ISummaryFooterInput): ISummaryFooterPart[]`
  - `interface ISummaryFooterInput { statusLabel: string; sellerName?: string | null; instanceLabel?: string | null }`
  - `interface ISummaryFooterPart { kind: "status" | "seller" | "instance"; text: string }`

- [ ] **Step 1: Write the failing test**

Create `src/features/conversations/engine/summaryFooter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSummaryFooter } from "./summaryFooter";

describe("buildSummaryFooter", () => {
  it("lists status, seller and instance in that order", () => {
    expect(
      buildSummaryFooter({
        statusLabel: "Em atendimento",
        sellerName: "Edmilson Souza",
        instanceLabel: "GALLO Matriz (Oficial)",
      }),
    ).toEqual([
      { kind: "status", text: "Em atendimento" },
      { kind: "seller", text: "Edmilson Souza" },
      { kind: "instance", text: "GALLO Matriz (Oficial)" },
    ]);
  });

  it("drops the instance on a single-instance store", () => {
    expect(
      buildSummaryFooter({ statusLabel: "Resolvida", sellerName: "Lucas Bender" }),
    ).toEqual([
      { kind: "status", text: "Resolvida" },
      { kind: "seller", text: "Lucas Bender" },
    ]);
  });

  it("drops the seller on an unassigned (queued) conversation", () => {
    expect(
      buildSummaryFooter({ statusLabel: "Aguardando", instanceLabel: "Comercial Lucas" }),
    ).toEqual([
      { kind: "status", text: "Aguardando" },
      { kind: "instance", text: "Comercial Lucas" },
    ]);
  });

  it("always keeps the status — it is the one field that is never absent", () => {
    expect(buildSummaryFooter({ statusLabel: "Arquivada" })).toEqual([
      { kind: "status", text: "Arquivada" },
    ]);
  });

  it("treats blank and whitespace-only names as absent, not as an empty segment", () => {
    // Otherwise the renderer emits "Aguardando ·  · Comercial Lucas".
    expect(
      buildSummaryFooter({
        statusLabel: "Aguardando",
        sellerName: "   ",
        instanceLabel: "",
      }),
    ).toEqual([{ kind: "status", text: "Aguardando" }]);
  });

  it("trims surrounding whitespace off the values it keeps", () => {
    expect(
      buildSummaryFooter({ statusLabel: "Resolvida", sellerName: "  Ana Paula  " }),
    ).toEqual([
      { kind: "status", text: "Resolvida" },
      { kind: "seller", text: "Ana Paula" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- summaryFooter`
Expected: FAIL — `Failed to resolve import "./summaryFooter"`.

- [ ] **Step 3: Write the engine**

Create `src/features/conversations/engine/summaryFooter.ts`:

```ts
/** Raw values for the summary card's one-line footer. */
export interface ISummaryFooterInput {
  /** Already localized — `CONVERSATION_STRINGS.statusLabel[status]`. */
  statusLabel: string;
  /** Assigned seller's full name; absent on a queued/unassigned conversation. */
  sellerName?: string | null;
  /** Origin instance label; absent on a single-instance store. */
  instanceLabel?: string | null;
}

/** One rendered segment of the footer. `kind` drives the leading dot's color. */
export interface ISummaryFooterPart {
  kind: "status" | "seller" | "instance";
  text: string;
}

/** Present, non-blank, trimmed — or nothing at all. */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The footer segments that actually have a value, in reading order.
 *
 * Returning parts instead of a joined string is what keeps a dangling `·` off
 * the end: the renderer puts separators BETWEEN parts, so an absent seller or a
 * single-instance store simply yields a shorter list. A blank string is treated
 * as absent — an empty segment would render as `Aguardando ·  · Comercial`.
 */
export function buildSummaryFooter(input: ISummaryFooterInput): ISummaryFooterPart[] {
  const parts: ISummaryFooterPart[] = [{ kind: "status", text: input.statusLabel }];

  const seller = clean(input.sellerName);
  if (seller) parts.push({ kind: "seller", text: seller });

  const instance = clean(input.instanceLabel);
  if (instance) parts.push({ kind: "instance", text: instance });

  return parts;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- summaryFooter`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/engine/summaryFooter.ts src/features/conversations/engine/summaryFooter.test.ts
git commit -m "feat(conversations): build the summary footer as parts, not a joined string

Status, seller and instance are separated by a middle dot, but a
single-instance store has no instance and a queued conversation has no
seller. Joining in the JSX leaves a dot dangling off the end sooner or
later; returning the present parts lets the renderer put separators
between them instead."
```

---

### Task 3: O cartão

Apresentação pura. Recebe tudo por prop, já resolvido pelo item da lista — é isso que garante que nenhuma requisição nova é feita.

**Files:**
- Create: `src/features/conversations/components/ConversationSummaryCard.tsx`
- Modify: `src/features/conversations/i18n/pt-BR.ts` (acrescentar bloco `summaryCard` dentro de `INBOX_STRINGS`)

**Interfaces:**
- Consumes: `buildSummaryFooter`, `ISummaryFooterPart` (Task 2).
- Produces: `ConversationSummaryCard(props: IConversationSummaryCardProps)`, com
  ```ts
  interface IConversationSummaryCardProps {
    conversation: IConversation;
    display: IConversationDisplay;
    lastMessage: IMessage | null;
    originAccount?: IWhatsAppAccount | null;
    assignedSeller?: ISeller | null;
    tags: IConversationTag[];
    now: Date;
  }
  ```

- [ ] **Step 1: Add the UI strings**

Em `src/features/conversations/i18n/pt-BR.ts`, dentro do objeto `INBOX_STRINGS`, logo **depois** da chave `collaboratingBadge` (por volta da linha 122), inserir:

```ts
  /** Contact summary card shown on row hover (2026-08-11 spec). */
  summaryCard: {
    qualifierCustomer: "Cliente",
    qualifierLead: "Lead",
    lastMessageLabel: "Último recado",
    /** The last-message RPC is RLS-gated, so `lastMessage` arrives null here. */
    previewUnavailable: "Prévia indisponível — a conversa é de outro atendente.",
  },
```

- [ ] **Step 2: Write the component**

Create `src/features/conversations/components/ConversationSummaryCard.tsx`:

```tsx
import type {
  IConversation,
  IConversationTag,
  IMessage,
  ISeller,
  IWhatsAppAccount,
} from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "./ContactAvatar";
import { ConversationTagChip } from "./tags/ConversationTagChip";
import type { IConversationDisplay } from "../utils/conversationDisplay";
import {
  CHANNEL_META,
  STATUS_META,
  TEMPERATURE_META,
  getMessagePreview,
} from "../utils/conversationDisplay";
import { formatRelativeTime } from "../utils/formatRelativeTime";
import { accountAccent } from "../utils/instanceAccent";
import { buildSummaryFooter } from "../engine/summaryFooter";
import { INBOX_STRINGS, CONVERSATION_STRINGS } from "../i18n/pt-BR";

const COPY = INBOX_STRINGS.summaryCard;

export interface IConversationSummaryCardProps {
  conversation: IConversation;
  /** Already resolved by the row via `displayFromContact` — never recompute. */
  display: IConversationDisplay;
  lastMessage: IMessage | null;
  originAccount?: IWhatsAppAccount | null;
  assignedSeller?: ISeller | null;
  /** Already resolved against the catalog by the row. ALL of them, not just the visible two. */
  tags: IConversationTag[];
  /** Shared minute tick from the row, so both stay in step. */
  now: Date;
}

/**
 * Read-only contact summary shown when the pointer rests on an inbox row.
 *
 * Its entire job is to un-truncate: the row uppercases and clips the name, gives
 * the preview one line, shows two of the tags, and never shows the phone at all.
 * Everything here arrives as a prop the row already had in hand to draw itself —
 * no provider, no query, no request. That is what makes hovering free.
 */
export function ConversationSummaryCard({
  conversation,
  display,
  lastMessage,
  originAccount,
  assignedSeller,
  tags,
  now,
}: IConversationSummaryCardProps) {
  const accent = originAccount ? accountAccent(originAccount) : null;
  const status = STATUS_META[conversation.status];
  const temperature = display.temperature ? TEMPERATURE_META[display.temperature] : null;
  const channelLabel = CHANNEL_META[conversation.channel].label;

  // "Cliente" / "Lead · Frio". The list-level contact carries no B2B/B2C split —
  // that would need a request, which this card is explicitly free of.
  const qualifier = display.isLead ? COPY.qualifierLead : COPY.qualifierCustomer;

  // When the name IS the phone number, don't print it twice: the identity line
  // falls back to the channel it came in through.
  const secondaryLine = display.isPhoneName ? channelLabel : display.phone;

  const footer = buildSummaryFooter({
    statusLabel: CONVERSATION_STRINGS.statusLabel[conversation.status],
    sellerName: assignedSeller?.fullName,
    instanceLabel: originAccount?.label,
  });

  const preview = getMessagePreview(lastMessage);
  const authorPrefix =
    lastMessage?.direction === "out" && assignedSeller?.fullName
      ? `${assignedSeller.fullName}: `
      : "";

  return (
    <div className="overflow-hidden">
      {/* Ties the card back to the row's left-hand instance bar. */}
      <div
        aria-hidden
        className="h-0.5 w-full"
        style={{ backgroundColor: accent ?? "transparent" }}
      />

      <div className="flex gap-3 p-3.5">
        <ContactAvatar display={display} className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1">
          {/* Natural case, up to two lines — the row forces uppercase and clips at one. */}
          <p className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
            {display.name}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <span>{qualifier}</span>
            {temperature && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                  temperature.tone,
                )}
              >
                <Icon icon={temperature.icon} size={10} />
                {temperature.label}
              </span>
            )}
          </p>
          {secondaryLine && (
            <p className="mt-1 text-[13.5px] font-medium tabular-nums text-foreground">
              {secondaryLine}
            </p>
          )}
        </div>
      </div>

      {(preview || conversation.isAccessible === false) && (
        <>
          <div className="h-px bg-border" />
          <div className="p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {COPY.lastMessageLabel}
              {lastMessage && ` · ${formatRelativeTime(lastMessage.sentAt, now)}`}
            </p>
            {preview ? (
              <p className="mt-1.5 line-clamp-4 border-l-2 border-primary/55 pl-2.5 text-xs text-foreground/85">
                {authorPrefix && <span className="text-muted-foreground">{authorPrefix}</span>}
                {preview}
              </p>
            ) : (
              <p className="mt-1.5 text-xs italic text-muted-foreground">
                {COPY.previewUnavailable}
              </p>
            )}
          </div>
        </>
      )}

      <div className="h-px bg-border" />
      <div className="p-3.5">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-muted-foreground">
          {footer.map((part, i) => (
            <span key={part.kind} className="inline-flex items-center">
              {i > 0 && <span className="mr-1.5 opacity-40">·</span>}
              {part.kind === "status" && (
                <span className={cn("mr-1.5 h-1.5 w-1.5 rounded-full", status.dotClass)} aria-hidden />
              )}
              {part.kind === "instance" && accent && (
                <span
                  aria-hidden
                  className="mr-1.5 h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: accent }}
                />
              )}
              {part.text}
            </span>
          ))}
        </p>

        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <ConversationTagChip key={tag.id} tag={tag} size="xs" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check the new file**

Run: `bunx tsc --noEmit`
Expected: nenhum erro **novo** citando `ConversationSummaryCard.tsx`, `summaryFooter.ts` ou `useHoverCapable.ts`. Erros em outros arquivos são o baseline conhecido — ignore-os.

Se `tsc` reclamar de `conversation.isAccessible`, confirme em `src/shared/types/conversation.ts` que o campo é `isAccessible?: boolean` e ajuste a comparação, não o tipo.

- [ ] **Step 4: Run the full suite**

Run: `bun run test`
Expected: PASS — nenhuma regressão.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/ConversationSummaryCard.tsx src/features/conversations/i18n/pt-BR.ts
git commit -m "feat(conversations): add the contact summary card

Its whole job is to un-truncate what the inbox row had to cut: the name in
natural case, the phone the row never shows at all, the last message whole,
and every tag instead of the first two. Everything arrives as a prop the row
already held to draw itself, so opening it costs no request."
```

---

### Task 4: Ligar o cartão à linha

**Files:**
- Modify: `src/features/conversations/components/ConversationListItem.tsx`

**Interfaces:**
- Consumes: `canShowSummaryCard` + `useHoverCapable` (Task 1), `ConversationSummaryCard` (Task 3).
- Produces: nada — é a ponta do fluxo.

- [ ] **Step 1: Add the imports**

Em `ConversationListItem.tsx`, junto aos imports existentes:

```tsx
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useHoverCapable } from "@/shared/hooks/useHoverCapable";
import { canShowSummaryCard } from "../engine/summaryCardVisibility";
import { ConversationSummaryCard } from "./ConversationSummaryCard";
```

- [ ] **Step 2: Keep the full tag list alongside the row's truncated one**

O componente hoje resolve e trunca numa linha só (por volta da linha 184):

```tsx
const rowTags = splitVisibleTags(resolveConversationTags(conversation.tags, tagCatalog), 2);
```

O cartão precisa de **todas** as tags, a linha continua precisando de duas. Trocar por:

```tsx
const resolvedTags = useMemo(
  () => resolveConversationTags(conversation.tags, tagCatalog),
  [conversation.tags, tagCatalog],
);
const rowTags = splitVisibleTags(resolvedTags, 2);
```

- [ ] **Step 3: Compute the gate**

Logo abaixo, ainda no corpo do componente:

```tsx
const hoverCapable = useHoverCapable();
const showSummary = canShowSummaryCard({
  isSelected,
  hoverCapable,
  isMessageSearchResult: Boolean(conversation.matchedMessage),
});
```

- [ ] **Step 4: Extract the existing `<Link>` into a variable and wrap it**

O `return (` atual começa com `<Link to="/app/atendimento/$id" …>`. Trocar `return (` por `const row = (`, manter o JSX do `<Link>` **exatamente** como está, e fechar com `);`. Em seguida, acrescentar ao final do componente:

```tsx
  if (!showSummary) return row;

  return (
    <HoverCard openDelay={500} closeDelay={120}>
      <HoverCardTrigger asChild>{row}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        // The default HoverCardContent is w-64 p-4; the card paints its own padding.
        className="w-[304px] overflow-hidden p-0 motion-reduce:animate-none"
      >
        <ConversationSummaryCard
          conversation={conversation}
          display={display}
          lastMessage={lastMessage}
          originAccount={liveOriginAccount}
          assignedSeller={assignedSeller}
          tags={resolvedTags}
          now={now}
        />
      </HoverCardContent>
    </HoverCard>
  );
}
```

`liveOriginAccount` (já calculado na linha 142) é passado no lugar de `originAccount` para que o cartão veja o mesmo estado de conexão que a linha vê.

- [ ] **Step 5: Build**

Run: `bun run build`
Expected: PASS. É o gate real — o `bun run build` transpila sem checar tipos, então um erro aqui é erro de sintaxe ou de import.

- [ ] **Step 6: Type-check by delta**

Run: `bunx tsc --noEmit`
Expected: a saída traz ~315 erros de baseline pré-existentes. O que importa é que **nenhuma linha dela cite** os arquivos desta branch:

```
ConversationSummaryCard.tsx
ConversationListItem.tsx
summaryCardVisibility.ts
summaryFooter.ts
useHoverCapable.ts
```

Filtre a saída por esses nomes; se nenhum aparecer, o delta está limpo. **Nunca** use `git stash` para comparar com a `main` — a pilha de stash é compartilhada entre todas as worktrees e outras sessões podem estar usando.

- [ ] **Step 7: Run the full suite**

Run: `bun run test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/conversations/components/ConversationListItem.tsx
git commit -m "feat(conversations): open the contact summary on inbox row hover

Wrap the row's Link in a HoverCard that waits half a second before opening
to the right - long enough that sweeping the list toward the scrollbar
doesn't flash a chain of cards, short enough to feel deliberate when you
actually stop. The row now keeps the full resolved tag list next to its
truncated two, since the card shows every tag."
```

---

## Verificação final

- [ ] `bun run test` — suíte inteira verde
- [ ] `bun run build` — verde
- [ ] `bunx tsc --noEmit` — nenhum erro novo nos arquivos desta branch
- [ ] `git log --oneline main..HEAD` — quatro commits, um por tarefa

A validação visual (aparência, temporização, comportamento nas bordas da tela) fica com o dono do projeto — não abrir navegador para conferir.

## Cobertura da especificação

| Seção da spec | Onde é implementada |
|---|---|
| §2.1 princípio de conteúdo | Task 3, corpo do componente |
| §2.2 anatomia | Task 3, Step 2 |
| §2.3 estado "cliente/lead" | Task 3 — `qualifier` + `temperature` |
| §2.3 estado "nome é o telefone" | Task 3 — `secondaryLine` |
| §2.3 estado "sem acesso" | Task 3 — ramo `previewUnavailable` |
| §2.3 estado "sem última mensagem" | Task 3 — guarda `(preview \|\| isAccessible === false)` |
| §2.4 comportamento (delays, lado, colisão) | Task 4, Step 4 |
| §2.4 `prefers-reduced-motion` | Task 4 — `motion-reduce:animate-none` |
| §2.5 as três portas | Task 1 |
| §2.6 conflito com tooltips | Aceito; nenhum código — nenhuma supressão é implementada |
| §3.1 arquivos | Tasks 1–4 |
| §3.2 contrato do componente | Task 3, Step 2 |
| §4 tema e tokens | Global Constraints + Task 3 |
| §5 testes | Tasks 1 e 2 |
