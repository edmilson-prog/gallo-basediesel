# WhatsApp Media Signing Performance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make conversation media load fast for all roles by making the storage signing check O(1) per item (RLS gated-once) and signing a conversation's media in one batched request instead of N.

**Architecture:** Two complementary fixes. **Fix A (DB):** rewrite the inbound media storage policy to extract the conversation id from the object path and call `can_access_conversation` once, via a `SECURITY DEFINER` helper — eliminating the per-row full scan of `conversations` that costs non-staff ~2.4 s per `createSignedUrl`. **Fix B (frontend):** a pure ref-partitioning function + a provider `resolveMediaUrls(refs)` that signs in one `createSignedUrls` call, plus a seed hook that pre-populates the existing `["message-media-url", ref]` TanStack Query cache so the unchanged per-bubble `useResolvedMediaUrl` gets instant cache hits.

**Tech Stack:** Supabase Postgres (RLS, plpgsql, storage.objects policies), React 19, TanStack Query, Vitest, TypeScript strict, supabase-js storage.

## Global Constraints

- TypeScript `strict: true`; avoid `any`; domain interfaces prefixed `I` — verbatim from project conventions.
- Code identifiers in English (camelCase/PascalCase); user-facing copy in pt-BR with correct accents.
- Provider Pattern: features consume data only via `@/providers/data` barrel; never import `@/mocks` or `impl/*` directly outside allowed dirs.
- Migrations mirrored in `supabase/migrations/`; **no `apply_migration` to prod without the owner's explicit OK**; integration only via PR (never direct merge).
- Practical CI gate: `bun run build` + `bun run test`. Type check is `bunx tsc --noEmit` evaluated **by delta** (pre-existing baseline ~315 errors).
- Do NOT commit `vite.config.ts` (owner's local dev tweak) or untracked docs unrelated to this work.
- Signed-URL TTL constant stays `MEDIA_SIGNED_URL_TTL_SECONDS = 3600`.

---

### Task 1: Fix A — RLS gated-once migration

**Files:**
- Create: `supabase/migrations/<TS>_media_signing_gated_once.sql` (TS = `date +%Y%m%d%H%M%S`)

**Interfaces:**
- Consumes: existing `public.can_access_conversation(uuid)` (SECURITY DEFINER, STABLE), `storage.foldername(text)`.
- Produces: `public.can_read_conversation_media(text) → boolean`; replaces policy `storage_whatsapp_media_select_inbound` on `storage.objects`.

- [ ] **Step 1: Write the migration SQL**

Create the file with exactly:

```sql
-- Fix A — make inbound WhatsApp media signing O(1) per object.
--
-- The previous storage_whatsapp_media_select_inbound policy authorized a read
-- with `(foldername(name))[2] IN (SELECT c.id FROM conversations WHERE
-- store_id = current_store_id())`. That subquery is subject to the RLS of
-- `conversations` (conversations_select = can_access_conversation per row), so
-- EVERY createSignedUrl scanned all ~800 conversations evaluating can_access
-- per row. Measured: ~2375 ms for a non-staff seller vs ~113 ms for an owner
-- (is_staff short-circuit), per signed URL — and the app signs one URL PER
-- media item. The object path already carries the conversation id
-- (`conversations/<convId>/<msgId>/media.<ext>`), so a single can_access check
-- is enough.
--
-- This helper extracts the conversation id and checks access ONCE. The cast is
-- guarded so a malformed path returns false instead of raising inside policy
-- evaluation (same safety intent as the old text-vs-text comparison).
create or replace function public.can_read_conversation_media(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  conv_id uuid;
begin
  if (storage.foldername(object_name))[1] is distinct from 'conversations' then
    return false;
  end if;
  begin
    conv_id := (storage.foldername(object_name))[2]::uuid;
  exception when others then
    return false;
  end;
  return public.can_access_conversation(conv_id);
end;
$$;

-- Same authorized set as before ("read media iff you can access its
-- conversation"), evaluated O(1) instead of O(conversations). No widening.
drop policy if exists "storage_whatsapp_media_select_inbound" on storage.objects;
create policy "storage_whatsapp_media_select_inbound"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'whatsapp-media'
  and (storage.foldername(name))[1] = 'conversations'
  and public.can_read_conversation_media(name)
);
```

- [ ] **Step 2: Dry-run validate the helper on prod in a rolled-back transaction (no persistence)**

This proves the function compiles, returns the right boolean, and runs in ~ms
for a non-staff seller. Run via the Supabase MCP `execute_sql` (single statement
block). Replace `<ACCESSIBLE_CONV>` with a real conversation id Lucas can access
(query one first: a pool conversation in store `...001`).

```sql
begin;
-- define the helper inside the tx
create or replace function public.can_read_conversation_media(object_name text)
returns boolean language plpgsql stable security definer set search_path to '' as $$
declare conv_id uuid;
begin
  if (storage.foldername(object_name))[1] is distinct from 'conversations' then return false; end if;
  begin conv_id := (storage.foldername(object_name))[2]::uuid;
  exception when others then return false; end;
  return public.can_access_conversation(conv_id);
end $$;
-- impersonate the non-staff seller
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_metadata":{"store_id":"00000000-0000-0000-0000-000000000001","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","role":"seller_internal"}}', true);
explain analyze
  select public.can_read_conversation_media('conversations/<ACCESSIBLE_CONV>/m/media.bin');
select
  public.can_read_conversation_media('conversations/<ACCESSIBLE_CONV>/m/media.bin') as accessible,
  public.can_read_conversation_media('conversations/not-a-uuid/m/media.bin')       as malformed,
  public.can_read_conversation_media('store-1/x.jpg')                              as outbound_path;
rollback;
```

Expected: `accessible=true`, `malformed=false`, `outbound_path=false`; Execution
Time single-digit/low-double-digit ms (vs the 2375 ms full scan).

- [ ] **Step 3: Commit the migration file (do NOT apply to prod)**

```bash
git add supabase/migrations/*_media_signing_gated_once.sql
git commit -m "feat(db): media signing gated-once via can_read_conversation_media (Fix A)"
```

> Production application of this migration happens ONLY after the owner approves,
> per project rule. The file ships in the PR.

---

### Task 2: Pure media-ref planning (`whatsappMediaObjectPath` move + `partitionMediaRefs`)

**Files:**
- Modify: `src/shared/utils/mediaRef.ts` (add `whatsappMediaObjectPath`, `partitionMediaRefs`, `MediaRefPlan`)
- Modify: `src/providers/data/impl/supabase/messages.ts` (remove local `whatsappMediaObjectPath`, import from shared)
- Test: `src/shared/utils/mediaRef.test.ts` (extend)

**Interfaces:**
- Consumes: `classifyMediaRef(ref)`, `MediaRef`.
- Produces:
  - `whatsappMediaObjectPath(rawUrl: string): string | null` — pull our bucket's object path out of a sign/public/authenticated URL, else null.
  - `interface MediaRefPlan { toSign: { ref: string; objectPath: string }[]; passthrough: { ref: string; url: string }[]; unavailable: string[] }`
  - `partitionMediaRefs(refs: string[]): MediaRefPlan` — dedups refs; classifies each into sign (storage path OR our-bucket absolute), passthrough (external absolute, verbatim), or unavailable (none).

- [ ] **Step 1: Write failing tests**

Append to `src/shared/utils/mediaRef.test.ts`:

```ts
import { partitionMediaRefs, whatsappMediaObjectPath } from "./mediaRef";

describe("whatsappMediaObjectPath", () => {
  it("extracts the object path from a signed URL of our bucket", () => {
    expect(
      whatsappMediaObjectPath(
        "https://x.supabase.co/storage/v1/object/sign/whatsapp-media/conversations/c1/m1/media.ogg?token=abc",
      ),
    ).toBe("conversations/c1/m1/media.ogg");
  });
  it("returns null for an external URL", () => {
    expect(whatsappMediaObjectPath("https://picsum.photos/seed/x/600/400")).toBeNull();
  });
  it("returns null for a URL of another bucket", () => {
    expect(
      whatsappMediaObjectPath("https://x.supabase.co/storage/v1/object/public/avatars/a.png"),
    ).toBeNull();
  });
});

describe("partitionMediaRefs", () => {
  it("buckets storage paths, our-bucket absolutes (sign), external absolutes (passthrough), none", () => {
    const signedOwn =
      "https://x.supabase.co/storage/v1/object/sign/whatsapp-media/conversations/c/m/x.jpg?token=t";
    const plan = partitionMediaRefs([
      "conversations/c1/m1/media.ogg",
      signedOwn,
      "https://picsum.photos/seed/y/1/1",
      "",
      undefined as unknown as string,
    ]);
    expect(plan.toSign).toEqual([
      { ref: "conversations/c1/m1/media.ogg", objectPath: "conversations/c1/m1/media.ogg" },
      { ref: signedOwn, objectPath: "conversations/c/m/x.jpg" },
    ]);
    expect(plan.passthrough).toEqual([
      { ref: "https://picsum.photos/seed/y/1/1", url: "https://picsum.photos/seed/y/1/1" },
    ]);
    expect(plan.unavailable).toEqual([]);
  });

  it("dedups repeated refs", () => {
    const plan = partitionMediaRefs(["conversations/a/b/c.bin", "conversations/a/b/c.bin"]);
    expect(plan.toSign).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- src/shared/utils/mediaRef.test.ts`
Expected: FAIL — `partitionMediaRefs`/`whatsappMediaObjectPath` not exported.

- [ ] **Step 3: Implement in `mediaRef.ts`**

Append to `src/shared/utils/mediaRef.ts`:

```ts
const MEDIA_BUCKET = "whatsapp-media";

/**
 * If a stored media ref is itself a signed/public URL of OUR `whatsapp-media`
 * bucket, pull the object path back out so it can be re-signed fresh on display.
 * Returns null for any other URL (external seed/mock assets), used verbatim.
 */
export function whatsappMediaObjectPath(rawUrl: string): string | null {
  try {
    const { pathname } = new URL(rawUrl);
    const marker = "/storage/v1/object/";
    const at = pathname.indexOf(marker);
    if (at === -1) return null;
    const [, bucket, ...rest] = pathname.slice(at + marker.length).split("/");
    if (bucket !== MEDIA_BUCKET || rest.length === 0) return null;
    const objectPath = rest.join("/");
    return objectPath ? decodeURIComponent(objectPath) : null;
  } catch {
    return null;
  }
}

export interface MediaRefPlan {
  /** Refs whose bytes live in our private bucket — sign these in one batch. */
  toSign: { ref: string; objectPath: string }[];
  /** External absolute refs (seed/mock) — usable verbatim. */
  passthrough: { ref: string; url: string }[];
  /** Empty/missing refs — resolve to null (unavailable). */
  unavailable: string[];
}

/**
 * Classify a list of media refs into a signing plan. Dedups by ref. Mirrors the
 * per-ref logic of the Supabase `resolveMediaUrl` so a whole conversation's
 * media can be resolved in one round-trip.
 */
export function partitionMediaRefs(refs: string[]): MediaRefPlan {
  const plan: MediaRefPlan = { toSign: [], passthrough: [], unavailable: [] };
  const seen = new Set<string>();
  for (const ref of refs) {
    if (ref == null || seen.has(ref)) continue;
    seen.add(ref);
    const classified = classifyMediaRef(ref);
    if (classified.kind === "none") {
      plan.unavailable.push(ref);
      continue;
    }
    const objectPath =
      classified.kind === "storage" ? classified.path : whatsappMediaObjectPath(classified.url);
    if (objectPath) {
      plan.toSign.push({ ref, objectPath });
    } else {
      // external absolute — verbatim
      plan.passthrough.push({ ref, url: (classified as { url: string }).url });
    }
  }
  return plan;
}
```

- [ ] **Step 4: Refactor supabase `messages.ts` to import the moved helper**

In `src/providers/data/impl/supabase/messages.ts`:
- Delete the local `function whatsappMediaObjectPath(...) {...}` (lines ~26-40).
- Update the import on line 9:

```ts
import { classifyMediaRef, whatsappMediaObjectPath } from "@/shared/utils/mediaRef";
```

(The singular `resolveMediaUrl` keeps calling `whatsappMediaObjectPath(...)` —
identical behavior, now from shared.)

- [ ] **Step 5: Run tests + build**

Run: `bun run test -- src/shared/utils/mediaRef.test.ts`
Expected: PASS.
Run: `bun run build`
Expected: success (no broken import).

- [ ] **Step 6: Commit**

```bash
git add src/shared/utils/mediaRef.ts src/shared/utils/mediaRef.test.ts src/providers/data/impl/supabase/messages.ts
git commit -m "refactor(media): pure partitionMediaRefs + share whatsappMediaObjectPath"
```

---

### Task 3: Provider `resolveMediaUrls` (contract + mock + supabase)

**Files:**
- Modify: `src/providers/data/contracts/messages.ts` (add method to `IMessagesProvider`)
- Modify: `src/providers/data/impl/mock/messages.ts` (implement)
- Modify: `src/providers/data/impl/supabase/messages.ts` (implement)
- Test: `src/providers/data/impl/mock/messages.test.ts` (create)

**Interfaces:**
- Consumes: `partitionMediaRefs`, `MediaRefPlan` (Task 2); `createSignedUrls` (supabase storage), `MEDIA_BUCKET`, `MEDIA_SIGNED_URL_TTL_SECONDS`.
- Produces: `resolveMediaUrls(refs: string[]): Promise<Record<string, string | null>>` on `IMessagesProvider` — maps each input ref to its resolved URL (or null). Keys are the original refs (same key `useResolvedMediaUrl` uses).

- [ ] **Step 1: Add to the contract**

In `src/providers/data/contracts/messages.ts`, inside `IMessagesProvider`, right
after `resolveMediaUrl(...)`:

```ts
  /**
   * Batch variant of {@link resolveMediaUrl}: resolve many refs in one go so a
   * conversation's media signs in a single round-trip instead of N. Returns a
   * map keyed by the ORIGINAL ref (the value passed in), so callers can seed the
   * per-item `useResolvedMediaUrl` cache directly. Refs absent from the map were
   * not requested; a present `null` means unavailable.
   */
  resolveMediaUrls(refs: string[]): Promise<Record<string, string | null>>;
```

- [ ] **Step 2: Write failing test for the mock**

Create `src/providers/data/impl/mock/messages.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mockMessagesProvider } from "./messages";

describe("mockMessagesProvider.resolveMediaUrls", () => {
  it("passes through absolute refs and nulls non-navigable ones", async () => {
    const abs = "https://picsum.photos/seed/x/10/10";
    const map = await mockMessagesProvider.resolveMediaUrls([abs, "conversations/c/m/x.bin", ""]);
    expect(map[abs]).toBe(abs);
    expect(map["conversations/c/m/x.bin"]).toBeNull();
    expect(map[""]).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test -- src/providers/data/impl/mock/messages.test.ts`
Expected: FAIL — `resolveMediaUrls` is not a function.

- [ ] **Step 4: Implement in the mock**

In `src/providers/data/impl/mock/messages.ts`, add to the exported object (and
import `partitionMediaRefs`):

```ts
  resolveMediaUrls: async (refs) => {
    // Mock has no private bucket — only external absolutes are navigable.
    const plan = partitionMediaRefs(refs);
    const out: Record<string, string | null> = {};
    for (const { ref, url } of plan.passthrough) out[ref] = url;
    for (const { ref } of plan.toSign) out[ref] = null;
    for (const ref of plan.unavailable) out[ref] = null;
    return out;
  },
```

Update the import line:

```ts
import { classifyMediaRef, partitionMediaRefs } from "@/shared/utils/mediaRef";
```

- [ ] **Step 5: Run mock test to verify it passes**

Run: `bun run test -- src/providers/data/impl/mock/messages.test.ts`
Expected: PASS.

- [ ] **Step 6: Implement in the supabase provider**

In `src/providers/data/impl/supabase/messages.ts`, add after `resolveMediaUrl`
(import `partitionMediaRefs` from shared — already importing from that module):

```ts
  async resolveMediaUrls(refs: string[]): Promise<Record<string, string | null>> {
    const plan = partitionMediaRefs(refs);
    const out: Record<string, string | null> = {};
    for (const { ref, url } of plan.passthrough) out[ref] = url;
    for (const ref of plan.unavailable) out[ref] = null;
    if (plan.toSign.length === 0) return out;

    // Sign every private object in one request. Dedup object paths (two refs
    // could point at the same object) so the batch stays minimal; map results
    // back to each ref by its object path.
    const uniquePaths = Array.from(new Set(plan.toSign.map((s) => s.objectPath)));
    const { data, error } = await getSupabaseClient()
      .storage.from(MEDIA_BUCKET)
      .createSignedUrls(uniquePaths, MEDIA_SIGNED_URL_TTL_SECONDS);
    const urlByPath = new Map<string, string | null>();
    if (!error && data) {
      for (const row of data) {
        if (row.path) urlByPath.set(row.path, row.error ? null : (row.signedUrl ?? null));
      }
    }
    for (const { ref, objectPath } of plan.toSign) {
      out[ref] = urlByPath.has(objectPath) ? (urlByPath.get(objectPath) ?? null) : null;
    }
    return out;
  },
```

- [ ] **Step 7: Update the import in supabase `messages.ts`**

Line 9 becomes:

```ts
import { classifyMediaRef, partitionMediaRefs, whatsappMediaObjectPath } from "@/shared/utils/mediaRef";
```

- [ ] **Step 8: Run tests + build**

Run: `bun run test -- src/providers/data/impl/mock/messages.test.ts src/shared/utils/mediaRef.test.ts`
Expected: PASS.
Run: `bun run build`
Expected: success.

- [ ] **Step 9: Commit**

```bash
git add src/providers/data/contracts/messages.ts src/providers/data/impl/mock/messages.ts src/providers/data/impl/mock/messages.test.ts src/providers/data/impl/supabase/messages.ts
git commit -m "feat(media): resolveMediaUrls batch signing (contract + mock + supabase)"
```

---

### Task 4: `useSeedSignedMediaUrls` hook (+ pure `missingMediaRefs`)

**Files:**
- Create: `src/features/conversations/hooks/useSeedSignedMediaUrls.ts`
- Test: `src/features/conversations/hooks/missingMediaRefs.test.ts`

**Interfaces:**
- Consumes: `useMessagesProvider()`, `useQueryClient()`, `resolveMediaUrls` (Task 3). Cache key shape `["message-media-url", ref]` (must match `useResolvedMediaUrl`).
- Produces:
  - `missingMediaRefs(refs: (string | undefined)[], isCached: (ref: string) => boolean): string[]` — pure: distinct, defined, non-cached refs.
  - `useSeedSignedMediaUrls(refs: (string | undefined)[]): void` — effect that batch-resolves missing refs and seeds the cache.

- [ ] **Step 1: Write failing test for the pure selector**

Create `src/features/conversations/hooks/missingMediaRefs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { missingMediaRefs } from "./useSeedSignedMediaUrls";

describe("missingMediaRefs", () => {
  it("returns distinct defined refs that are not yet cached", () => {
    const cached = new Set(["a"]);
    const result = missingMediaRefs(
      ["a", "b", "b", undefined, "", "c"],
      (ref) => cached.has(ref),
    );
    expect(result).toEqual(["b", "c"]);
  });

  it("returns empty when everything is cached", () => {
    expect(missingMediaRefs(["a", "a"], () => true)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/features/conversations/hooks/missingMediaRefs.test.ts`
Expected: FAIL — module/function not found.

- [ ] **Step 3: Implement the hook + pure selector**

Create `src/features/conversations/hooks/useSeedSignedMediaUrls.ts`:

```ts
import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMessagesProvider } from "@/providers/data";

/** Distinct, defined, not-yet-cached refs — the set worth batch-signing. */
export function missingMediaRefs(
  refs: (string | undefined)[],
  isCached: (ref: string) => boolean,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    if (!isCached(ref)) out.push(ref);
  }
  return out;
}

/**
 * Pre-resolve a list of media refs in ONE batched request and seed the per-item
 * `["message-media-url", ref]` cache that {@link useResolvedMediaUrl} reads. The
 * bubbles stay unchanged: they get instant cache hits, and any ref not seeded
 * (e.g. a Realtime message arriving after this runs) still resolves per-item via
 * the unchanged hook. Best-effort: failures are swallowed and fall back to the
 * per-item path.
 */
export function useSeedSignedMediaUrls(refs: (string | undefined)[]): void {
  const messages = useMessagesProvider();
  const queryClient = useQueryClient();

  // Stable signature so the effect only re-runs when the ref SET changes, not on
  // every render / reorder.
  const refsKey = useMemo(
    () =>
      Array.from(new Set(refs.filter((r): r is string => Boolean(r))))
        .sort()
        .join("|"),
    [refs],
  );

  useEffect(() => {
    const missing = missingMediaRefs(
      refs,
      (ref) => queryClient.getQueryData(["message-media-url", ref]) !== undefined,
    );
    if (missing.length === 0) return;
    let cancelled = false;
    void messages
      .resolveMediaUrls(missing)
      .then((map) => {
        if (cancelled) return;
        for (const [ref, url] of Object.entries(map)) {
          queryClient.setQueryData(["message-media-url", ref], url);
        }
      })
      .catch(() => {
        /* best-effort seed — useResolvedMediaUrl falls back per item */
      });
    return () => {
      cancelled = true;
    };
    // refsKey captures the meaningful change; refs is intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refsKey, messages, queryClient]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/features/conversations/hooks/missingMediaRefs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/hooks/useSeedSignedMediaUrls.ts src/features/conversations/hooks/missingMediaRefs.test.ts
git commit -m "feat(media): useSeedSignedMediaUrls — batch seed the signed-url cache"
```

---

### Task 5: Wire seeding into the thread and the media gallery

**Files:**
- Modify: `src/features/conversations/components/MessageList.tsx`
- Modify: `src/features/conversations/hooks/useConversationMessageMedia.ts`

**Interfaces:**
- Consumes: `useSeedSignedMediaUrls` (Task 4).

- [ ] **Step 1: Seed from the thread in `MessageList`**

In `src/features/conversations/components/MessageList.tsx`:
- Add import near the other hook imports:

```ts
import { useSeedSignedMediaUrls } from "../hooks/useSeedSignedMediaUrls";
```

- After `const { messages, isLoading, hasMore, ... } = msg;` (around line 33),
  add:

```ts
  // Batch-sign all media of the loaded thread in one request and seed the
  // per-bubble cache, so images/audio/docs render without N separate signs.
  useSeedSignedMediaUrls(messages.map((m) => m.mediaUrl));
```

- [ ] **Step 2: Seed from the gallery in `useConversationMessageMedia`**

In `src/features/conversations/hooks/useConversationMessageMedia.ts`:
- Add import:

```ts
import { useSeedSignedMediaUrls } from "./useSeedSignedMediaUrls";
```

- After the `items` are derived (after the `.filter(...)` that builds `items`),
  add before the `return`:

```ts
  // Pre-sign the gallery's media in one batch (same cache the thumbs read).
  useSeedSignedMediaUrls(items.map((i) => i.mediaUrl));
```

- [ ] **Step 3: Build + full test suite**

Run: `bun run build`
Expected: success.
Run: `bun run test`
Expected: all green (existing suite + new tests).

- [ ] **Step 4: Type-check delta**

Run: `bunx tsc --noEmit` (compare against baseline; the files created on this
branch must add zero new errors — `git diff --name-status main...HEAD --diff-filter=A`).
Expected: no new errors attributable to new files.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/MessageList.tsx src/features/conversations/hooks/useConversationMessageMedia.ts
git commit -m "feat(media): seed batched signed urls in thread and media gallery"
```

---

### Task 6: Verification + PR

**Files:** none (gate + integration)

- [ ] **Step 1: Re-confirm build + tests green**

Run: `bun run build && bun run test`
Expected: both succeed.

- [ ] **Step 2: Self-review the diff**

Run: `git diff main...HEAD --stat` and read the full diff. Confirm: no
`vite.config.ts`, no unrelated untracked docs, no `any`, cache key string
`["message-media-url", ref]` identical in `useResolvedMediaUrl.ts` and
`useSeedSignedMediaUrls.ts`.

- [ ] **Step 3: Push + open PR (no merge, no prod migration)**

```bash
git push -u origin perf/whatsapp-media-signing
gh pr create --base main --title "perf(media): conversation media loads fast for all roles (RLS gated-once + batch signing)" --body "<summary + diagnosis numbers + rollout note: migration applied to prod only after owner OK>"
```

- [ ] **Step 4: Hand back to owner**

Report: PR URL, the 2375 ms → ~ms measurement, and the two pending owner
actions — (a) approve applying the Fix A migration to prod, (b) smoke test the
UI as a non-staff seller after the Vercel deploy.

---

## Self-Review

**Spec coverage:**
- Fix A (helper + policy + migration + dry-run + Git mirror, no prod apply) → Task 1. ✓
- Fix B `partitionMediaRefs` pure + tests → Task 2. ✓
- `resolveMediaUrls` contract+mock+supabase + `createSignedUrls` batch → Task 3. ✓
- Seed hook + cache-key match + best-effort fallback → Task 4. ✓
- Thread + gallery wiring (scope: both) → Task 5. ✓
- Bubbles unchanged (`useResolvedMediaUrl` untouched) → no task modifies them. ✓
- Verification gate (build/test/tsc delta/impersonated timing/smoke) → Tasks 1, 5, 6. ✓
- Mock parity → Task 3. ✓
- Branch/PR/no-prod-apply rollout → Tasks 1, 6. ✓
- DRY note (move `whatsappMediaObjectPath`) → Task 2. ✓

**Placeholder scan:** `<TS>` (migration timestamp) and `<ACCESSIBLE_CONV>` (a real conv id) are intentional fill-at-runtime values with explicit instructions, not vague TODOs. PR body `<summary>` is a writing task, content specified. No "add error handling"/"handle edge cases" placeholders.

**Type consistency:** `MediaRefPlan` fields (`toSign`/`passthrough`/`unavailable`) used identically in Tasks 2/3. `resolveMediaUrls(refs): Promise<Record<string,string|null>>` identical in contract/mock/supabase/hook. Cache key `["message-media-url", ref]` matches `useResolvedMediaUrl`. `missingMediaRefs` signature matches its test and caller.
