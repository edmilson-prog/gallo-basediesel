# Origem por anúncio (Click-to-WhatsApp Ads) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** flag conversations that began (or most recently resumed) through a WhatsApp ad/post referral, and surface that with a badge in the inbox list + conversation detail panel.

**Architecture:** the 3 in-scope WhatsApp engines (Evolution v2/Baileys, Evolution-Go/whatsmeow, WAHA/GOWS-whatsmeow) already receive `contextInfo.externalAdReplyInfo` on the first message of an ad-originated chat; each engine's parser gains a pure `extractAdReferral` function normalizing it to a shared `IAdReferral` shape, which the webhook pipeline (two independent code paths — the shared `_shared/whatsapp/webhook/core.ts` for Meta/Evolution/Evolution-Go/OpenWA, and the fully-isolated `waha-webhook` Edge Function) writes into a new `conversations.ad_referral jsonb` column, overwriting on every message that carries one (latest-wins). The frontend reads it like any other conversation field and renders a small badge.

**Tech Stack:** TypeScript, Vitest (parser/core unit tests), Supabase Postgres (migration), Deno Edge Functions, React/Tailwind (badge).

## Global Constraints

- Runtime-agnostic files under `src/providers/whatsapp/**` use ONLY relative imports (no `@/` aliases) — they are mirrored byte-for-byte into `supabase/functions/_shared/whatsapp/**` via `bun run scripts/sync-whatsapp-shared.ts`. Run that script after editing anything under `src/providers/whatsapp/`.
- `IConversation`/domain types live in `src/shared/types/` and are a SEPARATE, duplicated shape from the provider-layer `src/providers/whatsapp/types.ts` — never cross-import between them (existing architectural boundary, not something this plan changes).
- `conversations.ad_referral` is set ONLY by the webhook (server-side, best-effort, never blocks message persistence on failure of this specific write is not attempted — a DB error here is a real error, same as any other webhook write). No app-facing create/update path ever writes to it.
- Never apply the new migration to production, and never deploy the touched Edge Functions (`whatsapp-webhook`, `waha-webhook`), without the dono's explicit confirmation (standing rule for this project — migrations/edge deploys are gated, not automatic).
- WAHA's and Evolution v2's exact JSON field casing for `externalAdReplyInfo` is NOT confirmed against a real payload (only Evolution-Go's whatsmeow shape is confirmed, via `docs/integracoes/evo-go/doc.json`). Every `extractAdReferral` must degrade to `undefined` on any missing/malformed field — it must never throw and never break message parsing.
- Test gate for everything under `src/`: `bun run test` (Vitest) must stay green after every task. `supabase/functions/**` (Deno) is not covered by Vitest — those tasks are verified by `bunx tsc --noEmit` and by the shared-core tests (which exercise the injected `IWebhookDb` contract, not the concrete Supabase adapter).

---

### Task 1: Shared `IAdReferral` type + `IInboundMessage.adReferral`

**Files:**
- Modify: `src/providers/whatsapp/types.ts`

**Interfaces:**
- Produces: `IAdReferral` (exported), and `IInboundMessage.adReferral?: IAdReferral` — every later parser task imports and returns this.

- [ ] **Step 1: Add the `IAdReferral` type**

In `src/providers/whatsapp/types.ts`, add near the top of the "Inbound (webhook utilities)" section (right before `export interface IInboundMessage {`):

```ts
/**
 * Normalized WhatsApp ad/post referral (`contextInfo.externalAdReplyInfo` in
 * the underlying protocol) — present only on the message that carried it.
 * Each engine's parser has its own `extractAdReferral`, since the raw field
 * names/casing differ between Baileys (Evolution v2) and whatsmeow
 * (Evolution-Go/WAHA); this is the ONE shape every engine normalizes into.
 */
export interface IAdReferral {
  sourceId?: string;
  sourceUrl?: string;
  sourceType?: string;
  headline?: string;
  body?: string;
  mediaType?: "image" | "video";
  mediaUrl?: string;
}
```

- [ ] **Step 2: Add the field to `IInboundMessage`**

In the same file, inside `export interface IInboundMessage { ... }`, add right after `senderName?: string;` (before `timestamp: ISO8601;`):

```ts
  /** Set only on the message that carried a WhatsApp ad/post referral. */
  adReferral?: IAdReferral;
```

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors (this only adds an optional field/type — nothing consumes it yet).

- [ ] **Step 4: Commit**

```bash
git add src/providers/whatsapp/types.ts
git commit -m "feat(whatsapp): add IAdReferral shared type"
```

---

### Task 2: Evolution-Go (whatsmeow) parser — `extractGoAdReferral`

Schema confirmed against `docs/integracoes/evo-go/doc.json` (`ContextInfo_ExternalAdReplyInfo`: `title`, `body`, `sourceID`, `sourceType`, `sourceURL`, `mediaType` (enum, serialized name varies — normalize defensively), `mediaURL`, `ctwaClid`).

**Files:**
- Modify: `src/providers/whatsapp/evolution-go/parser.ts`
- Test: `src/providers/whatsapp/evolution-go/parser.test.ts`

**Interfaces:**
- Consumes: `IAdReferral` from `../types` (Task 1).
- Produces: `extractGoAdReferral(msg: IGoMessageBody): IAdReferral | undefined` (exported), wired into `parseEvolutionGoInbound`'s `message` return so `IInboundMessage.adReferral` is populated end-to-end.

- [ ] **Step 1: Write the failing test**

Append to `src/providers/whatsapp/evolution-go/parser.test.ts`:

```ts
describe("parseEvolutionGoInbound — ad referral (externalAdReply)", () => {
  it("extracts adReferral from an extendedTextMessage contextInfo", () => {
    const parsed = parseEvolutionGoInbound(
      {
        event: "Message",
        data: {
          Info: { Chat: "5555988887777@s.whatsapp.net", Sender: "5555988887777@s.whatsapp.net", IsFromMe: false, ID: "GOMSG1", Timestamp: 1765400000 },
          Message: {
            extendedTextMessage: {
              text: "Opa! Vim do anúncio",
              contextInfo: {
                externalAdReply: {
                  title: "Módulos Volvo — instale em minutos",
                  body: "Fale com a GALLO",
                  sourceID: "120210000000000",
                  sourceType: "ad",
                  sourceURL: "https://fb.me/xyz",
                  mediaType: "ContextInfo_ExternalAdReplyInfo_IMAGE",
                  mediaURL: "https://scontent.example/ad.jpg",
                  ctwaClid: "AfE...clid",
                },
              },
            },
          },
        },
      },
      "acc-1",
    ) as { adReferral?: unknown };
    expect(parsed.adReferral).toEqual({
      sourceId: "120210000000000",
      sourceUrl: "https://fb.me/xyz",
      sourceType: "ad",
      headline: "Módulos Volvo — instale em minutos",
      body: "Fale com a GALLO",
      mediaType: "image",
      mediaUrl: "https://scontent.example/ad.jpg",
    });
  });

  it("leaves adReferral undefined for a plain message (no externalAdReply)", () => {
    const parsed = parseEvolutionGoInbound(
      {
        event: "Message",
        data: {
          Info: { Chat: "5555988887777@s.whatsapp.net", IsFromMe: false, ID: "GOMSG2", Timestamp: 1765400000 },
          Message: { conversation: "quanto custa o filtro?" },
        },
      },
      "acc-1",
    ) as { adReferral?: unknown };
    expect(parsed.adReferral).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- evolution-go/parser.test.ts`
Expected: FAIL — `parsed.adReferral` is `undefined` in the first test (extraction not implemented yet), or a TS error if `adReferral` isn't a recognized field (it is, from Task 1, so this fails on the `.toEqual` assertion).

- [ ] **Step 3: Implement `extractGoAdReferral` and wire it in**

In `src/providers/whatsapp/evolution-go/parser.ts`:

1. Extend `IGoMessageBody`'s `extendedTextMessage`, `imageMessage`, `videoMessage` to carry `contextInfo`. Replace:

```ts
export interface IGoMessageBody {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: IGoMediaNode;
  audioMessage?: IGoMediaNode;
  videoMessage?: IGoMediaNode;
  documentMessage?: IGoMediaNode & { fileName?: string };
  locationMessage?: IGoLocationNode;
  contactMessage?: IGoContactNode;
  contactsArrayMessage?: { contacts?: IGoContactNode[] };
}
```

with:

```ts
/** whatsmeow `ContextInfo_ExternalAdReplyInfo` (docs/integracoes/evo-go/doc.json) —
 *  `mediaType` casing is NOT confirmed (bare "IMAGE" vs full enum name), so
 *  extraction below normalizes defensively via string matching. */
interface IGoExternalAdReplyInfo {
  title?: string;
  body?: string;
  sourceID?: string;
  sourceType?: string;
  sourceURL?: string;
  mediaType?: string;
  mediaURL?: string;
  ctwaClid?: string;
}
interface IGoContextInfo {
  externalAdReply?: IGoExternalAdReplyInfo;
}
export interface IGoMessageBody {
  conversation?: string;
  extendedTextMessage?: { text?: string; contextInfo?: IGoContextInfo };
  imageMessage?: IGoMediaNode & { contextInfo?: IGoContextInfo };
  audioMessage?: IGoMediaNode;
  videoMessage?: IGoMediaNode & { contextInfo?: IGoContextInfo };
  documentMessage?: IGoMediaNode & { fileName?: string };
  locationMessage?: IGoLocationNode;
  contactMessage?: IGoContactNode;
  contactsArrayMessage?: { contacts?: IGoContactNode[] };
}
```

2. Import `IAdReferral` at the top (alongside the existing type import):

```ts
import type { IInboundMessage, IInboundStatus, InboundContentType, IOutboundEcho, IAdReferral } from "../types";
```

3. Add the extraction function, right after `extractContent` (before `const RECEIPT_STATUS_MAP`):

```ts
function normalizeGoAdMediaType(value: string | undefined): "image" | "video" | undefined {
  if (!value) return undefined;
  const v = value.toUpperCase();
  if (v.includes("IMAGE")) return "image";
  if (v.includes("VIDEO")) return "video";
  return undefined;
}

/** whatsmeow shape confirmed via docs/integracoes/evo-go/doc.json — the JSON
 *  property on ContextInfo is `externalAdReply` (the `ExternalAdReplyInfo`
 *  suffix names only the TYPE, not the key). Returns undefined (never
 *  throws) whenever externalAdReply is absent/malformed. */
export function extractGoAdReferral(msg: IGoMessageBody): IAdReferral | undefined {
  const info =
    msg.extendedTextMessage?.contextInfo?.externalAdReply ??
    msg.imageMessage?.contextInfo?.externalAdReply ??
    msg.videoMessage?.contextInfo?.externalAdReply;
  if (!info) return undefined;
  return {
    sourceId: info.sourceID,
    sourceUrl: info.sourceURL,
    sourceType: info.sourceType,
    headline: info.title,
    body: info.body,
    mediaType: normalizeGoAdMediaType(info.mediaType),
    mediaUrl: info.mediaURL,
  };
}
```

4. In `parseEvolutionGoInbound`, in the final `return { type: "message", ... }` block (the non-echo, non-status branch), add the field:

```ts
  return {
    type: "message",
    providerMessageId: info.ID ?? "",
    fromPhone: jidToE164(info.Sender ?? chat),
    toAccountPhone: "",
    accountId,
    contentType: content.contentType,
    text: content.text,
    mediaId: content.mediaId,
    mediaCaption: content.mediaCaption,
    mediaFilename: content.mediaFilename,
    senderName: info.PushName,
    adReferral: extractGoAdReferral(ev.data?.Message ?? {}),
    timestamp,
    rawPayload,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- evolution-go/parser.test.ts`
Expected: PASS (all tests in the file, including the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/evolution-go/parser.ts src/providers/whatsapp/evolution-go/parser.test.ts
git commit -m "feat(whatsapp): extract ad referral from Evolution-Go messages"
```

---

### Task 3: Evolution v2 (Baileys) parser — `extractEvolutionAdReferral`

⚠️ Baileys' field casing (`sourceId`/`sourceUrl`/`mediaUrl`, lowerCamelCase) is a best-effort match to the public Baileys `WAProto` types — NOT confirmed against a live payload. Extraction must degrade to `undefined`, never throw, on anything unexpected.

**Files:**
- Modify: `src/providers/whatsapp/evolution/parser.ts`
- Test: `src/providers/whatsapp/evolution/parser.test.ts`

**Interfaces:**
- Consumes: `IAdReferral` from `../types` (Task 1).
- Produces: `extractEvolutionAdReferral(message: IEvolutionRawMessage): IAdReferral | undefined` (exported), wired into `parseEvolutionInbound`'s `message` return.

- [ ] **Step 1: Write the failing test**

Append to `src/providers/whatsapp/evolution/parser.test.ts`:

```ts
describe("parseEvolutionInbound — ad referral (externalAdReplyInfo)", () => {
  it("extracts adReferral from an extendedTextMessage contextInfo (Baileys casing)", () => {
    const parsed = parseEvolutionInbound(
      upsertEvent({
        message: {
          extendedTextMessage: {
            text: "Opa! Vim do anúncio",
            contextInfo: {
              externalAdReplyInfo: {
                title: "Módulos Volvo — instale em minutos",
                body: "Fale com a GALLO",
                sourceId: "120210000000000",
                sourceType: "ad",
                sourceUrl: "https://fb.me/xyz",
                mediaType: 1,
                mediaUrl: "https://scontent.example/ad.jpg",
                ctwaClid: "AfE...clid",
              },
            },
          },
        },
      }),
      "",
    ) as { adReferral?: unknown };
    expect(parsed.adReferral).toEqual({
      sourceId: "120210000000000",
      sourceUrl: "https://fb.me/xyz",
      sourceType: "ad",
      headline: "Módulos Volvo — instale em minutos",
      body: "Fale com a GALLO",
      mediaType: "image",
      mediaUrl: "https://scontent.example/ad.jpg",
    });
  });

  it("leaves adReferral undefined for a plain message", () => {
    const parsed = parseEvolutionInbound(upsertEvent({ message: { conversation: "oi" } }), "") as {
      adReferral?: unknown;
    };
    expect(parsed.adReferral).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- evolution/parser.test.ts`
Expected: FAIL on the `.toEqual` assertion (extraction not implemented).

- [ ] **Step 3: Implement `extractEvolutionAdReferral` and wire it in**

In `src/providers/whatsapp/evolution/parser.ts`:

1. Extend `IEvolutionRawMessage`. Replace:

```ts
export interface IEvolutionRawMessage {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: { caption?: string; mimetype?: string };
  audioMessage?: { mimetype?: string };
  videoMessage?: { caption?: string; mimetype?: string };
  documentMessage?: { caption?: string; fileName?: string; mimetype?: string };
  locationMessage?: {
    degreesLatitude?: number;
    degreesLongitude?: number;
    name?: string;
    address?: string;
  };
  contactMessage?: { displayName?: string; vcard?: string };
  contactsArrayMessage?: { contacts?: Array<{ displayName?: string; vcard?: string }> };
}
```

with:

```ts
/** Baileys `WAProto.IExternalAdReplyInfo` — casing is a best-effort match to
 *  the public Baileys types, NOT confirmed against a live payload yet. */
interface IEvolutionExternalAdReplyInfo {
  title?: string;
  body?: string;
  sourceId?: string;
  sourceUrl?: string;
  sourceType?: string;
  mediaType?: number | string;
  mediaUrl?: string;
  ctwaClid?: string;
}
interface IEvolutionContextInfo {
  externalAdReplyInfo?: IEvolutionExternalAdReplyInfo;
}
export interface IEvolutionRawMessage {
  conversation?: string;
  extendedTextMessage?: { text?: string; contextInfo?: IEvolutionContextInfo };
  imageMessage?: { caption?: string; mimetype?: string; contextInfo?: IEvolutionContextInfo };
  audioMessage?: { mimetype?: string };
  videoMessage?: { caption?: string; mimetype?: string; contextInfo?: IEvolutionContextInfo };
  documentMessage?: { caption?: string; fileName?: string; mimetype?: string };
  locationMessage?: {
    degreesLatitude?: number;
    degreesLongitude?: number;
    name?: string;
    address?: string;
  };
  contactMessage?: { displayName?: string; vcard?: string };
  contactsArrayMessage?: { contacts?: Array<{ displayName?: string; vcard?: string }> };
}
```

2. Import `IAdReferral`:

```ts
import type { IInboundMessage, IInboundStatus, InboundContentType, IOutboundEcho, IAdReferral } from "../types";
```

3. Add the extraction function, right after `extractEvolutionContent`:

```ts
function normalizeAdMediaType(value: number | string | undefined): "image" | "video" | undefined {
  if (value === 1 || value === "IMAGE") return "image";
  if (value === 2 || value === "VIDEO") return "video";
  return undefined;
}

/** Baileys casing best-effort — see IEvolutionExternalAdReplyInfo. Returns
 *  undefined (never throws) whenever externalAdReplyInfo is absent/malformed. */
export function extractEvolutionAdReferral(message: IEvolutionRawMessage): IAdReferral | undefined {
  const info =
    message.extendedTextMessage?.contextInfo?.externalAdReplyInfo ??
    message.imageMessage?.contextInfo?.externalAdReplyInfo ??
    message.videoMessage?.contextInfo?.externalAdReplyInfo;
  if (!info) return undefined;
  return {
    sourceId: info.sourceId,
    sourceUrl: info.sourceUrl,
    sourceType: info.sourceType,
    headline: info.title,
    body: info.body,
    mediaType: normalizeAdMediaType(info.mediaType),
    mediaUrl: info.mediaUrl,
  };
}
```

4. In `parseEvolutionInbound`'s final `return { type: "message", ... }` block, add:

```ts
    senderName: data.pushName,
    adReferral: extractEvolutionAdReferral(data.message ?? {}),
    timestamp: timestampToIso(data.messageTimestamp),
    rawPayload,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- evolution/parser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/evolution/parser.ts src/providers/whatsapp/evolution/parser.test.ts
git commit -m "feat(whatsapp): extract ad referral from Evolution v2 messages"
```

---

### Task 4: WAHA parser — `extractWahaAdReferral`

⚠️ Highest-uncertainty task. WAHA's webhook envelope (`IWahaMessagePayload`) is a FLAT shape (`id, timestamp, from, fromMe, to, body, hasMedia, media`) — it does not today expose the underlying whatsmeow message at all. WAHA is documented to attach the raw engine object under a `_data` key for some engines; since WAHA's GOWS engine wraps whatsmeow (the same library Evolution-Go uses), this task assumes `_data.Message` mirrors `IGoMessageBody`'s shape from Task 2 — an EXPLICIT, documented hypothesis, not a confirmed fact. See Task 13 for the production verification step.

**Files:**
- Modify: `src/providers/whatsapp/waha/parser.ts`
- Test: `src/providers/whatsapp/waha/parser.test.ts`

**Interfaces:**
- Consumes: `IAdReferral` from `../types` (Task 1).
- Produces: `extractWahaAdReferral(payload: IWahaMessagePayload): IAdReferral | undefined` (exported), wired into `parseWahaMessageEvent`'s inbound (non-echo) `message` return.

- [ ] **Step 1: Write the failing test**

Append to `src/providers/whatsapp/waha/parser.test.ts`:

```ts
describe("parseWahaMessageEvent — ad referral (hypothesized _data.Message shape)", () => {
  it("extracts adReferral when _data.Message carries externalAdReply", () => {
    const parsed = parseWahaMessageEvent(
      {
        id: "WAHA1",
        timestamp: 1765400000,
        from: "5555988887777@c.us",
        fromMe: false,
        body: "Opa! Vim do anúncio",
        hasMedia: false,
        _data: {
          Message: {
            extendedTextMessage: {
              contextInfo: {
                externalAdReply: {
                  title: "Módulos Volvo — instale em minutos",
                  body: "Fale com a GALLO",
                  sourceID: "120210000000000",
                  sourceType: "ad",
                  sourceURL: "https://fb.me/xyz",
                  mediaType: "IMAGE",
                  mediaURL: "https://scontent.example/ad.jpg",
                  ctwaClid: "AfE...clid",
                },
              },
            },
          },
        },
      },
      "acc-1",
    ) as { adReferral?: unknown };
    expect(parsed.adReferral).toEqual({
      sourceId: "120210000000000",
      sourceUrl: "https://fb.me/xyz",
      sourceType: "ad",
      headline: "Módulos Volvo — instale em minutos",
      body: "Fale com a GALLO",
      mediaType: "image",
      mediaUrl: "https://scontent.example/ad.jpg",
    });
  });

  it("leaves adReferral undefined when _data is absent (today's real payload shape)", () => {
    const parsed = parseWahaMessageEvent(
      { id: "WAHA2", timestamp: 1765400000, from: "5555988887777@c.us", fromMe: false, body: "oi" },
      "acc-1",
    ) as { adReferral?: unknown };
    expect(parsed.adReferral).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- waha/parser.test.ts`
Expected: FAIL on the first test's `.toEqual` (extraction not implemented; second test already passes trivially since the field doesn't exist yet).

- [ ] **Step 3: Implement `extractWahaAdReferral` and wire it in**

In `src/providers/whatsapp/waha/parser.ts`:

1. Add the hypothesized nested shape and extend `IWahaMessagePayload`. Replace:

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
}
```

with:

```ts
/** Mirrors whatsmeow's ContextInfo_ExternalAdReplyInfo casing (same library
 *  as Evolution-Go — see IGoExternalAdReplyInfo). NOT confirmed against a
 *  real WAHA payload (see Task 4 in the ad-source-detection plan). */
interface IWahaExternalAdReplyInfo {
  title?: string;
  body?: string;
  sourceID?: string;
  sourceType?: string;
  sourceURL?: string;
  mediaType?: string;
  mediaURL?: string;
  ctwaClid?: string;
}
interface IWahaGoMessageBody {
  extendedTextMessage?: { contextInfo?: { externalAdReply?: IWahaExternalAdReplyInfo } };
  imageMessage?: { contextInfo?: { externalAdReply?: IWahaExternalAdReplyInfo } };
  videoMessage?: { contextInfo?: { externalAdReply?: IWahaExternalAdReplyInfo } };
}

export interface IWahaMessagePayload {
  id?: string;
  timestamp?: number;
  from?: string;
  fromMe?: boolean;
  to?: string;
  body?: string;
  hasMedia?: boolean;
  media?: IWahaMedia | null;
  /** HYPOTHESIZED: WAHA's GOWS engine wraps whatsmeow directly, so the raw
   *  engine message (when WAHA exposes it) should mirror IGoMessageBody
   *  nested under `_data.Message`. Unconfirmed — extractWahaAdReferral
   *  degrades to undefined when this path is absent, so a wrong guess can
   *  never break message parsing itself. */
  _data?: { Message?: IWahaGoMessageBody };
}
```

2. Import `IAdReferral`:

```ts
import type { IInboundMessage, InboundContentType, IOutboundEcho, IAdReferral } from "../types";
```

3. Add the extraction function, right after `extractContent`:

```ts
function normalizeWahaAdMediaType(value: string | undefined): "image" | "video" | undefined {
  if (!value) return undefined;
  const v = value.toUpperCase();
  if (v.includes("IMAGE")) return "image";
  if (v.includes("VIDEO")) return "video";
  return undefined;
}

/** See IWahaMessagePayload._data doc — hypothesized shape, not confirmed.
 *  Property key is `externalAdReply` (confirmed on whatsmeow's own
 *  ContextInfo — the `ExternalAdReplyInfo` suffix names only the TYPE, see
 *  Task 2's extractGoAdReferral). */
export function extractWahaAdReferral(payload: IWahaMessagePayload): IAdReferral | undefined {
  const msg = payload._data?.Message;
  const info =
    msg?.extendedTextMessage?.contextInfo?.externalAdReply ??
    msg?.imageMessage?.contextInfo?.externalAdReply ??
    msg?.videoMessage?.contextInfo?.externalAdReply;
  if (!info) return undefined;
  return {
    sourceId: info.sourceID,
    sourceUrl: info.sourceURL,
    sourceType: info.sourceType,
    headline: info.title,
    body: info.body,
    mediaType: normalizeWahaAdMediaType(info.mediaType),
    mediaUrl: info.mediaURL,
  };
}
```

4. In `parseWahaMessageEvent`'s final `return { type: "message", ... }` block (the non-`fromMe` branch), add:

```ts
  return {
    type: "message",
    providerMessageId: payload.id,
    fromPhone: LID_JID.test(payload.from ?? "") ? "" : jidToE164(payload.from),
    fromLid: LID_JID.test(payload.from ?? "") ? payload.from : undefined,
    toAccountPhone: "",
    accountId,
    contentType: content.contentType,
    text: content.text,
    mediaId: content.mediaId,
    mediaFilename: content.mediaFilename,
    adReferral: extractWahaAdReferral(payload),
    timestamp,
    rawPayload,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- waha/parser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/waha/parser.ts src/providers/whatsapp/waha/parser.test.ts
git commit -m "feat(whatsapp): extract ad referral from WAHA messages (hypothesized shape)"
```

---

### Task 5: Sync the runtime-agnostic mirror

**Files:**
- Generated (do not hand-edit): `supabase/functions/_shared/whatsapp/types.ts`, `supabase/functions/_shared/whatsapp/evolution/parser.ts`, `supabase/functions/_shared/whatsapp/evolution-go/parser.ts`, `supabase/functions/_shared/whatsapp/waha/parser.ts`

- [ ] **Step 1: Run the sync script**

Run: `bun run scripts/sync-whatsapp-shared.ts`
Expected output: `synced <N> files → supabase/functions/_shared/whatsapp/`

- [ ] **Step 2: Verify the mirror actually picked up the 3 parser changes**

Run: `git status --short supabase/functions/_shared/whatsapp/`
Expected: modified entries for `types.ts`, `evolution/parser.ts`, `evolution-go/parser.ts`, `waha/parser.ts` (paths under `supabase/functions/_shared/whatsapp/`).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/whatsapp/
git commit -m "chore(whatsapp): sync shared mirror after ad-referral extraction"
```

---

### Task 6: Migration — `conversations.ad_referral`

**Files:**
- Create: `supabase/migrations/20260713150000_conversations_ad_referral.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Ad-source detection (Click-to-WhatsApp Ads): flags conversations that
-- began (or most recently resumed) via a WhatsApp ad/post referral. Set by
-- the webhook (Evolution v2, Evolution-Go, WAHA) whenever an inbound message
-- carries WhatsApp's contextInfo.externalAdReplyInfo — overwritten on every
-- later message that also carries one (latest-wins), left untouched by
-- messages that don't. NULL means "no known ad referral" (the vast majority
-- of conversations). No app-facing write path ever sets this column.
alter table public.conversations
  add column if not exists ad_referral jsonb;
```

- [ ] **Step 2: Commit (do NOT apply to production — see Global Constraints)**

```bash
git add supabase/migrations/20260713150000_conversations_ad_referral.sql
git commit -m "feat(db): add conversations.ad_referral column (not yet applied to prod)"
```

---

### Task 7: Webhook core (`IWebhookDb`) — `setConversationAdReferral`

Covers Meta/Evolution v2/Evolution-Go/OpenWA (the shared pipeline). WAHA is handled separately in Task 9 (fully isolated Edge Function, does not use this file).

**Files:**
- Modify: `src/providers/whatsapp/webhook/core.ts`
- Test: `src/providers/whatsapp/webhook/core.test.ts`

**Interfaces:**
- Consumes: `IAdReferral` from `../types` (Task 1); `parsed.adReferral` from `IInboundMessage` (Tasks 2/3).
- Produces: `IWebhookDb.setConversationAdReferral(conversationId: string, adReferral: IAdReferral): Promise<void>` — the concrete Edge Function adapter (Task 8) must implement this method.

- [ ] **Step 1: Write the failing test**

In `src/providers/whatsapp/webhook/core.test.ts`:

1. Add `adReferrals: Array<{ conversationId: string; adReferral: unknown }>;` to `IFakeState` (alongside `bumps`/`reopens`).
2. Add `adReferrals: [],` to `emptyState()`'s returned object.
3. Add the fake implementation inside `makeFakeDb`, right after `bumpConversation`:

```ts
    setConversationAdReferral: async (conversationId, adReferral) => {
      state.adReferrals.push({ conversationId, adReferral });
    },
```

4. Add a new describe block at the end of the file:

```ts
describe("processWebhookEvent — ad referral attribution", () => {
  it("sets conversations.ad_referral when the inbound message carries one", async () => {
    const state = emptyState();
    const adReferral = { headline: "Módulos Volvo", sourceType: "ad" };
    const result = await run(state, {
      ...evolutionTextEvent(),
      data: {
        ...evolutionTextEvent().data,
        message: { conversation: "Opa! Vim do anúncio" },
      },
      __adReferralOverride: adReferral, // placeholder removed below — see note
    });
    expect(result.outcome).toBe("message-created");
  });
});
```

Note: `evolutionTextEvent()` builds a raw Evolution payload, not an `IInboundMessage` — since Task 3's `extractEvolutionAdReferral` only fires on `contextInfo.externalAdReplyInfo`, build the raw payload WITH that nested shape directly instead of a placeholder override. Replace the test body above with:

```ts
describe("processWebhookEvent — ad referral attribution", () => {
  it("sets conversations.ad_referral when the inbound message carries one", async () => {
    const state = emptyState();
    const result = await run(state, {
      event: "messages.upsert",
      instance: "gallo-matriz",
      sender: "5555911111111@s.whatsapp.net",
      data: {
        key: { id: "ADMSG1", remoteJid: "5555988887777@s.whatsapp.net", fromMe: false },
        message: {
          extendedTextMessage: {
            text: "Opa! Vim do anúncio",
            contextInfo: {
              externalAdReplyInfo: { title: "Módulos Volvo", sourceType: "ad" },
            },
          },
        },
        messageTimestamp: 1765400000,
      },
    });
    expect(result.outcome).toBe("message-created");
    expect(state.adReferrals).toEqual([
      {
        conversationId: result.conversationId,
        adReferral: { headline: "Módulos Volvo", sourceType: "ad" },
      },
    ]);
  });

  it("does not call setConversationAdReferral for a plain message", async () => {
    const state = emptyState();
    await run(state, evolutionTextEvent());
    expect(state.adReferrals).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- webhook/core.test.ts`
Expected: FAIL — TypeScript error (`IWebhookDb` has no `setConversationAdReferral`) or, once the fake is added, the assertion fails because `core.ts` never calls it yet.

- [ ] **Step 3: Implement the interface method + call site**

In `src/providers/whatsapp/webhook/core.ts`:

1. Import `IAdReferral`:

```ts
import type { IInboundMessage, IInboundStatus, IOutboundEcho, IAdReferral } from "../types";
```

2. Add to `IWebhookDb` (right after `bumpConversation`'s declaration):

```ts
  /** Best-effort attribution write (ad-source detection, PRD n/a) — sets/
   *  overwrites conversations.ad_referral with the LATEST inbound referral
   *  seen. Only ever called when parsed.adReferral is present. */
  setConversationAdReferral(conversationId: string, adReferral: IAdReferral): Promise<void>;
```

3. In the main inbound flow, right after the bump/reopen block and before `markProcessed` (i.e. right after this existing code):

```ts
  if (!didReopen) {
    await db.bumpConversation(conversation.id, parsed.timestamp);
  }
```

add:

```ts

  // Ad-source attribution (best-effort): overwrite with the LATEST referral
  // seen — a customer can return via a different ad months later, and the
  // conversation should reflect that, not freeze on the first one.
  if (parsed.adReferral) {
    await db.setConversationAdReferral(conversation.id, parsed.adReferral);
  }
```

(leave everything else — `markProcessed`, media download, audit — unchanged).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- webhook/core.test.ts`
Expected: PASS (all tests in the file, including the 2 new ones).

- [ ] **Step 5: Run the full suite**

Run: `bun run test`
Expected: all 230+ files still pass (adding a required interface method means EVERY `IWebhookDb` implementer — just this one fake — must implement it; confirms nothing else in the tree implements this interface independently).

- [ ] **Step 6: Commit**

```bash
git add src/providers/whatsapp/webhook/core.ts src/providers/whatsapp/webhook/core.test.ts
git commit -m "feat(whatsapp): wire ad-referral attribution into the shared webhook core"
```

---

### Task 8: Sync mirror again + wire the concrete Edge Function adapter

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/index.ts`
- Generated: `supabase/functions/_shared/whatsapp/webhook/core.ts` (via sync)

- [ ] **Step 1: Re-run the sync script (core.ts changed in Task 7)**

Run: `bun run scripts/sync-whatsapp-shared.ts`
Expected: `synced <N> files → supabase/functions/_shared/whatsapp/`

- [ ] **Step 2: Implement `setConversationAdReferral` in the adapter**

In `supabase/functions/whatsapp-webhook/index.ts`, right after the existing `async bumpConversation(conversationId, lastMessageAt) { ... }` method, add:

```ts
    async setConversationAdReferral(conversationId, adReferral) {
      const { error } = await admin
        .from("conversations")
        .update({ ad_referral: adReferral })
        .eq("id", conversationId);
      if (error) throw new Error(`setConversationAdReferral: ${error.message}`);
    },
```

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors. (Deno-specific `esm.sh` imports in this file are already excluded/handled by the existing tsconfig — this step only needs to confirm the new method's shape matches `IWebhookDb`.)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/whatsapp/webhook/core.ts supabase/functions/whatsapp-webhook/index.ts
git commit -m "feat(whatsapp): implement setConversationAdReferral in the whatsapp-webhook adapter"
```

---

### Task 9: WAHA webhook — apply `ad_referral` at its 3 conversation-write sites

WAHA has its own fully-isolated Edge Function (does not import `_shared/whatsapp/webhook/core.ts`), so it needs its own inline wiring — no `IWebhookDb` involved here.

**Files:**
- Modify: `supabase/functions/waha-webhook/index.ts`

- [ ] **Step 1: New-conversation insert** — in the block that creates a brand-new conversation (the `if (!existingConversation) { ... admin.from("conversations").insert({ ... }) ... }` block), add `ad_referral` to the insert object:

```ts
      const { data: createdConversation, error: convErr } = await admin
        .from("conversations")
        .insert({
          store_id: accountRow.store_id,
          customer_id: customerId,
          whatsapp_account_id: accountRow.id,
          assigned_seller_id: null,
          channel: "whatsapp",
          status: "aguardando",
          last_message_at: parsed.timestamp,
          unread_count: 0,
          ad_referral: parsed.adReferral ?? null,
        })
        .select("id")
        .single();
```

- [ ] **Step 2: Reopen-existing-conversation update** — in the `if (CLOSED_CONVERSATION_STATUSES.includes(...)) { ... admin.from("conversations").update({ ... }) ... }` block, spread `ad_referral` in ONLY when present (never clear a previous value with a message that carries none):

```ts
      await admin
        .from("conversations")
        .update({
          status: "aguardando",
          assigned_seller_id: null,
          last_message_at: parsed.timestamp,
          unread_count: ((existingConversation.unread_count as number | undefined) ?? 0) + 1,
          ...(parsed.adReferral ? { ad_referral: parsed.adReferral } : {}),
        })
        .eq("id", conversationId);
```

- [ ] **Step 3: Bump-existing-open-conversation update** — in the final `if (!didReopen && existingConversation) { ... admin.from("conversations").update({ ... }) ... }` block, same conditional spread:

```ts
  if (!didReopen && existingConversation) {
    await admin
      .from("conversations")
      .update({
        last_message_at: parsed.timestamp,
        unread_count: ((existingConversation.unread_count as number | undefined) ?? 0) + 1,
        ...(parsed.adReferral ? { ad_referral: parsed.adReferral } : {}),
      })
      .eq("id", conversationId);
  }
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/waha-webhook/index.ts
git commit -m "feat(waha): write conversations.ad_referral on ad-originated messages"
```

---

### Task 10: Domain type + Supabase provider mapping

**Files:**
- Modify: `src/shared/types/conversation.ts`
- Modify: `src/shared/types/index.ts`
- Modify: `src/providers/data/impl/supabase/conversations.ts`

**Interfaces:**
- Produces: `IAdReferral` (domain-layer, exported from `@/shared/types`) and `IConversation.adReferral?: IAdReferral` — consumed by Task 11 (badge) and Task 12 (detail row).
- Known gap (explicitly deferred, not silently dropped): the `search_conversations`/`list_conversations` RPCs (used only for text search and the "Minhas conversas" filter — every other Inbox view uses the plain table query touched here) define their own fixed `RETURNS TABLE` column list in SQL and will NOT surface `ad_referral` until those RPCs are also updated. That update is deferred to the "filtro + métrica" follow-up plan, which touches the same RPC surface anyway.

- [ ] **Step 1: Add the domain type**

In `src/shared/types/conversation.ts`, add right before `export interface IConversation {`:

```ts
/** Normalized WhatsApp ad/post referral — present only when the conversation
 *  began (or most recently resumed) via a Click-to-WhatsApp ad or a post
 *  with a WhatsApp button. Mirrors (but is deliberately NOT imported from)
 *  the provider-layer `IAdReferral` in src/providers/whatsapp/types.ts. */
export interface IAdReferral {
  sourceId?: string;
  sourceUrl?: string;
  sourceType?: string;
  headline?: string;
  body?: string;
  mediaType?: "image" | "video";
  mediaUrl?: string;
}
```

- [ ] **Step 2: Add the field to `IConversation`**

In the same file, add right after `queuedAt?: ISO8601;`:

```ts
  /** Set by the webhook when this conversation began (or most recently
   *  resumed) via a WhatsApp ad/post referral. */
  adReferral?: IAdReferral;
```

- [ ] **Step 3: Export it from the barrel**

In `src/shared/types/index.ts`, in the `export type { ... } from "./conversation";` block, add `IAdReferral,` (anywhere in the list — e.g. right after `AttendanceActivityType,`).

- [ ] **Step 4: Map it in the Supabase provider**

In `src/providers/data/impl/supabase/conversations.ts`:

1. Add `IAdReferral` to the `@/shared/types` import list at the top.
2. In `ConversationRow`, add right after `queued_at: string | null;`:

```ts
  ad_referral: Record<string, unknown> | null;
```

3. In `COLUMNS`, append `, ad_referral` at the end of the string.
4. In `rowToConversation`, add right after `queuedAt: row.queued_at ?? undefined,`:

```ts
    adReferral: (row.ad_referral as IAdReferral | null) ?? undefined,
```

- [ ] **Step 5: Type-check + full test run**

Run: `bunx tsc --noEmit && bun run test`
Expected: no new type errors; all existing tests still pass (this task only adds an optional field end-to-end, no behavior change to existing paths).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/conversation.ts src/shared/types/index.ts src/providers/data/impl/supabase/conversations.ts
git commit -m "feat(conversations): surface ad_referral through the domain type and supabase provider"
```

---

### Task 11: `AdSourceBadge` component + wire into the inbox list

**Files:**
- Create: `src/features/conversations/components/AdSourceBadge.tsx`
- Modify: `src/features/conversations/components/ConversationListItem.tsx`

**Interfaces:**
- Consumes: `IConversation.adReferral` (Task 10).
- Produces: `AdSourceBadge({ compact?, className?, headline? })` — reused as-is by Task 12.

- [ ] **Step 1: Create the badge**

```tsx
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

export interface IAdSourceBadgeProps {
  /** Compact variant renders the icon only (lists with little room). */
  compact?: boolean;
  className?: string;
  /** Ad creative headline, shown in the native tooltip when present. */
  headline?: string;
}

/**
 * "📢 Anúncio" marker for conversations that began (or most recently
 * resumed) via a WhatsApp ad/post referral (contextInfo.externalAdReplyInfo).
 * Mirrors the EcommerceBadge pattern exactly.
 */
export function AdSourceBadge({ compact = false, className, headline }: IAdSourceBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        compact ? "px-1.5" : "",
        className,
      )}
      title={headline ? `Origem: Anúncio · ${headline}` : "Origem: Anúncio"}
    >
      <Icon icon="mdi:bullhorn-outline" size={12} aria-hidden />
      {!compact && "Anúncio"}
    </Badge>
  );
}
```

- [ ] **Step 2: Wire it into the list item**

In `src/features/conversations/components/ConversationListItem.tsx`:

1. Add the import, right after the `EcommerceBadge` import:

```ts
import { AdSourceBadge } from "./AdSourceBadge";
```

2. Right after `{conversation.linkedOrderId && <EcommerceBadge compact />}` (inside the badges row), add:

```tsx
          {conversation.adReferral && (
            <AdSourceBadge compact headline={conversation.adReferral.headline} />
          )}
```

- [ ] **Step 3: Type-check + full test run**

Run: `bunx tsc --noEmit && bun run test`
Expected: no new errors; no regressions (this component has no existing test suite to extend — verified per the project's actual convention of not RTL-testing presentational list badges, e.g. `EcommerceBadge` also has none).

- [ ] **Step 4: Commit**

```bash
git add src/features/conversations/components/AdSourceBadge.tsx src/features/conversations/components/ConversationListItem.tsx
git commit -m "feat(conversations): show an ad-source badge in the conversation list"
```

---

### Task 12: Conversation detail — `AtendimentoTab` origin row

**Files:**
- Modify: `src/features/customers/components/tabs/AtendimentoTab.tsx`
- Modify: `src/features/customers/i18n/pt-BR.ts`

- [ ] **Step 1: Add the i18n label**

In `src/features/customers/i18n/pt-BR.ts`, in the `atendimento` object, add right after `origin: "Respondendo por",`:

```ts
    adSource: "Origem da conversa",
```

- [ ] **Step 2: Add the `ContextRow`**

In `src/features/customers/components/tabs/AtendimentoTab.tsx`:

1. Add the import, right after the `OriginChip` import:

```ts
import { AdSourceBadge } from "@/features/conversations/components/AdSourceBadge";
```

2. Right after the `whatsappAccount` `ContextRow` block (the one showing `COPY.origin` / `OriginChip`), add:

```tsx
          {conversation.adReferral && (
            <ContextRow label={COPY.adSource}>
              <span className="flex items-center gap-1.5">
                <AdSourceBadge />
                {conversation.adReferral.headline && (
                  <span
                    className="max-w-[160px] truncate text-muted-foreground"
                    title={conversation.adReferral.headline}
                  >
                    &quot;{conversation.adReferral.headline}&quot;
                  </span>
                )}
              </span>
            </ContextRow>
          )}
```

- [ ] **Step 3: Type-check + full test run**

Run: `bunx tsc --noEmit && bun run test`
Expected: no new errors; no regressions (same rationale as Task 11 — no existing test suite for this presentational tab to extend).

- [ ] **Step 4: Commit**

```bash
git add src/features/customers/components/tabs/AtendimentoTab.tsx src/features/customers/i18n/pt-BR.ts
git commit -m "feat(customers): show ad-source origin in the Atendimento tab"
```

---

### Task 13: Verification runbook (WAHA/Evolution v2 payload shape) + docs

Not automatable — the exact JSON shape for WAHA (Task 4) and Evolution v2 (Task 3) can only be confirmed against a REAL ad-originated message, which requires an actual ad click reaching a connected number. This task is a manual runbook, executed after this branch is merged and deployed, not part of the automated task-by-task build.

**Files:**
- Create: `docs/dev/ad-source-detection.md`

- [ ] **Step 1: Write the doc**

```markdown
# Detecção de origem por anúncio (Click-to-WhatsApp Ads)

Conversas que começaram (ou foram retomadas mais recentemente) por um
anúncio/post do WhatsApp ganham `conversations.ad_referral` (jsonb),
extraído de `contextInfo.externalAdReplyInfo` na mensagem que carregou o
referral. Badge "📢 Anúncio" na lista (`AdSourceBadge`) e no painel de
Atendimento (`AtendimentoTab`).

## Escopo e confiança por motor

- **Evolution-Go (whatsmeow):** schema confirmado via
  `docs/integracoes/evo-go/doc.json` (`ContextInfo_ExternalAdReplyInfo`).
- **Evolution v2 (Baileys) / WAHA (GOWS/whatsmeow):** casing dos campos é uma
  hipótese fundamentada (Baileys `WAProto` público / mesmo shape do
  whatsmeow), **não confirmada contra um payload real**. `extractAdReferral`
  de cada engine degrada para `undefined` em qualquer campo ausente/
  inesperado — nunca derruba o parse da mensagem.

## Runbook de verificação pós-deploy (pendente)

1. Peça para o dono clicar num anúncio/post de teste que abre o WhatsApp de
   um número conectado via Evolution v2 e/ou WAHA.
2. Confira `conversations.ad_referral` da conversa recém-criada:
   `select ad_referral from conversations where customer_id = '<id>' order by created_at desc limit 1;`
3. Se vier `null` (mensagem claramente veio de anúncio, mas não capturou):
   capture o payload bruto real (mesmo padrão já usado no projeto para
   descoberta de shape — log temporário/webhook de depuração em n8n) e
   ajuste `extractEvolutionAdReferral`/`extractWahaAdReferral` para o shape
   observado.
4. Repita para o outro motor.

## Gap conhecido

`search_conversations`/`list_conversations` (busca textual e filtro "Minhas
conversas") não retornam `ad_referral` ainda — os `RETURNS TABLE` dessas RPCs
precisam ser estendidos; fica para o follow-up "filtro + métrica de origem".
```

- [ ] **Step 2: Commit**

```bash
git add docs/dev/ad-source-detection.md
git commit -m "docs: document ad-source detection scope, confidence and verification runbook"
```

---

## Self-Review Notes

- **Spec coverage:** §1–§3 (capture) → Tasks 1–5; §4 (persistência) → Task 6; §5 (modelo de domínio) → Task 10; §6 (UI) → Tasks 11–12; §7 (filtro + métrica) → explicitly deferred to a follow-up plan (see Task 10's "known gap" note and the design spec's own scope split; building a filter/KPI on top of an unverified WAHA/Evolution-v2 extraction would be premature); §9 (riscos) → Task 13.
- **Placeholder scan:** no TBD/"add error handling"/"similar to Task N" — every step shows real code.
- **Type consistency:** `IAdReferral` (provider-layer, Task 1) and `IAdReferral` (domain-layer, Task 10) are deliberately separate, identically-shaped types — not a naming bug, an intentional layering boundary (documented inline in both places). `extractGoAdReferral`/`extractEvolutionAdReferral`/`extractWahaAdReferral` names are consistent between their definition (Tasks 2–4) and their only call sites (same tasks, `parseEvolutionGoInbound`/`parseEvolutionInbound`/`parseWahaMessageEvent`). `setConversationAdReferral` signature (`conversationId, adReferral`) matches across the interface (Task 7), the fake (Task 7), and both concrete adapters (Task 8 `whatsapp-webhook`, Task 9 `waha-webhook` — inline, not through the interface).
