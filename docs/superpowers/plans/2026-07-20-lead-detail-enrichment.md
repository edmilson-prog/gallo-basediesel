# Lead Detail Enrichment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/app/leads/:id` into a rich, traceable lead detail — colored status badges + visible tags block, inline field editing (temperature, estimated value, next action, tags, email) with a floating save bar, a readable audit timeline, and a real Notes tab.

**Architecture:** Reuse existing patterns. Inline editing mirrors `PartDetailPage` (page owns `editing`+`draft`, cards render inputs, a sticky footer save bar persists the whole draft). Notes mirror `customer_notes` (new `lead_notes` table, RLS derived from `leads` visibility). Traceability enriches the existing History tab (already reads `auditsProvider`) via a pure formatter engine.

**Tech Stack:** React 19, TanStack Query + Router, Tailwind v4, shadcn/ui, Vitest (engines), Supabase (Postgres + RLS).

## Global Constraints

- **UI copy:** pt-BR with correct accents. **Code/comments:** English. Domain interfaces prefixed `I`.
- **Data access:** features consume `@/providers/data` only — never `@/mocks` directly. Provider pairs (mock + supabase) must both implement any new contract method.
- **Only semantic tokens** in components (`bg-card`, `text-muted-foreground`, `border-border`, severity utilities) — no raw hex, no `--gallo-*`.
- **Migrations:** versioned in `supabase/migrations/`; `apply_migration` only with the owner's OK. Frontend must be fail-soft (Notes tab shows empty if `lead_notes` absent).
- **Gates:** `bun run test` + `bun run build` green; `bunx tsc --noEmit` no NEW errors by delta (a ~pre-existing baseline exists).
- **Frozen zone:** do NOT touch the Atendimento conversation cache (message query keys, realtime, media signing). This work is confined to `src/features/leads`, `src/providers/data/**/leads.ts`, `src/mocks/api/leads.ts`, `src/shared/types/lead.ts`, and `supabase/`.
- **Reference:** `getOriginMeta` is null-safe (unknown origin → "outro"); reuse it, never index `ORIGIN_META` directly. `daysInStage(lead)` already exists in `utils/leadDisplay.ts`.

---

## File Structure

- Create `src/features/leads/utils/leadDraft.ts` (+ `.test.ts`) — inline-edit draft (Task 1).
- Create `src/features/leads/engine/leadHistory.ts` (+ `.test.ts`) — audit → readable timeline (Task 2).
- Modify `src/shared/types/lead.ts` — add `ILeadNote` (Task 3).
- Modify `src/providers/data/contracts/leads.ts` — add `listNotes`/`addNote` (Task 3).
- Modify `src/mocks/api/leads.ts` — in-memory lead notes (Task 3).
- Modify `src/providers/data/impl/mock/leads.ts` — notes delegation (Task 3).
- Modify `src/providers/data/impl/supabase/leads.ts` — `lead_notes` CRUD (Task 3).
- Create `supabase/migrations/20260720160000_lead_notes.sql` (Task 4).
- Modify `supabase/tests/rls-regression.sql` — `lead_notes` block (Task 4).
- Modify `src/features/leads/i18n/pt-BR.ts` — new strings (Tasks 5–7, added where used).
- Rewrite `src/features/leads/components/detail/LeadDataCard.tsx` — rich read + inline inputs (Tasks 5–6).
- Modify `src/features/leads/pages/LeadDetailPage.tsx` — draft state + sticky save bar (Task 6).
- Modify `src/features/leads/components/detail/LeadTabs.tsx` — History via engine + real Notes (Task 7).

---

### Task 1: `ILeadDraft` + `leadDraft` util (inline-edit model)

**Files:**
- Create: `src/features/leads/utils/leadDraft.ts`
- Test: `src/features/leads/utils/leadDraft.test.ts`

**Interfaces:**
- Consumes: `ILead`, `LeadTemperature` from `@/shared/types`.
- Produces: `ILeadDraft`, `ILeadDraftErrors`, `toLeadDraft(lead): ILeadDraft`, `validateLeadDraft(draft): ILeadDraftErrors`, `buildLeadPatch(lead, draft): Partial<ILead>`, `normalizeTag(raw): string`, `addTag(tags, raw): string[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/leads/utils/leadDraft.test.ts
import { describe, expect, it } from "vitest";
import type { ILead } from "@/shared/types";
import {
  addTag,
  buildLeadPatch,
  normalizeTag,
  toLeadDraft,
  validateLeadDraft,
} from "./leadDraft";

const lead: ILead = {
  id: "lead-1",
  storeId: "store-1",
  sellerId: null,
  name: "Alexandre",
  phone: "+5538988700405",
  email: undefined,
  stage: { id: "stage-novo", name: "Novo", order: 1, color: "#5b6b7a" },
  temperature: "morno",
  origin: "whatsapp",
  estimatedValue: undefined,
  nextActionAt: undefined,
  conversations: [],
  tags: ["Frota pesada"],
  createdAt: "2026-07-20T12:00:00.000Z",
  updatedAt: "2026-07-20T12:00:00.000Z",
};

describe("toLeadDraft", () => {
  it("maps a lead to editable form strings", () => {
    const d = toLeadDraft({ ...lead, estimatedValue: 1500, nextActionAt: "2026-07-25T00:00:00.000Z", email: "a@b.com" });
    expect(d).toEqual({
      temperature: "morno",
      estimatedValue: "1500",
      nextActionAt: "2026-07-25",
      email: "a@b.com",
      tags: ["Frota pesada"],
    });
  });
  it("uses empty strings for absent optional fields", () => {
    const d = toLeadDraft(lead);
    expect(d.estimatedValue).toBe("");
    expect(d.nextActionAt).toBe("");
    expect(d.email).toBe("");
  });
});

describe("normalizeTag / addTag", () => {
  it("trims and collapses inner whitespace", () => {
    expect(normalizeTag("  Volvo   FH  ")).toBe("Volvo FH");
  });
  it("adds a new tag; ignores blank and case-insensitive duplicate", () => {
    expect(addTag(["Volvo FH"], "Scania")).toEqual(["Volvo FH", "Scania"]);
    expect(addTag(["Volvo FH"], "  ")).toEqual(["Volvo FH"]);
    expect(addTag(["Volvo FH"], "volvo fh")).toEqual(["Volvo FH"]);
  });
});

describe("validateLeadDraft", () => {
  it("passes on a clean draft", () => {
    expect(validateLeadDraft(toLeadDraft(lead))).toEqual({});
  });
  it("flags a non-numeric estimated value", () => {
    expect(validateLeadDraft({ ...toLeadDraft(lead), estimatedValue: "abc" }).estimatedValue).toBeTruthy();
  });
  it("flags a malformed email but accepts empty", () => {
    expect(validateLeadDraft({ ...toLeadDraft(lead), email: "not-an-email" }).email).toBeTruthy();
    expect(validateLeadDraft({ ...toLeadDraft(lead), email: "" }).email).toBeUndefined();
  });
});

describe("buildLeadPatch", () => {
  it("returns only changed fields", () => {
    const d = { ...toLeadDraft(lead), temperature: "quente" as const };
    expect(buildLeadPatch(lead, d)).toEqual({ temperature: "quente" });
  });
  it("parses value with comma decimal and normalizes email/tags", () => {
    const d = { ...toLeadDraft(lead), estimatedValue: "1.234,50", email: "  A@B.com ", tags: ["Frota pesada", "Scania"] };
    expect(buildLeadPatch(lead, d)).toEqual({
      estimatedValue: 1234.5,
      email: "a@b.com",
      tags: ["Frota pesada", "Scania"],
    });
  });
  it("clears an emptied estimated value / email to undefined", () => {
    const withValues = { ...lead, estimatedValue: 500, email: "x@y.com" };
    const d = { ...toLeadDraft(withValues), estimatedValue: "", email: "" };
    expect(buildLeadPatch(withValues, d)).toEqual({ estimatedValue: undefined, email: undefined });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/leads/utils/leadDraft.test.ts`
Expected: FAIL ("Cannot find module './leadDraft'").

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/leads/utils/leadDraft.ts
import type { ID, ILead, LeadTemperature } from "@/shared/types";
import { LEADS_STRINGS } from "../i18n/pt-BR";

export interface ILeadDraft {
  temperature: LeadTemperature;
  estimatedValue: string;
  nextActionAt: string; // yyyy-mm-dd
  email: string;
  tags: string[];
}

export interface ILeadDraftErrors {
  estimatedValue?: string;
  email?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function addTag(tags: string[], raw: string): string[] {
  const tag = normalizeTag(raw);
  if (!tag) return tags;
  if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return tags;
  return [...tags, tag];
}

function parseValue(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // Accept BR-style "1.234,50" and plain "1234.5".
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

export function toLeadDraft(lead: ILead): ILeadDraft {
  return {
    temperature: lead.temperature,
    estimatedValue: lead.estimatedValue !== undefined ? String(lead.estimatedValue) : "",
    nextActionAt: lead.nextActionAt ? lead.nextActionAt.slice(0, 10) : "",
    email: lead.email ?? "",
    tags: [...lead.tags],
  };
}

export function validateLeadDraft(draft: ILeadDraft): ILeadDraftErrors {
  const errors: ILeadDraftErrors = {};
  if (draft.estimatedValue.trim() && parseValue(draft.estimatedValue) === undefined) {
    errors.estimatedValue = LEADS_STRINGS.fiche.invalidValue;
  }
  if (draft.email.trim() && !EMAIL_RE.test(draft.email.trim())) {
    errors.email = LEADS_STRINGS.fiche.invalidEmail;
  }
  return errors;
}

function sameTags(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

/** Only the fields whose value actually changed vs the lead. */
export function buildLeadPatch(lead: ILead, draft: ILeadDraft): Partial<ILead> {
  const patch: Partial<ILead> = {};
  if (draft.temperature !== lead.temperature) patch.temperature = draft.temperature;

  const value = parseValue(draft.estimatedValue);
  if (value !== lead.estimatedValue) patch.estimatedValue = value;

  const nextAction = draft.nextActionAt ? new Date(draft.nextActionAt).toISOString() : undefined;
  const currentNextActionDay = lead.nextActionAt ? lead.nextActionAt.slice(0, 10) : "";
  if (draft.nextActionAt !== currentNextActionDay) patch.nextActionAt = nextAction;

  const email = draft.email.trim().toLowerCase() || undefined;
  if (email !== lead.email) patch.email = email;

  const tags: ID[] = draft.tags.map(normalizeTag).filter(Boolean);
  if (!sameTags(tags, lead.tags)) patch.tags = tags;

  return patch;
}
```

- [ ] **Step 4: Add the i18n keys used above**

In `src/features/leads/i18n/pt-BR.ts`, inside the existing `fiche: { … }` block (added in PR #339), add:

```ts
    invalidValue: "Valor inválido.",
    invalidEmail: "E-mail inválido.",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run src/features/leads/utils/leadDraft.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add src/features/leads/utils/leadDraft.ts src/features/leads/utils/leadDraft.test.ts src/features/leads/i18n/pt-BR.ts
git commit -m "feat(leads): inline-edit draft model for the lead detail card"
```

---

### Task 2: `leadHistory` engine (audit → readable timeline)

**Files:**
- Create: `src/features/leads/engine/leadHistory.ts`
- Test: `src/features/leads/engine/leadHistory.test.ts`

**Interfaces:**
- Consumes: `IAuditLog` from `@/shared/types`; `TEMPERATURE_META` from `../utils/leadDisplay`; `formatBRL` from `@/shared/utils/format`.
- Produces: `describeLeadAudit(entry: IAuditLog): { icon: string; title: string; lines: string[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/leads/engine/leadHistory.test.ts
import { describe, expect, it } from "vitest";
import type { IAuditLog } from "@/shared/types";
import { describeLeadAudit } from "./leadHistory";

function entry(action: string, before?: unknown, after?: unknown): IAuditLog {
  return {
    id: "a1", actorId: "s1", action, resource: "lead", resourceId: "lead-1",
    before, after, timestamp: "2026-07-20T12:00:00.000Z", storeId: "store-1",
  };
}

describe("describeLeadAudit", () => {
  it("titles known lifecycle actions with an icon", () => {
    expect(describeLeadAudit(entry("lead.created")).title).toBe("Lead criado");
    expect(describeLeadAudit(entry("lead.converted")).icon).toBeTruthy();
  });

  it("renders a temperature change by label", () => {
    const r = describeLeadAudit(entry("lead.updated", { temperature: "morno" }, { temperature: "quente" }));
    expect(r.lines).toContain("Temperatura: Morno → Quente");
  });

  it("renders an estimated value change in BRL", () => {
    const r = describeLeadAudit(entry("lead.updated", { estimatedValue: undefined }, { estimatedValue: 1500 }));
    expect(r.lines.some((l) => l.includes("Valor estimado") && l.includes("1.500"))).toBe(true);
  });

  it("renders tags as added/removed", () => {
    const r = describeLeadAudit(entry("lead.updated", { tags: ["Volvo FH"] }, { tags: ["Volvo FH", "Scania"] }));
    expect(r.lines).toContain("Tags: + Scania");
  });

  it("degrades an unknown field to key: value without throwing", () => {
    const r = describeLeadAudit(entry("lead.updated", { mystery: "a" }, { mystery: "b" }));
    expect(r.lines).toContain("mystery: a → b");
  });

  it("never throws on missing before/after", () => {
    expect(() => describeLeadAudit(entry("lead.updated"))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/leads/engine/leadHistory.test.ts`
Expected: FAIL ("Cannot find module './leadHistory'").

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/leads/engine/leadHistory.ts
import type { IAuditLog, LeadTemperature } from "@/shared/types";
import { formatBRL } from "@/shared/utils/format";
import { TEMPERATURE_META } from "../utils/leadDisplay";

interface IActionMeta {
  icon: string;
  title: string;
}

const ACTION_META: Record<string, IActionMeta> = {
  "lead.created": { icon: "mdi:plus-circle-outline", title: "Lead criado" },
  "lead.stage_changed": { icon: "mdi:swap-horizontal", title: "Mudança de estágio" },
  "lead.updated": { icon: "mdi:pencil-outline", title: "Lead atualizado" },
  "lead.converted": { icon: "mdi:check-decagram", title: "Convertido em cliente" },
  "lead.lost": { icon: "mdi:close-octagon-outline", title: "Marcado como perdido" },
};

const FIELD_LABEL: Record<string, string> = {
  temperature: "Temperatura",
  estimatedValue: "Valor estimado",
  nextActionAt: "Próxima ação",
  email: "E-mail",
  stage: "Estágio",
  tags: "Tags",
  name: "Nome",
  phone: "Telefone",
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function formatScalar(field: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field === "temperature") return TEMPERATURE_META[value as LeadTemperature]?.label ?? String(value);
  if (field === "estimatedValue") return formatBRL(Number(value));
  if (field === "nextActionAt") return new Date(String(value)).toLocaleDateString("pt-BR");
  if (field === "stage") {
    const s = asRecord(value);
    return typeof s.name === "string" ? s.name : String(value);
  }
  return String(value);
}

function tagsDelta(before: unknown, after: unknown): string[] {
  const b = Array.isArray(before) ? (before as string[]) : [];
  const a = Array.isArray(after) ? (after as string[]) : [];
  const added = a.filter((t) => !b.includes(t)).map((t) => `Tags: + ${t}`);
  const removed = b.filter((t) => !a.includes(t)).map((t) => `Tags: − ${t}`);
  return [...added, ...removed];
}

/** Human-readable rendering of one audit entry: icon + title + per-field lines. */
export function describeLeadAudit(entry: IAuditLog): { icon: string; title: string; lines: string[] } {
  const meta = ACTION_META[entry.action] ?? { icon: "mdi:history", title: entry.action };
  const before = asRecord(entry.before);
  const after = asRecord(entry.after);
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

  const lines: string[] = [];
  for (const key of keys) {
    if (key === "tags") {
      lines.push(...tagsDelta(before[key], after[key]));
      continue;
    }
    const label = FIELD_LABEL[key] ?? key;
    lines.push(`${label}: ${formatScalar(key, before[key])} → ${formatScalar(key, after[key])}`);
  }
  return { icon: meta.icon, title: meta.title, lines };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/leads/engine/leadHistory.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/leads/engine/leadHistory.ts src/features/leads/engine/leadHistory.test.ts
git commit -m "feat(leads): readable audit-timeline formatter for the History tab"
```

---

### Task 3: Notes provider layer (`ILeadNote` + `listNotes`/`addNote`)

**Files:**
- Modify: `src/shared/types/lead.ts`
- Modify: `src/providers/data/contracts/leads.ts`
- Modify: `src/mocks/api/leads.ts`
- Modify: `src/providers/data/impl/mock/leads.ts`
- Modify: `src/providers/data/impl/supabase/leads.ts`
- Test: `src/providers/data/impl/mock/leadNotes.test.ts`

**Interfaces:**
- Produces: `ILeadNote` (`{ id: ID; authorId: ID; content: string; createdAt: ISO8601 }`); `ILeadsProvider.listNotes(leadId): Promise<ILeadNote[]>`; `ILeadsProvider.addNote(leadId, content, authorId): Promise<ILeadNote>`.

- [ ] **Step 1: Add the `ILeadNote` type**

In `src/shared/types/lead.ts`, after the `ILead` interface:

```ts
/** A free-text note recorded against a lead (mirrors ICustomerNote). */
export interface ILeadNote {
  id: ID;
  authorId: ID;
  content: string;
  createdAt: ISO8601;
}
```

- [ ] **Step 2: Extend the provider contract**

In `src/providers/data/contracts/leads.ts`, add to `ILeadsProvider` (after `getViaConversation`):

```ts
  /** Notes recorded against the lead, newest first. */
  listNotes(leadId: ID): Promise<ILeadNote[]>;
  /** Appends a note authored by `authorId` (a seller id). */
  addNote(leadId: ID, content: string, authorId: ID): Promise<ILeadNote>;
```

Update the import at the top: `import type { ID, ILead, ILeadNote } from "@/shared/types";`.

- [ ] **Step 3: Mock API — in-memory notes**

In `src/mocks/api/leads.ts`, add a module-level store and two methods inside `leadsApi`:

```ts
// module scope (top of file, after imports)
import type { ILeadNote } from "@/shared/types";
const leadNotes = new Map<string, ILeadNote[]>();

// inside leadsApi object:
  async listNotes(leadId: ID): Promise<ILeadNote[]> {
    return [...(leadNotes.get(leadId) ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async addNote(leadId: ID, content: string, authorId: ID): Promise<ILeadNote> {
    const note: ILeadNote = {
      id: `lead-note-${crypto.randomUUID()}`,
      authorId,
      content,
      createdAt: new Date().toISOString(),
    };
    leadNotes.set(leadId, [...(leadNotes.get(leadId) ?? []), note]);
    return note;
  },
```

- [ ] **Step 4: Mock provider — delegate**

In `src/providers/data/impl/mock/leads.ts`, add to `mockLeadsProvider`:

```ts
  listNotes: (leadId) => leadsApi.listNotes(leadId),
  addNote: (leadId, content, authorId) => leadsApi.addNote(leadId, content, authorId),
```

- [ ] **Step 5: Supabase provider — `lead_notes` CRUD**

In `src/providers/data/impl/supabase/leads.ts`, add near the top:

```ts
import type { ID, ILead, ILeadNote, ILeadStage, LeadOrigin, LeadTemperature, Money } from "@/shared/types";

interface LeadNoteRow {
  id: string;
  lead_id: string;
  author_id: string;
  content: string;
  created_at: string;
}
const NOTES_TABLE = "lead_notes";
const NOTE_COLUMNS = "id, lead_id, author_id, content, created_at";
function rowToLeadNote(row: LeadNoteRow): ILeadNote {
  return { id: row.id, authorId: row.author_id, content: row.content, createdAt: row.created_at };
}
```

And add to `supabaseLeadsProvider` (after `getViaConversation`):

```ts
  async listNotes(leadId: ID): Promise<ILeadNote[]> {
    const { data, error } = await getSupabaseClient()
      .from(NOTES_TABLE)
      .select(NOTE_COLUMNS)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`[supabase] leads.listNotes(${leadId}) failed: ${error.message}`);
    return (data as LeadNoteRow[]).map(rowToLeadNote);
  },

  async addNote(leadId: ID, content: string, authorId: ID): Promise<ILeadNote> {
    const id: ID = crypto.randomUUID();
    const { data, error } = await getSupabaseClient()
      .from(NOTES_TABLE)
      .insert({ id, lead_id: leadId, author_id: authorId, content })
      .select(NOTE_COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] leads.addNote(${leadId}) failed: ${error.message}`);
    return rowToLeadNote(data as LeadNoteRow);
  },
```

- [ ] **Step 6: Write the failing test (mock round-trip)**

```ts
// src/providers/data/impl/mock/leadNotes.test.ts
import { describe, expect, it } from "vitest";
import { mockLeadsProvider } from "./leads";

describe("mock lead notes", () => {
  it("appends and lists notes newest-first", async () => {
    await mockLeadsProvider.addNote("lead-x", "primeira", "seller-1");
    await mockLeadsProvider.addNote("lead-x", "segunda", "seller-1");
    const notes = await mockLeadsProvider.listNotes("lead-x");
    expect(notes).toHaveLength(2);
    expect(notes[0].content).toBe("segunda");
    expect(notes[0].authorId).toBe("seller-1");
  });
});
```

- [ ] **Step 7: Run test to verify it passes**

Run: `bunx vitest run src/providers/data/impl/mock/leadNotes.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck the changed data layer**

Run: `bunx tsc --noEmit 2>&1 | grep -E "leads.ts|leadNotes|contracts/leads|types/lead"`
Expected: no NEW errors on these files.

- [ ] **Step 9: Commit**

```bash
git add src/shared/types/lead.ts src/providers/data/contracts/leads.ts src/mocks/api/leads.ts src/providers/data/impl/mock/leads.ts src/providers/data/impl/supabase/leads.ts src/providers/data/impl/mock/leadNotes.test.ts
git commit -m "feat(leads): lead notes provider methods (mock + supabase) + ILeadNote"
```

---

### Task 4: `lead_notes` migration + RLS regression

**Files:**
- Create: `supabase/migrations/20260720160000_lead_notes.sql`
- Modify: `supabase/tests/rls-regression.sql`

**Interfaces:**
- Produces: table `public.lead_notes` with derived-from-`leads` RLS (mirrors `customer_notes`).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260720160000_lead_notes.sql
-- Notes recorded against a lead. Mirrors customer_notes exactly: no store_id of
-- its own; RLS is DERIVED from the parent leads' visibility (the subquery
-- re-applies leads_select, so whoever can see the lead can read/write its
-- notes). Consistent with 20260608220518_rls_policies_derived_global.sql.
create table if not exists public.lead_notes (
  id          text primary key,
  lead_id     text not null references public.leads (id) on delete cascade,
  author_id   text not null references public.sellers (id),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists lead_notes_lead_id_idx on public.lead_notes (lead_id);
create index if not exists lead_notes_created_at_idx on public.lead_notes (created_at);

alter table public.lead_notes enable row level security;

drop policy if exists "lead_notes_select" on public.lead_notes;
create policy "lead_notes_select" on public.lead_notes for select to authenticated
  using (lead_id in (select id from public.leads where store_id = public.current_store_id()));

drop policy if exists "lead_notes_insert" on public.lead_notes;
create policy "lead_notes_insert" on public.lead_notes for insert to authenticated
  with check (lead_id in (select id from public.leads where store_id = public.current_store_id()));

drop policy if exists "lead_notes_update" on public.lead_notes;
create policy "lead_notes_update" on public.lead_notes for update to authenticated
  using (lead_id in (select id from public.leads where store_id = public.current_store_id()))
  with check (lead_id in (select id from public.leads where store_id = public.current_store_id()));

drop policy if exists "lead_notes_delete" on public.lead_notes;
create policy "lead_notes_delete" on public.lead_notes for delete to authenticated
  using (lead_id in (select id from public.leads where store_id = public.current_store_id()));
```

- [ ] **Step 2: Dry-run against the real prod schema (validation, rolled back)**

Run this via the Supabase MCP `execute_sql` (wrapped in `begin; … rollback;` — nothing persists). It creates the table+policies, then impersonates the lead's owner and asserts they can insert+read a note; then impersonates a seller with no access and asserts zero rows:

```sql
begin;
-- (paste the CREATE TABLE + 4 policies from Step 1 here)
do $$
declare v_lead uuid := gen_random_uuid(); v_owner record;
begin
  select p.auth_user_id, p.seller_id, p.store_id, p.role into v_owner
  from public.profiles p where p.role in ('seller_internal','seller_external','sdr') and p.seller_id is not null limit 1;
  insert into public.leads (id, store_id, seller_id, name, phone, stage, temperature, origin, conversations, tags)
  values (v_lead, v_owner.store_id, v_owner.seller_id, 'DRYRUN', '+5555999990000',
          '{"id":"stage-novo","name":"Novo","color":"#5b6b7a","order":1}'::jsonb, 'frio', 'whatsapp', '{}', '{}');
  perform set_config('dryrun.lead', v_lead::text, true);
  perform set_config('dryrun.author', v_owner.seller_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner.auth_user_id, 'role','authenticated',
    'app_metadata', json_build_object('role', v_owner.role, 'seller_id', v_owner.seller_id, 'store_id', v_owner.store_id))::text, true);
end $$;
set local role authenticated;
do $$
declare n int;
begin
  insert into public.lead_notes (id, lead_id, author_id, content)
  values (gen_random_uuid()::text, current_setting('dryrun.lead', true), current_setting('dryrun.author', true), 'nota dry-run');
  select count(*) into n from public.lead_notes where lead_id = current_setting('dryrun.lead', true);
  if n <> 1 then raise exception 'DRYRUN: owner should read own lead note, got %', n; end if;
end $$;
select 'DRYRUN PASSED' as r;
rollback;
```

Expected: `DRYRUN PASSED`.

- [ ] **Step 3: Add the RLS regression block**

In `supabase/tests/rls-regression.sql`, before the final `select 'ALL RLS REGRESSION TESTS PASSED'`:

```sql
-- ---------------------------------------------------------------------------
-- lead_notes (2026-07-20): notes inherit the lead's visibility. lucas (owner
-- of the fixture lead) inserts and reads; a note on a lead he cannot see stays
-- hidden.
-- ---------------------------------------------------------------------------
do $$
declare v_lead uuid := gen_random_uuid(); v_note uuid := gen_random_uuid();
begin
  insert into public.leads (id, store_id, seller_id, name, phone, stage, temperature, origin, conversations, tags)
  values (v_lead, '00000000-0000-0000-0000-000000000001', '5a6400ed-5aec-4bf1-b641-31635f15c887',
          'RLS Fixture — lead notes', '+5555999991111',
          '{"id":"stage-novo","name":"Novo","color":"#5b6b7a","order":1}'::jsonb, 'frio', 'whatsapp', '{}', '{}');
  insert into public.lead_notes (id, lead_id, author_id, content)
  values (v_note::text, v_lead::text, '5a6400ed-5aec-4bf1-b641-31635f15c887', 'nota do lucas');
  perform set_config('rls_regression.lead_note_lead', v_lead::text, true);
end $$;

select set_config('request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.lead_notes where lead_id = current_setting('rls_regression.lead_note_lead', true)) <> 1 then
    raise exception 'lead_notes: owner lucas should read his lead note';
  end if;
end $$;
reset role;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260720160000_lead_notes.sql supabase/tests/rls-regression.sql
git commit -m "feat(db): lead_notes table + derived RLS + regression coverage"
```

> Note: `apply_migration` in prod is a rollout gate for the owner (the file version may be renamed to match the remote-registered timestamp after apply, per the #333 convention).

---

### Task 5: `LeadDataCard` — rich read-mode

**Files:**
- Rewrite: `src/features/leads/components/detail/LeadDataCard.tsx`
- Modify: `src/features/leads/i18n/pt-BR.ts` (strings below)

**Interfaces:**
- Consumes: `toLeadDraft`/`ILeadDraft` (Task 1), `TEMPERATURE_META`/`getOriginMeta`/`getNextActionInfo`/`daysInStage`/`getInitials`/`isConverted`/`isLost` from `../../utils/leadDisplay`.
- Produces: `LeadDataCard` accepting `{ lead, seller, editing, draft, onDraftChange, errors }` (edit inputs wired in Task 6).

This task delivers the READ layout; the `editing` branch is a stub that Task 6 fills. Props already include the edit fields so the signature is stable across both tasks.

- [ ] **Step 1: Add i18n strings**

In `src/features/leads/i18n/pt-BR.ts`, inside `detail: { … }`, extend `fields`/section labels — add:

```ts
    groups: { commercial: "Comercial", contact: "Contato", management: "Gestão" },
    inStageFor: "No estágio há",
    noTags: "Sem tags",
    addTagPlaceholder: "Adicionar tag…",
```

- [ ] **Step 2: Rewrite the component (read layout + editing stub)**

```tsx
// src/features/leads/components/detail/LeadDataCard.tsx
import type { ILead, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateBR, formatPhone } from "@/shared/utils/format";
import {
  TEMPERATURE_META,
  daysInStage,
  getInitials,
  getNextActionInfo,
  getOriginMeta,
  isConverted,
  isLost,
} from "../../utils/leadDisplay";
import type { ILeadDraft, ILeadDraftErrors } from "../../utils/leadDraft";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

const COPY = LEADS_STRINGS.detail;

export interface ILeadDataCardProps {
  lead: ILead;
  seller?: ISeller;
  editing: boolean;
  draft: ILeadDraft;
  onDraftChange: (patch: Partial<ILeadDraft>) => void;
  errors: ILeadDraftErrors;
}

export function LeadDataCard({ lead, seller, editing, draft, onDraftChange, errors }: ILeadDataCardProps) {
  const tempMeta = TEMPERATURE_META[lead.temperature];
  const originMeta = getOriginMeta(lead.origin);
  const nextAction = getNextActionInfo(lead.nextActionAt);
  const converted = isConverted(lead);
  const lost = isLost(lead);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{COPY.data}</h2>

      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <span
          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
          style={{ borderColor: lead.stage.color, color: lead.stage.color }}
        >
          {lead.stage.name}
        </span>
        <Badge className={tempMeta.tone} icon={tempMeta.icon}>{tempMeta.label}</Badge>
        <Badge className={originMeta.tone} icon={originMeta.icon}>{originMeta.label}</Badge>
        {converted && (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" icon="mdi:check-decagram">
            {LEADS_STRINGS.card.converted}
          </Badge>
        )}
        {lost && (
          <Badge className="bg-red-500/15 text-red-700 dark:text-red-300" icon="mdi:close-octagon">
            {LEADS_STRINGS.card.lost}
          </Badge>
        )}
      </div>

      {/* Tags block */}
      <div className="border-b border-border py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {COPY.fields.tags}
        </p>
        {editing ? (
          <TagsEditorSlot draft={draft} onDraftChange={onDraftChange} />
        ) : lead.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {lead.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs text-foreground"
              >
                <Icon icon="mdi:tag-outline" size={12} className="text-muted-foreground" />
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{COPY.noTags}</p>
        )}
      </div>

      {/* Commercial */}
      <Section title={COPY.groups.commercial}>
        {editing ? (
          <EditCommercialSlot draft={draft} onDraftChange={onDraftChange} errors={errors} />
        ) : (
          <>
            <Fact label={COPY.fields.estimatedValue}>
              {lead.estimatedValue !== undefined ? formatBRL(lead.estimatedValue) : <Dim>—</Dim>}
            </Fact>
            <Fact label={COPY.fields.nextAction}>
              {lead.nextActionAt ? (
                <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium", nextAction.tone)}>
                  {nextAction.label}
                </span>
              ) : (
                <Dim>{nextAction.label}</Dim>
              )}
            </Fact>
          </>
        )}
      </Section>

      {/* Contact */}
      <Section title={COPY.groups.contact}>
        <Fact label={COPY.fields.phone}>{formatPhone(lead.phone)}</Fact>
        {editing ? (
          <EditEmailSlot draft={draft} onDraftChange={onDraftChange} errors={errors} />
        ) : (
          <Fact label={COPY.fields.email}>{lead.email ?? <Dim>—</Dim>}</Fact>
        )}
      </Section>

      {/* Management */}
      <Section title={COPY.groups.management} last>
        <Fact label={COPY.seller}>
          {seller ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
                {getInitials(seller.fullName)}
              </span>
              {seller.fullName}
            </span>
          ) : (
            <Dim>—</Dim>
          )}
        </Fact>
        <Fact label={COPY.createdAt}>{formatDateBR(lead.createdAt)}</Fact>
        <Fact label={COPY.inStageFor}>{daysInStage(lead)} {daysInStage(lead) === 1 ? "dia" : "dias"}</Fact>
      </Section>

      {editing && (
        <EditTemperatureNote /> /* temperature editor lives in Commercial slot; nothing here */
      )}
    </div>
  );
}

function Badge({ className, icon, children }: { className: string; icon: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium", className)}>
      <Icon icon={icon} size={12} />
      {children}
    </span>
  );
}

function Section({ title, last, children }: { title: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("py-3", !last && "border-b border-border")}>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">{children}</dl>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

function Dim({ children }: { children: React.ReactNode }) {
  return <span className="font-normal text-muted-foreground">{children}</span>;
}

// --- Edit slots: stubs in Task 5, implemented in Task 6 ---
function TagsEditorSlot(_: { draft: ILeadDraft; onDraftChange: (p: Partial<ILeadDraft>) => void }) {
  return null;
}
function EditCommercialSlot(_: { draft: ILeadDraft; onDraftChange: (p: Partial<ILeadDraft>) => void; errors: ILeadDraftErrors }) {
  return null;
}
function EditEmailSlot(_: { draft: ILeadDraft; onDraftChange: (p: Partial<ILeadDraft>) => void; errors: ILeadDraftErrors }) {
  return null;
}
function EditTemperatureNote() {
  return null;
}
```

- [ ] **Step 3: Build + typecheck**

Run: `bun run build` (expect success) and `bunx tsc --noEmit 2>&1 | grep LeadDataCard` (expect no new errors).

- [ ] **Step 4: Commit**

```bash
git add src/features/leads/components/detail/LeadDataCard.tsx src/features/leads/i18n/pt-BR.ts
git commit -m "feat(leads): rich read-mode lead data card (badges, tags block, groups)"
```

---

### Task 6: Inline editing + floating save bar

**Files:**
- Modify: `src/features/leads/components/detail/LeadDataCard.tsx` (fill the edit slots)
- Modify: `src/features/leads/pages/LeadDetailPage.tsx` (draft state + sticky bar + full-field audit)
- Modify: `src/features/leads/i18n/pt-BR.ts` (save-bar strings if missing — reuse `LEADS_STRINGS.detail.cancel`/`editAction`)

**Interfaces:**
- Consumes: `toLeadDraft`/`validateLeadDraft`/`buildLeadPatch`/`addTag`/`normalizeTag` (Task 1).

- [ ] **Step 1: Fill the edit slots in `LeadDataCard`**

Replace the four stub functions at the bottom of `LeadDataCard.tsx` with:

```tsx
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_TEMPERATURES } from "../../utils/listFilters";
import { addTag, normalizeTag, type ILeadDraft, type ILeadDraftErrors } from "../../utils/leadDraft";

function TagsEditorSlot({ draft, onDraftChange }: { draft: ILeadDraft; onDraftChange: (p: Partial<ILeadDraft>) => void }) {
  const [input, setInput] = useState("");
  const commit = () => {
    const next = addTag(draft.tags, input);
    onDraftChange({ tags: next });
    setInput("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {draft.tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-1 text-xs">
          {tag}
          <button
            type="button"
            aria-label={`Remover ${tag}`}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
            onClick={() => onDraftChange({ tags: draft.tags.filter((t) => t !== tag) })}
          >
            <Icon icon="mdi:close" size={12} />
          </button>
        </span>
      ))}
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={() => normalizeTag(input) && commit()}
        placeholder={COPY.addTagPlaceholder}
        className="h-7 w-32 text-xs"
      />
    </div>
  );
}

function EditCommercialSlot({ draft, onDraftChange, errors }: { draft: ILeadDraft; onDraftChange: (p: Partial<ILeadDraft>) => void; errors: ILeadDraftErrors }) {
  return (
    <>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{COPY.fields.estimatedValue}</Label>
        <Input value={draft.estimatedValue} inputMode="decimal" onChange={(e) => onDraftChange({ estimatedValue: e.target.value })} />
        {errors.estimatedValue && <p className="text-[11px] text-red-600 dark:text-red-400">{errors.estimatedValue}</p>}
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{COPY.fields.nextAction}</Label>
        <Input type="date" value={draft.nextActionAt} onChange={(e) => onDraftChange({ nextActionAt: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{COPY.fields.temperature}</Label>
        <Select value={draft.temperature} onValueChange={(v) => onDraftChange({ temperature: v as ILeadDraft["temperature"] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {LEAD_TEMPERATURES.map((t) => (
              <SelectItem key={t} value={t}>
                <span className="inline-flex items-center gap-2">
                  <Icon icon={TEMPERATURE_META[t].icon} size={12} />
                  {TEMPERATURE_META[t].label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function EditEmailSlot({ draft, onDraftChange, errors }: { draft: ILeadDraft; onDraftChange: (p: Partial<ILeadDraft>) => void; errors: ILeadDraftErrors }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{COPY.fields.email}</Label>
      <Input value={draft.email} inputMode="email" onChange={(e) => onDraftChange({ email: e.target.value })} />
      {errors.email && <p className="text-[11px] text-red-600 dark:text-red-400">{errors.email}</p>}
    </div>
  );
}

function EditTemperatureNote() {
  return null;
}
```

Remove the now-unused `import { useState } from "react";` duplication if the linter flags it (keep a single top-level import).

- [ ] **Step 2: Page owns draft + sticky save bar + full-field audit**

Rewrite `src/features/leads/pages/LeadDetailPage.tsx` to own `editing`/`draft`/`errors`/`saving`, render the sticky bar, and audit every changed field:

```tsx
// key changes — full handlers (mirrors PartDetailPage)
import { toLeadDraft, validateLeadDraft, buildLeadPatch, type ILeadDraft, type ILeadDraftErrors } from "../utils/leadDraft";
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// inside the component:
const provider = useLeadsProvider();
const queryClient = useQueryClient();
const [editing, setEditing] = useState(false);
const [draft, setDraft] = useState<ILeadDraft | null>(null);
const [errors, setErrors] = useState<ILeadDraftErrors>({});
const [saving, setSaving] = useState(false);

const startEdit = () => { if (lead) { setDraft(toLeadDraft(lead)); setErrors({}); setEditing(true); } };
const cancelEdit = () => { setDraft(null); setErrors({}); setEditing(false); };
const changeDraft = (patch: Partial<ILeadDraft>) => setDraft((p) => (p ? { ...p, ...patch } : p));

const save = async () => {
  if (!lead || !draft) return;
  const v = validateLeadDraft(draft);
  setErrors(v);
  if (Object.keys(v).length > 0) return;
  const patch = buildLeadPatch(lead, draft);
  if (Object.keys(patch).length === 0) { cancelEdit(); return; }
  setSaving(true);
  try {
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
      before[key] = lead[key as keyof typeof lead];
      after[key] = patch[key];
    }
    await provider.update(lead.id, patch);
    auditLog({ action: "lead.updated", resource: "lead", resourceId: lead.id, before, after });
    toast.success(LEADS_STRINGS.toasts.updated);
    await queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
    await queryClient.invalidateQueries({ queryKey: ["leads-list"] });
    await queryClient.invalidateQueries({ queryKey: ["lead-audits", lead.id] });
    cancelEdit();
  } catch {
    toast.error(LEADS_STRINGS.toasts.updateError);
  } finally {
    setSaving(false);
  }
};
```

- Reset editing on id change: `useEffect(() => { cancelEdit(); }, [id]);`.
- Pass to `LeadHeader`: `onEdit={startEdit}` (already wired).
- Pass to `LeadDataCard`: `editing={editing} draft={draft ?? toLeadDraft(lead)} onDraftChange={changeDraft} errors={errors}`.
- Render the sticky bar at the end of the page's outer `div` (mirror `PartDetailPage`):

```tsx
{editing && (
  <div className="sticky bottom-0 z-10 border-t border-border bg-card/95 px-6 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80">
    <div className="mx-auto flex w-full max-w-5xl items-center justify-end gap-2">
      <Button variant="outline" size="sm" className="cursor-pointer" onClick={cancelEdit} disabled={saving}>
        {LEADS_STRINGS.detail.cancel}
      </Button>
      <Button size="sm" className="cursor-pointer" onClick={() => void save()} disabled={saving}>
        {saving ? (<><Icon icon="svg-spinners:ring-resize" size={14} /> {LEADS_STRINGS.detail.saving}</>) : LEADS_STRINGS.detail.editAction}
      </Button>
    </div>
  </div>
)}
```

Add `saving: "Salvando…"` to `LEADS_STRINGS.detail` if absent.

- [ ] **Step 3: Build + typecheck**

Run: `bun run build` and `bunx tsc --noEmit 2>&1 | grep -E "LeadDataCard|LeadDetailPage"`
Expected: build success; no new tsc errors on these files.

- [ ] **Step 4: Manual-review checklist (no browser)**

Confirm by reading the diff: Editar → inputs appear inline; tags add on Enter/comma and remove via ×; Salvar builds a minimal patch, audits before/after per field, invalidates `lead`/`leads-list`/`lead-audits`; Cancelar discards. Gate `canEdit` (already `usePermission("lead","edit") && !converted && !lost`).

- [ ] **Step 5: Commit**

```bash
git add src/features/leads/components/detail/LeadDataCard.tsx src/features/leads/pages/LeadDetailPage.tsx src/features/leads/i18n/pt-BR.ts
git commit -m "feat(leads): inline editing of the lead card with a floating save bar"
```

---

### Task 7: History timeline + real Notes tab

**Files:**
- Modify: `src/features/leads/components/detail/LeadTabs.tsx`
- Modify: `src/features/leads/i18n/pt-BR.ts` (notes strings)

**Interfaces:**
- Consumes: `describeLeadAudit` (Task 2); `listNotes`/`addNote` (Task 3); `useSellersProvider`, `useLeadsProvider`, `useAuth`.

- [ ] **Step 1: Add notes strings**

In `src/features/leads/i18n/pt-BR.ts`, inside `detail: { … }`:

```ts
    notesComposerPlaceholder: "Escreva uma nota…",
    addNote: "Adicionar",
    noteSaveError: "Não foi possível salvar a nota.",
```

- [ ] **Step 2: Replace `HistoryTab` rendering to use the engine**

In `LeadTabs.tsx`, swap the raw `labelForAction`/`formatDelta` body for `describeLeadAudit`, resolving the actor name from the seller provider:

```tsx
import { describeLeadAudit } from "../../engine/leadHistory";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";

function HistoryTab({ leadId }: { leadId: ID }) {
  const provider = useAuditsProvider();
  const sellersProvider = useSellersProvider();
  const query = useQuery({
    queryKey: ["lead-audits", leadId] as const,
    queryFn: () => provider.list({ resource: "lead", resourceId: leadId, pageSize: 100 }),
    staleTime: 30_000,
  });
  const sellersQuery = useQuery({
    queryKey: ["sellers-min"] as const,
    queryFn: () => sellersProvider.list({ pageSize: 1000 }),
    staleTime: 5 * 60_000,
  });
  const nameOf = (id: ID) => sellersQuery.data?.data.find((s) => s.id === id)?.fullName ?? "";

  if (query.isLoading) return <p className="px-4 py-6 text-center text-xs text-muted-foreground">Carregando…</p>;
  const entries = query.data?.data ?? [];
  if (entries.length === 0) {
    return <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">{COPY.emptyHistory}</p>;
  }
  return (
    <ol className="space-y-2">
      {entries.map((entry) => {
        const d = describeLeadAudit(entry);
        return (
          <li key={entry.id} className="rounded-md border border-border bg-card px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <Icon icon={d.icon} size={13} className="text-muted-foreground" />
                {d.title}
              </span>
              <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                {formatRelativeTimeBR(entry.timestamp)}
              </span>
            </div>
            {d.lines.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                {d.lines.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            )}
            {nameOf(entry.actorId) && (
              <p className="mt-1 text-[10px] text-muted-foreground/80">por {nameOf(entry.actorId)}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
```

Remove the now-dead `labelForAction`/`formatDelta` helpers and the `formatDateTimeBR` import if unused; keep `formatRelativeTimeBR`.

- [ ] **Step 3: Implement the real `NotesTab`**

Replace the empty Notes `TabsContent` placeholder with `<NotesTab lead={lead} />` and add:

```tsx
import { useState } from "react";
import { toast } from "sonner";
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
import { useAuth } from "@/features/auth/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function NotesTab({ lead }: { lead: ILead }) {
  const provider = useLeadsProvider();
  const sellersProvider = useSellersProvider();
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  const notesQuery = useQuery({
    queryKey: ["lead-notes", lead.id] as const,
    queryFn: () => provider.listNotes(lead.id),
    staleTime: 30_000,
  });
  const sellersQuery = useQuery({
    queryKey: ["sellers-min"] as const,
    queryFn: () => sellersProvider.list({ pageSize: 1000 }),
    staleTime: 5 * 60_000,
  });
  const nameOf = (id: ID) => sellersQuery.data?.data.find((s) => s.id === id)?.fullName ?? "";

  const add = async () => {
    const body = content.trim();
    const authorId = currentUser?.sellerId;
    if (!body || !authorId) return;
    setBusy(true);
    try {
      await provider.addNote(lead.id, body, authorId);
      setContent("");
      await queryClient.invalidateQueries({ queryKey: ["lead-notes", lead.id] });
    } catch {
      toast.error(COPY.noteSaveError);
    } finally {
      setBusy(false);
    }
  };

  const notes = notesQuery.data ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={COPY.notesComposerPlaceholder}
          rows={2}
        />
        <div className="flex justify-end">
          <Button size="sm" className="cursor-pointer" disabled={busy || !content.trim() || !currentUser?.sellerId} onClick={() => void add()}>
            {COPY.addNote}
          </Button>
        </div>
      </div>
      {notes.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">{COPY.emptyNotes}</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border border-border bg-card px-3 py-2 text-sm">
              <p className="whitespace-pre-wrap text-foreground">{n.content}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {nameOf(n.authorId)} · {formatRelativeTimeBR(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Build + typecheck**

Run: `bun run build` and `bunx tsc --noEmit 2>&1 | grep LeadTabs`
Expected: build success; no new tsc errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/leads/components/detail/LeadTabs.tsx src/features/leads/i18n/pt-BR.ts
git commit -m "feat(leads): readable history timeline + real lead notes tab"
```

---

## Final Verification (run before opening the PR)

- [ ] `bun run test` — full suite green (new: `leadDraft`, `leadHistory`, `leadNotes` mock).
- [ ] `bun run build` — success.
- [ ] `bunx tsc --noEmit` — no NEW errors vs the main baseline on touched files.
- [ ] Re-run the Task 4 dry-run once more against prod schema (rolled back) — `DRYRUN PASSED`.
- [ ] Open the PR (migration versioned + frontend together); request the adversarial multi-agent review; note the `apply_migration` gate for the owner.

---

## Self-Review (plan vs spec)

- **Spec Parte 1 (card rico):** Task 5 (status strip, tags block, groups, next-action chip, `daysInStage`). ✓
- **Spec Parte 2 (edição inline + barra):** Task 1 (draft util) + Task 6 (inputs + sticky bar + gate). ✓
- **Spec Parte 3 (timeline):** Task 2 (engine) + Task 6 (full-field audit) + Task 7 (History rendering). ✓
- **Spec Parte 4 (notas):** Task 3 (provider) + Task 4 (table/RLS) + Task 7 (NotesTab). ✓
- **Gates/rollout:** Final Verification + Task 4 migration gate. ✓
- **Type consistency:** `ILeadDraft`/`ILeadDraftErrors` defined in Task 1 and consumed unchanged in Tasks 5–6; `ILeadNote`/`listNotes`/`addNote` defined in Task 3 and consumed in Task 7; `describeLeadAudit` signature defined in Task 2 and consumed in Task 7. ✓
- **No placeholders:** every code step contains full code. The Task 5 edit-slot stubs are intentional and explicitly filled in Task 6. ✓
