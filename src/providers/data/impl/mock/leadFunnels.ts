import type {
  ID,
  IFunnelBoardSummary,
  ILeadFunnel,
  ILeadFunnelEntry,
  ILeadFunnelStage,
} from "@/shared/types";
import type { ILeadFunnelsProvider } from "../../contracts/leadFunnels";
import { planAddToFunnel, planRemoveFromFunnel } from "@/features/funnels/engine/membershipRules";
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

function seedOnce(): void {
  if (seeded) return;
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
  // matches its legacy snapshot — mirroring the SQL backfill.
  //
  // `funnels[0]` is a `noUncheckedIndexedAccess` read (T | undefined) — resolved
  // via `.find(isDefault)` instead, which both narrows explicitly and is more
  // robust than relying on array order.
  const defaultFunnel = funnels.find((f) => f.isDefault);
  if (!defaultFunnel) throw new Error("[mock] seeding produced no default funnel");
  const defaultStages = stages.filter((s) => s.funnelId === defaultFunnel.id);
  const entryStage = defaultStages.find((s) => s.kind === "entrada");
  const wonStage = defaultStages.find((s) => s.kind === "ganho");
  const lostStage = defaultStages.find((s) => s.kind === "perda");

  // Explicit `: ILeadFunnelEntry | null` return type (instead of `satisfies`)
  // so the mapped array element type is exactly `ILeadFunnelEntry | null` —
  // `satisfies` alone keeps the wider literal-inferred type (every optional
  // property becomes a required `T | undefined` key), which then fails the
  // `e is ILeadFunnelEntry` predicate below (TS2677: the asserted type must be
  // assignable to the narrower literal type, and it no longer is).
  entries = getMockState()
    .leads.map((lead, index): ILeadFunnelEntry | null => {
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

  async updateFunnel(id, patch) {
    seedOnce();
    // `.find()` instead of `findIndex()` + `funnels[index]` — the latter is a
    // `noUncheckedIndexedAccess` read (T | undefined) even right after an
    // `index >= 0` guard, since TS cannot correlate the two.
    const target = funnels.find((f) => f.id === id);
    if (!target) throw new Error(`[mock] funnel ${id} not found`);
    const updated: ILeadFunnel = { ...target, ...patch, id, updatedAt: nowIso() };
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
    // Upsert by id plus orphan removal, mirroring the Supabase implementation:
    // wipe-and-reinsert would orphan the memberships that point at these ids.
    const others = stages.filter((s) => s.funnelId !== funnelId);
    stages = [...others, ...next.map((s) => ({ ...s, funnelId, updatedAt: nowIso() }))];
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

  async listEntriesViaConversation(conversationId) {
    seedOnce();
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
    const target = entries.find((e) => e.id === entryId);
    if (!target) throw new Error(`[mock] entry ${entryId} not found`);
    const updated: ILeadFunnelEntry = {
      ...target,
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
      entries = [
        ...entries,
        {
          ...target,
          id: `entry-${crypto.randomUUID()}`,
          funnelId: plan.recreateInFunnelId,
          stageId: plan.recreateInStageId,
          enteredStageAt: nowIso(),
          updatedAt: nowIso(),
        },
      ];
    }

    return { movedToDefault: plan.movedToDefault };
  },
};
