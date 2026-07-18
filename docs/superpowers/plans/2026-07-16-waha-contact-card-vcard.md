# WAHA shared-contact-card (vCard) fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the WAHA parser recognize a shared-contact-card (vCard) message instead of silently dropping it into an empty text message.

**Architecture:** `src/providers/whatsapp/contentFormat.ts` gains a new `nameFromVCard` helper (mirrors the existing `phoneFromVCard`'s defensive style). `src/providers/whatsapp/waha/parser.ts`'s `extractContent()` gets a new branch, checked before the generic text fallback, that recognizes the WAHA payload's `vCards` array and produces `{contentType: "contact", text: encodeContact({...})}` — the exact same canonical shape Meta/Evolution/Evolution Go already produce, so the existing `ContactBubble` frontend component and `waha-webhook/index.ts`'s generic `media_type: parsed.contentType` write path need zero changes.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- Only the **first** vCard is used when a message shares multiple contacts at once (`payload.vCards[0]`) — matches the existing simplification already used by the Evolution engine (`contactsArrayMessage.contacts[0]`).
- No changes to Meta, Evolution, or Evolution Go engines — WAHA-only.
- No changes to `waha-webhook/index.ts` — it already writes `media_type: parsed.contentType` / `text: parsed.text` generically; `"contact"` flows through unmodified.
- After any change under `src/providers/whatsapp/`, run `bun run scripts/sync-whatsapp-shared.ts` before considering a task done.
- `bun run test` (Vitest) must stay green at every task.
- This plan does **not** cover the retroactive backfill of the messages already stored empty — that is a one-time production data operation with its own confirmation step, handled separately after this code fix lands (see the design doc §6 for the approach).

---

### Task 1: `nameFromVCard` helper

**Files:**
- Modify: `src/providers/whatsapp/contentFormat.ts`
- Test: `src/providers/whatsapp/contentFormat.test.ts`

**Interfaces:**
- Produces: `export function nameFromVCard(vcard: string | undefined | null): string | undefined` — extracts the vCard's `FN:` (Formatted Name) line. Returns `undefined` when the line is absent, empty, or the input itself is absent.

- [ ] **Step 1: Write the failing tests**

Add to `src/providers/whatsapp/contentFormat.test.ts`, right after the existing `describe("phoneFromVCard", ...)` block:

```ts
describe("nameFromVCard", () => {
  it("extracts the FN line", () => {
    const vcard = "BEGIN:VCARD\nVERSION:3.0\nN:Silva;João;;;\nFN:João Silva\nEND:VCARD";
    expect(nameFromVCard(vcard)).toBe("João Silva");
  });

  it("extracts FN from a real WAHA capture (business account, 2026-07-16)", () => {
    const vcard =
      "BEGIN:VCARD\nVERSION:3.0\nN:Pitao;Lurival Spuldaro - Loja do Basculante Binotto Group;Binoto;;\nFN:Lurival Spuldaro - Loja do Basculante Binotto Group Binoto Pitao\nORG:Lurival Spuldaro - Loja do Basculante Binotto Group\nitem1.TEL;waid=555499005499:+55 54 9900-5499\nEND:VCARD";
    expect(nameFromVCard(vcard)).toBe(
      "Lurival Spuldaro - Loja do Basculante Binotto Group Binoto Pitao",
    );
  });

  it("returns undefined when FN is absent", () => {
    expect(nameFromVCard("BEGIN:VCARD\nVERSION:3.0\nTEL:+5554999990000\nEND:VCARD")).toBeUndefined();
  });

  it("returns undefined for empty/undefined input", () => {
    expect(nameFromVCard(undefined)).toBeUndefined();
    expect(nameFromVCard("")).toBeUndefined();
  });

  it("does not bleed into the following line", () => {
    const vcard = "BEGIN:VCARD\nFN:Maria Souza\nORG:Empresa X\nEND:VCARD";
    expect(nameFromVCard(vcard)).toBe("Maria Souza");
  });
});
```

Add `nameFromVCard` to the existing import at the top of the test file (find the `from "./contentFormat"` import block and add it to the named imports, alphabetically — it goes right before `normalizeWahaAdMediaType` or wherever it sorts among the existing names).

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/providers/whatsapp/contentFormat.test.ts`
Expected: FAIL — `nameFromVCard is not exported` (or `is not a function`).

- [ ] **Step 3: Implement `nameFromVCard`**

In `src/providers/whatsapp/contentFormat.ts`, add this function right after `phoneFromVCard` (which ends around line 152):

```ts
/**
 * Best-effort display name from a vCard's FN (Formatted Name) line — the
 * only place a bare vCard (WAHA) carries a name; Baileys-shaped engines get
 * it from a separate proto field instead (see encodeBaileysContact).
 */
export function nameFromVCard(vcard: string | undefined | null): string | undefined {
  if (!vcard) return undefined;
  const fn = vcard.match(/^FN:(.+)$/m);
  return fn ? oneLine(fn[1]) || undefined : undefined;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/providers/whatsapp/contentFormat.test.ts`
Expected: PASS — all cases, including the 5 new `nameFromVCard` ones.

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/contentFormat.ts src/providers/whatsapp/contentFormat.test.ts
git commit -m "feat(whatsapp): add nameFromVCard helper for shared-contact-card names"
```

---

### Task 2: WAHA parser — recognize shared-contact-card (vCard) messages

**Files:**
- Modify: `src/providers/whatsapp/waha/parser.ts`
- Test: `src/providers/whatsapp/waha/parser.test.ts`

**Interfaces:**
- Consumes: `nameFromVCard` (Task 1) and the pre-existing `phoneFromVCard`, `encodeContact` — all from `../contentFormat`.
- Produces: `extractContent()`'s return type is unchanged (`IParsedContent`); it now returns `{contentType: "contact", text: ...}` when `payload.vCards?.[0]` is present, instead of falling through to `{contentType: "text", text: ""}`.

- [ ] **Step 1: Write the failing tests**

Add to `src/providers/whatsapp/waha/parser.test.ts`, as a new `describe` block after the existing `describe("parseWahaMessageEvent", ...)` block (before the `describe("parseWahaMessageEvent — ad referral ...")` block):

```ts
describe("parseWahaMessageEvent — shared contact card (vCard)", () => {
  const vcard =
    "BEGIN:VCARD\nVERSION:3.0\nN:Pitao;Lurival Spuldaro - Loja do Basculante Binotto Group;Binoto;;\nFN:Lurival Spuldaro - Loja do Basculante Binotto Group Binoto Pitao\nitem1.TEL;waid=555499005499:+55 54 9900-5499\nEND:VCARD";

  it("parses an inbound shared-contact-card message (real capture shape, 2026-07-16)", () => {
    const result = parseWahaMessageEvent(
      {
        id: "false_34420606116003@lid_ACA3C349CEB6519AF06CB3EC04948445",
        timestamp: 1752666641,
        from: "34420606116003@lid",
        fromMe: false,
        body: "",
        hasMedia: false,
        vCards: [vcard],
      },
      accountId,
    );
    if (result.type !== "message") throw new Error("expected message");
    expect(result.contentType).toBe("contact");
    expect(result.text).toBe(
      "Lurival Spuldaro - Loja do Basculante Binotto Group Binoto Pitao\n+555499005499",
    );
  });

  it("uses only the first vCard when multiple contacts are shared at once", () => {
    const secondVcard = "BEGIN:VCARD\nVERSION:3.0\nFN:Segundo Contato\nEND:VCARD";
    const result = parseWahaMessageEvent(
      {
        id: "id-multi",
        timestamp: 1752666641,
        from: "5511988887777@c.us",
        fromMe: false,
        body: "",
        hasMedia: false,
        vCards: [vcard, secondVcard],
      },
      accountId,
    );
    if (result.type !== "message") throw new Error("expected message");
    expect(result.contentType).toBe("contact");
    expect(result.text).toContain("Lurival Spuldaro");
    expect(result.text).not.toContain("Segundo Contato");
  });

  it("parses an outbound echo of a shared-contact-card the same way", () => {
    const result = parseWahaMessageEvent(
      {
        id: "id-echo",
        timestamp: 1752666641,
        from: "5511988887777@c.us",
        fromMe: true,
        to: undefined,
        body: "",
        hasMedia: false,
        vCards: [vcard],
      },
      accountId,
    );
    expect(result.type).toBe("outbound-echo");
    if (result.type !== "outbound-echo") throw new Error("expected outbound-echo");
    expect(result.contentType).toBe("contact");
    expect(result.text).toBe(
      "Lurival Spuldaro - Loja do Basculante Binotto Group Binoto Pitao\n+555499005499",
    );
  });

  it("falls back to plain text when vCards is an empty array (no card actually shared)", () => {
    const result = parseWahaMessageEvent(
      {
        id: "id-no-card",
        timestamp: 1752666641,
        from: "5511988887777@c.us",
        fromMe: false,
        body: "Mensagem normal",
        hasMedia: false,
        vCards: [],
      },
      accountId,
    );
    if (result.type !== "message") throw new Error("expected message");
    expect(result.contentType).toBe("text");
    expect(result.text).toBe("Mensagem normal");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/providers/whatsapp/waha/parser.test.ts`
Expected: FAIL — the 3 new `contentType: "contact"` assertions fail (actual value is `"text"` with empty `text`).

- [ ] **Step 3: Implement the vCards branch**

In `src/providers/whatsapp/waha/parser.ts`, add the import at the top of the file (after the existing `import type { ... } from "../types";` line):

```ts
import { encodeContact, nameFromVCard, phoneFromVCard } from "../contentFormat";
```

Add `vCards?: string[];` to the `IWahaMessagePayload` interface (right after the `media?: IWahaMedia | null;` field, before the `_data` field):

```ts
export interface IWahaMessagePayload {
  id?: string;
  timestamp?: number;
  from?: string;
  fromMe?: boolean;
  to?: string;
  body?: string;
  hasMedia?: boolean;
  media?: IWahaMedia | null;
  /** Present (possibly empty) on every WAHA message payload; non-empty when
   *  the sender shared one or more contact cards. Only the first is used —
   *  see extractContent. */
  vCards?: string[];
  /** HYPOTHESIZED: WAHA's GOWS engine wraps whatsmeow directly, so the raw
   *  engine message (when WAHA exposes it) should mirror IGoMessageBody
   *  nested under `_data.Message`. Unconfirmed — extractWahaAdReferral
   *  degrades to undefined when this path is absent, so a wrong guess can
   *  never break message parsing itself. */
  _data?: { Message?: IWahaGoMessageBody };
}
```

Replace `extractContent`:

```ts
export function extractContent(payload: IWahaMessagePayload): IParsedContent {
  if (payload.hasMedia && payload.media?.url) {
    return {
      contentType: contentTypeFromMimetype(payload.media.mimetype),
      text: payload.body || undefined,
      mediaId: payload.media.url,
      mediaFilename: payload.media.filename ?? undefined,
    };
  }
  if (payload.vCards?.[0]) {
    const vcard = payload.vCards[0];
    return {
      contentType: "contact",
      text: encodeContact({ name: nameFromVCard(vcard), phone: phoneFromVCard(vcard) }),
    };
  }
  return { contentType: "text", text: payload.body ?? "" };
}
```

Also update the file's header doc comment (lines 1-19) — the payload shape line currently reads:

```
 *   { id, timestamp, from, fromMe, to, body, hasMedia, media?: {url, mimetype, filename, error}, ack }
```

Change it to:

```
 *   { id, timestamp, from, fromMe, to, body, hasMedia, media?: {url, mimetype, filename, error}, vCards?: string[], ack }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/providers/whatsapp/waha/parser.test.ts`
Expected: PASS — all cases, including the 4 new vCard ones.

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/waha/parser.ts src/providers/whatsapp/waha/parser.test.ts
git commit -m "fix(whatsapp): recognize WAHA shared-contact-card (vCard) messages"
```

---

### Task 3: Sync mirrors and verify the full suite

**Files:**
- Generated (via script, do not hand-edit): `supabase/functions/_shared/whatsapp/contentFormat.ts`, `supabase/functions/_shared/whatsapp/waha/parser.ts`

**Interfaces:**
- Consumes: the finished Task 1 + Task 2 source files.
- Produces: nothing new — this task only regenerates the mirror tree and verifies no regressions.

- [ ] **Step 1: Run the sync script**

```bash
bun run scripts/sync-whatsapp-shared.ts
```

Expected output: `synced <N> files → supabase/functions/_shared/whatsapp/`.

- [ ] **Step 2: Verify the mirrored files reflect the change**

Run: `grep -n "vCards" supabase/functions/_shared/whatsapp/waha/parser.ts`
Expected: matches on the new interface field, doc comment, and `extractContent` branch — same as the source file.

Run: `grep -n "nameFromVCard" supabase/functions/_shared/whatsapp/contentFormat.ts`
Expected: match on the new exported function.

- [ ] **Step 3: Run the full test suite**

Run: `bun run test`
Expected: all test files pass, no regressions (same count as before this plan, plus the 9 new tests added in Tasks 1–2).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/whatsapp/
git commit -m "chore(whatsapp): sync shared mirror (nameFromVCard, WAHA vCard support)"
```
