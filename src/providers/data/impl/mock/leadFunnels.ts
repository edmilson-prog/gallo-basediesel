import type {
  ID,
  IFunnelBoardSummary,
  ILead,
  ILeadFunnel,
  ILeadFunnelEntry,
  ILeadFunnelStage,
} from "@/shared/types";
import type { ILeadFunnelsProvider } from "../../contracts/leadFunnels";
import { planAddToFunnel, planRemoveFromFunnel } from "@/features/funnels/engine/membershipRules";
import { planStageTransition } from "@/features/funnels/engine/stageTransition";
import { resolveAccessibleFunnels } from "@/features/funnels/engine/accessibleFunnels";
import { summariseStage } from "@/features/funnels/engine/funnelMetrics";
import { getMockState } from "../../../../mocks/store/mockStore";

/**
 * In-memory multi-funnel provider. Seeds three funnels beyond the default so
 * the three navigation patterns can actually be exercised in demo mode — with
 * a single funnel they all degrade to a static label.
 */

const STORE_ID = "00000000-0000-0000-0000-000000000001";
const nowIso = () => new Date().toISOString();

function makeId(prefix: string, n: number): ID {
  return `${prefix}-${n}`;
}

let funnels: ILeadFunnel[] = [];
let stages: ILeadFunnelStage[] = [];
let entries: ILeadFunnelEntry[] = [];
let access: Array<{ funnelId: ID; sellerId: ID }> = [];
let seeded = false;

// Reference (not content) of the `leads` array `entries` was last derived
// from. `useMockStore`'s mutators (`upsert`/`patchById`/`removeById` in
// `mocks/store/mutations.ts`) never mutate the array in place — every create,
// update, delete AND `resetMockStore` (`useResetMocks` on /design-system)
// swaps in a brand-new array reference. That makes `===` a free, reliable
// staleness signal — cheaper and more robust than diffing ids, since a reset
// reseeds `lead-0001..NNNN` with the SAME sequence-derived ids but entirely
// different records (VOLUMES.leads is a fixed count), so an id-set comparison
// alone would miss it.
let lastSyncedLeads: ILead[] | undefined;

/**
 * Builds the DEFAULT funnel's membership set from scratch, purely as a
 * function of the leads passed in. The single source of truth both
 * `seedOnce` (initial population) and `reconcileWithLeadStore` (post-reset
 * re-derivation) delegate to, so the two call sites can never drift apart
 * again — see the comment at each call site for why an id-set patch (the
 * previous approach) doesn't work here.
 *
 * Per-lead stage precedence mirrors the SQL backfill: `convertedToCustomerId`
 * -> the `ganho` stage; `lossReason` -> the `perda` stage; otherwise the
 * `aberta` stage whose name matches the lead's legacy `stage.name` snapshot;
 * falling back to the funnel's `entrada` stage when nothing matched (or a
 * stage kind is missing entirely, defensively).
 */
function buildDefaultFunnelEntries(
  leads: ILead[],
  defaultFunnel: ILeadFunnel,
  defaultStages: ILeadFunnelStage[],
): ILeadFunnelEntry[] {
  const entryStage = defaultStages.find((s) => s.kind === "entrada");
  const wonStage = defaultStages.find((s) => s.kind === "ganho");
  const lostStage = defaultStages.find((s) => s.kind === "perda");

  // Explicit `: ILeadFunnelEntry | null` return type (instead of `satisfies`)
  // so the mapped array element type is exactly `ILeadFunnelEntry | null` —
  // `satisfies` alone keeps the wider literal-inferred type (every optional
  // property becomes a required `T | undefined` key), which then fails the
  // `e is ILeadFunnelEntry` predicate below (TS2677: the asserted type must be
  // assignable to the narrower literal type, and it no longer is).
  return leads
    .map((lead, index): ILeadFunnelEntry | null => {
      const matched = lead.convertedToCustomerId
        ? wonStage
        : lead.lossReason
          ? lostStage
          : defaultStages.find(
              (s) => s.name.toLowerCase() === lead.stage.name.toLowerCase() && s.kind === "aberta",
            );
      const stage = matched ?? entryStage;
      if (!stage) return null;
      return {
        id: makeId("entry", index),
        leadId: lead.id,
        funnelId: defaultFunnel.id,
        stageId: stage.id,
        storeId: lead.storeId,
        sellerId: lead.sellerId,
        estimatedValue: lead.estimatedValue,
        convertedToCustomerId: lead.convertedToCustomerId,
        lossReason: lead.lossReason,
        lossNotes: lead.lossNotes,
        enteredStageAt: lead.updatedAt,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
      };
    })
    .filter((e): e is ILeadFunnelEntry => e !== null);
}

/**
 * Keeps `entries` honest against whatever `leads` currently holds. Runs on
 * every `seedOnce()` call (i.e. every provider method), but is a no-op unless
 * the `leads` reference actually changed since the last sync.
 *
 * Fixes finding 11b (remediation v2): the first attempt reconciled by id-set
 * membership (drop entries whose `leadId` vanished, backfill leads with none)
 * — that is INEFFECTIVE against a mock-store reset. `VOLUMES.leads` is a
 * fixed count and mock lead ids are index-derived (`lead-0001..NNNN`), so a
 * reset regenerates the exact same ids attached to entirely different
 * records. An id-set diff finds nothing to drop or backfill, so every stale
 * membership survives — now silently pointing at the WRONG lead's stage,
 * which is worse than the original empty-board symptom.
 *
 * The fix: re-derive the entire default-funnel membership set from scratch
 * via `buildDefaultFunnelEntries` — the exact same derivation `seedOnce`
 * uses — instead of patching the old array. This is also why a membership a
 * user created in a NON-default funnel during the session does not survive a
 * reset: a reset replaces the whole dataset, and a manually created
 * cross-funnel membership has no lead-derived source of truth to rebuild
 * from — keeping it around would leave it pointing at a reused id under a
 * now-unrelated lead, exactly the class of bug this function exists to fix.
 */
function reconcileWithLeadStore(): void {
  const currentLeads = getMockState().leads;
  if (currentLeads === lastSyncedLeads) return;
  lastSyncedLeads = currentLeads;

  const defaultFunnel = funnels.find((f) => f.isDefault);
  if (!defaultFunnel) return; // seeding guarantees one; defensive no-op otherwise
  const defaultStages = stages.filter((s) => s.funnelId === defaultFunnel.id);

  entries = buildDefaultFunnelEntries(currentLeads, defaultFunnel, defaultStages);
}

function seedOnce(): void {
  if (seeded) {
    reconcileWithLeadStore();
    return;
  }
  seeded = true;

  const specs: Array<{
    id: string;
    name: string;
    accent: ILeadFunnel["accent"];
    icon: string;
    isDefault: boolean;
  }> = [
    { id: "geral", name: "Geral", accent: 0, icon: "mdi:inbox-outline", isDefault: true },
    { id: "catalisador", name: "Catalisador", accent: 1, icon: "mdi:air-filter", isDefault: false },
    { id: "filtros", name: "Filtros", accent: 2, icon: "mdi:filter-variant", isDefault: false },
    { id: "modulos", name: "Módulos", accent: 3, icon: "mdi:chip", isDefault: false },
  ];

  funnels = specs.map((s, index) => ({
    id: makeId("funnel", index),
    storeId: STORE_ID,
    name: s.name,
    description: s.isDefault ? "Todo lead novo entra aqui até ser direcionado." : undefined,
    accent: s.accent,
    icon: s.icon,
    position: index,
    isDefault: s.isDefault,
    openToStore: s.isDefault,
    entryAlertThreshold: 50,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }));

  const stageSpecs: Array<{
    name: string;
    kind: ILeadFunnelStage["kind"];
    accent: ILeadFunnelStage["accent"];
  }> = [
    { name: "Novo", kind: "entrada", accent: 0 },
    { name: "Em qualificação", kind: "aberta", accent: 2 },
    { name: "Orçamento enviado", kind: "aberta", accent: 6 },
    { name: "Em negociação", kind: "aberta", accent: 7 },
    { name: "Convertido", kind: "ganho", accent: 3 },
    { name: "Perdido", kind: "perda", accent: 1 },
  ];

  stages = funnels.flatMap((f, fi) =>
    stageSpecs.map((s, si) => ({
      id: makeId(`stage-${fi}`, si),
      funnelId: f.id,
      name: s.name,
      accent: s.accent,
      position: si,
      kind: s.kind,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })),
  );

  // Every existing mock lead joins the default funnel, on the stage whose name
  // matches its legacy snapshot — mirroring the SQL backfill. Delegated to
  // `buildDefaultFunnelEntries`, the same derivation `reconcileWithLeadStore`
  // re-runs after a mock-store reset, so the two can never drift apart.
  //
  // `funnels[0]` is a `noUncheckedIndexedAccess` read (T | undefined) — resolved
  // via `.find(isDefault)` instead, which both narrows explicitly and is more
  // robust than relying on array order.
  const defaultFunnel = funnels.find((f) => f.isDefault);
  if (!defaultFunnel) throw new Error("[mock] seeding produced no default funnel");
  const defaultStages = stages.filter((s) => s.funnelId === defaultFunnel.id);

  const seedLeads = getMockState().leads;
  entries = buildDefaultFunnelEntries(seedLeads, defaultFunnel, defaultStages);
  // Marks `entries` as already in sync with `seedLeads` — the very next
  // `seedOnce()` call (any provider method) would otherwise immediately
  // re-run `reconcileWithLeadStore()` and find nothing changed, but only
  // after paying for a full leads/entries scan.
  lastSyncedLeads = seedLeads;
}

export const mockLeadFunnelsProvider: ILeadFunnelsProvider = {
  async listFunnels(storeId, opts) {
    seedOnce();
    return funnels
      .filter((f) => f.storeId === storeId)
      .filter((f) => (opts?.includeArchived ? true : !f.archivedAt))
      .sort((a, b) => a.position - b.position);
  },

  async createFunnel(input) {
    seedOnce();
    // Post-seed create — id must be collision-safe against every id already
    // handed out (seed entries, prior creates), hence `crypto.randomUUID()`
    // instead of a length-derived id. See `addEntry`/`removeEntry` for why a
    // length-derived id is unsafe once the backing array can shrink; funnels
    // never shrink today (archive only sets `archivedAt`), but matching the
    // rest of the mock layer's convention (see `messageTemplates.ts`,
    // `conversationTags.ts`) is the right default regardless.
    const created: ILeadFunnel = {
      ...input,
      id: `funnel-${crypto.randomUUID()}`,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    funnels = [...funnels, created];
    return created;
  },

  async createFunnelWithStages(input, newStages) {
    // In memory both arrays are written under the same synchronous turn, so
    // there is no half-created funnel to undo.
    const created = await this.createFunnel(input);
    stages = [...stages, ...newStages.map((s) => ({ ...s, funnelId: created.id }))];
    return created;
  },

  async updateFunnel(id, patch) {
    seedOnce();
    // `.find()` instead of `findIndex()` + `funnels[index]` — the latter is a
    // `noUncheckedIndexedAccess` read (T | undefined) even right after an
    // `index >= 0` guard, since TS cannot correlate the two.
    const target = funnels.find((f) => f.id === id);
    if (!target) throw new Error(`[mock] funnel ${id} not found`);
    // Whitelist mirrors the Supabase implementation field-for-field —
    // `isDefault`/`storeId` are immutable in v1 (spec §2) and `archivedAt` is
    // written only by `archiveFunnel` (which enforces the "never archive the
    // default funnel" guard this method doesn't have). Spreading the raw
    // `patch` here previously let `updateFunnel(id, { isDefault: true })`
    // silently produce two default funnels — corrupting
    // `planRemoveFromFunnel`'s `funnels.find(f => f.isDefault)` fallback — and
    // let `updateFunnel(id, { archivedAt })` archive the default funnel by
    // bypassing `archiveFunnel`'s guard entirely (finding 13).
    const updated: ILeadFunnel = {
      ...target,
      name: patch.name ?? target.name,
      description: patch.description ?? target.description,
      accent: patch.accent ?? target.accent,
      icon: patch.icon ?? target.icon,
      position: patch.position ?? target.position,
      openToStore: patch.openToStore ?? target.openToStore,
      entryAlertThreshold: patch.entryAlertThreshold ?? target.entryAlertThreshold,
      id,
      updatedAt: nowIso(),
    };
    funnels = funnels.map((f) => (f.id === id ? updated : f));
    return updated;
  },

  async archiveFunnel(id) {
    seedOnce();
    const target = funnels.find((f) => f.id === id);
    if (!target) throw new Error(`[mock] funnel ${id} not found`);
    if (target.isDefault) throw new Error("[mock] the default funnel cannot be archived");
    funnels = funnels.map((f) => (f.id === id ? { ...f, archivedAt: nowIso() } : f));
  },

  async listStages(funnelId) {
    seedOnce();
    return stages.filter((s) => s.funnelId === funnelId).sort((a, b) => a.position - b.position);
  },

  async replaceStages(funnelId, next) {
    seedOnce();
    // Upsert by id (update in place, insert new) plus deletion of ORPHANS
    // only — mirroring the Supabase implementation's two-step shape exactly,
    // instead of a wipe-and-reinsert of the funnel's whole stage array. This
    // matters because ids are stable identity here: a stage id that survives
    // the call keeps every membership.stageId pointing at it valid; only a
    // stage genuinely dropped from `next` disappears.
    const nextById = new Map(next.map((s) => [s.id, s]));

    // Step 1a: update — any existing stage of this funnel whose id is still
    // present in `next` gets its content replaced in place.
    stages = stages.map((s) => {
      if (s.funnelId !== funnelId) return s;
      const updated = nextById.get(s.id);
      return updated ? { ...updated, funnelId, updatedAt: nowIso() } : s;
    });

    // Step 1b: insert — any id in `next` that didn't already exist for this
    // funnel is a genuinely new stage.
    const existingIds = new Set(
      stages.filter((s) => s.funnelId === funnelId).map((s) => s.id),
    );
    const inserted = next
      .filter((s) => !existingIds.has(s.id))
      .map((s) => ({ ...s, funnelId, updatedAt: nowIso() }));
    stages = [...stages, ...inserted];

    // Step 2: delete only the orphans — stages still tagged with this funnel
    // that are no longer present in `next`.
    const keptIds = new Set(next.map((s) => s.id));
    stages = stages.filter((s) => s.funnelId !== funnelId || keptIds.has(s.id));

    return this.listStages(funnelId);
  },

  async listAccess(funnelId) {
    seedOnce();
    return access.filter((a) => a.funnelId === funnelId).map((a) => a.sellerId);
  },

  async replaceAccess(funnelId, sellerIds) {
    seedOnce();
    access = [
      ...access.filter((a) => a.funnelId !== funnelId),
      ...sellerIds.map((sellerId) => ({ funnelId, sellerId })),
    ];
  },

  async listAccessibleFunnelIds(storeId) {
    seedOnce();
    // The mock has no session; demo mode behaves as staff.
    const reachable = resolveAccessibleFunnels({
      funnels: funnels.filter((f) => f.storeId === storeId),
      grantedFunnelIds: [],
      isStaff: true,
    });
    return reachable.map((f) => f.id);
  },

  async countLeadsByFunnel(storeId) {
    seedOnce();
    const result: Record<ID, number> = {};
    for (const funnel of funnels.filter((f) => f.storeId === storeId)) {
      result[funnel.id] = entries.filter((e) => e.funnelId === funnel.id).length;
    }
    return result;
  },

  async getBoardSummary(funnelId) {
    seedOnce();
    const leadsById = new Map(getMockState().leads.map((l) => [l.id, l]));
    const nextActionByLeadId: Record<ID, string | undefined> = {};
    for (const [id, lead] of leadsById) nextActionByLeadId[id] = lead.nextActionAt;

    return stages
      .filter((s) => s.funnelId === funnelId)
      .sort((a, b) => a.position - b.position)
      .map((stage) =>
        summariseStage({
          stageId: stage.id,
          entries: entries.filter((e) => e.stageId === stage.id),
          nextActionByLeadId,
          now: new Date(),
        }),
      ) satisfies IFunnelBoardSummary[];
  },

  async listEntriesByLead(leadId) {
    seedOnce();
    return entries.filter((e) => e.leadId === leadId);
  },

  async listEntriesByFunnel(funnelId) {
    seedOnce();
    return entries.filter((e) => e.funnelId === funnelId);
  },

  async listEntriesViaConversation(conversationId) {
    seedOnce();
    // `leads.conversations` IS the correct join key here — do not "fix" this
    // to match the SQL RPC's comment (lead_funnel_entries_via_conversation in
    // 20260723123000), which is about the REAL schema, where that column is a
    // legacy, unused text[]. In THIS mock's in-memory model `ILead.conversations`
    // is a genuinely maintained field (see mocks/generators/bootstrap.ts,
    // scriptedConversations.ts, providers/whatsapp/webhook/core.ts and
    // NewLeadModal, all of which push/set it), so it is a valid — and the
    // simplest — way to resolve a conversation's lead in mock data.
    const lead = getMockState().leads.find((l) => l.conversations.includes(conversationId));
    return lead ? entries.filter((e) => e.leadId === lead.id) : [];
  },

  async addEntry(leadId, funnelId, stageId) {
    seedOnce();
    const funnel = funnels.find((f) => f.id === funnelId);
    if (!funnel) throw new Error(`[mock] funnel ${funnelId} not found`);
    const lead = getMockState().leads.find((l) => l.id === leadId);
    if (!lead) throw new Error(`[mock] lead ${leadId} not found`);

    const plan = planAddToFunnel({
      existing: entries.filter((e) => e.leadId === leadId),
      funnel,
      stages: stages.filter((s) => s.funnelId === funnelId),
      leadEstimatedValue: lead.estimatedValue,
      stageId,
    });

    if (plan.action === "error") throw new Error(`[mock] cannot add to funnel: ${plan.reason}`);
    if (plan.action === "noop") {
      const existing = entries.find((e) => e.leadId === leadId && e.funnelId === funnelId);
      if (!existing) throw new Error("[mock] inconsistent membership state");
      return existing;
    }

    // Post-seed create — `entries.length` is NOT a safe id source here: unlike
    // seeding (a one-shot pass before any mutation), `removeEntry` shrinks
    // `entries` via `.filter()`, so a length-derived id can collide with a
    // surviving seed entry's id (e.g. `entry-(N-1)`) after a remove. That
    // collision corrupts membership identity: `.find()`/`.filter()` by id then
    // silently operate on/delete both entries at once. `crypto.randomUUID()`
    // never collides with the `entry-N` seed prefix, matching the convention
    // used by the rest of the mock layer for post-seed creates.
    const created: ILeadFunnelEntry = {
      id: `entry-${crypto.randomUUID()}`,
      leadId,
      funnelId: plan.funnelId,
      stageId: plan.stageId,
      storeId: lead.storeId,
      sellerId: lead.sellerId,
      estimatedValue: plan.estimatedValue,
      enteredStageAt: nowIso(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    entries = [...entries, created];
    return created;
  },

  async moveEntry(entryId, stageId) {
    seedOnce();
    // `.find()` instead of `findIndex()` + `entries[index]` — see updateFunnel.
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) throw new Error(`[mock] entry ${entryId} not found`);
    const targetStage = stages.find((s) => s.id === stageId);
    if (!targetStage) throw new Error(`[mock] stage ${stageId} not found`);

    // Routed through the engine instead of re-implementing the guard: the FK
    // `(funnel_id, stage_id)` composite in Supabase rejects a stage from
    // another funnel with 23503; without this, the mock silently rewrote the
    // entry's `stageId` alone, leaving `funnelId` pointing at the OLD funnel —
    // the card then belongs to none of that funnel's stages (disappears from
    // its board) and never appears on the target stage's real funnel either
    // (finding 12).
    const plan = planStageTransition({
      entry,
      target: targetStage,
      siblingEntries: entries.filter((e) => e.leadId === entry.leadId && e.id !== entryId),
    });
    if (plan.action === "error") {
      throw new Error(`[mock] cannot move entry: ${plan.reason}`);
    }
    // `noop` / `require_conversion` / `require_loss_reason` are UI-orchestrated
    // outcomes this contract doesn't carry the extra fields for yet (linked
    // customer id, loss reason text) — same gap the Supabase implementation
    // has today (neither calls the engine at all). This fix's scope is
    // narrowly the cross-funnel guard above; every plan that clears it still
    // applies the raw stage move exactly as before.

    const updated: ILeadFunnelEntry = {
      ...entry,
      stageId,
      enteredStageAt: nowIso(),
      updatedAt: nowIso(),
    };
    entries = entries.map((e) => (e.id === entryId ? updated : e));
    return updated;
  },

  async updateEntry(entryId, patch) {
    seedOnce();
    const target = entries.find((e) => e.id === entryId);
    if (!target) throw new Error(`[mock] entry ${entryId} not found`);
    const updated: ILeadFunnelEntry = { ...target, ...patch, updatedAt: nowIso() };
    entries = entries.map((e) => (e.id === entryId ? updated : e));
    return updated;
  },

  async removeEntry(entryId) {
    seedOnce();
    const target = entries.find((e) => e.id === entryId);
    if (!target) return { movedToDefault: false };

    const defaultFunnel = funnels.find((f) => f.isDefault);
    if (!defaultFunnel) throw new Error("[mock] store has no default funnel");

    const plan = planRemoveFromFunnel({
      existing: entries.filter((e) => e.leadId === target.leadId),
      entryId,
      defaultFunnel,
      defaultFunnelStages: stages.filter((s) => s.funnelId === defaultFunnel.id),
    });

    if (plan.action !== "remove") {
      throw new Error(`[mock] cannot remove membership: ${plan.reason}`);
    }

    entries = entries.filter((e) => e.id !== entryId);

    if (plan.movedToDefault && plan.recreateInFunnelId && plan.recreateInStageId) {
      // Same collision-safety concern as `addEntry` above — this recreate runs
      // right after `entries` was shrunk by the `.filter()` a few lines up,
      // so a length-derived id here is exactly the routine remove→recreate
      // sequence that produces the collision. `crypto.randomUUID()` sidesteps
      // it entirely.
      //
      // CONTRACT (mirrors the Supabase implementation — keep both in sync):
      //   - estimatedValue CARRIES OVER from the removed membership (kept via
      //     `...target`, explicitly NOT re-derived from the lead — see finding
      //     7). Re-deriving it here would silently substitute the lead's
      //     (different) figure and corrupt the forecast.
      //   - convertedToCustomerId / lossReason / lossNotes are explicitly
      //     CLEARED, not carried over. Moving back to the default/triage
      //     funnel means the lead is once again an OPEN opportunity, not a
      //     closed or converted one dragged back into an active pipeline.
      entries = [
        ...entries,
        {
          ...target,
          id: `entry-${crypto.randomUUID()}`,
          funnelId: plan.recreateInFunnelId,
          stageId: plan.recreateInStageId,
          convertedToCustomerId: undefined,
          lossReason: undefined,
          lossNotes: undefined,
          enteredStageAt: nowIso(),
          updatedAt: nowIso(),
        },
      ];
    }

    return { movedToDefault: plan.movedToDefault };
  },
};
