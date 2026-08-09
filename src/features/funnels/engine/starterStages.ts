import type { FunnelAccent, ILeadFunnelStage, LeadFunnelStageKind } from "@/shared/types";

/** The four kinds a funnel is born with, in board order. */
const STARTER_KINDS = ["entrada", "aberta", "ganho", "perda"] as const;

export type StarterStageKind = (typeof STARTER_KINDS)[number];

/** A stage before it belongs to anything — the provider stamps the funnel. */
export type NewFunnelStage = Omit<ILeadFunnelStage, "funnelId">;

export interface IStarterStagesInput {
  accent: FunnelAccent;
  /** Display names, already localised — the engine stays free of i18n. */
  names: Record<StarterStageKind, string>;
  now: string;
  /** Injected so the test can assert the shape without stubbing globals. */
  newId?: () => string;
}

/**
 * The stages every new funnel starts with.
 *
 * `assert_funnel_has_terminal_stages` is a DEFERRED constraint trigger, so a
 * funnel that never gets a won and a lost stage is rejected at commit. All four
 * are therefore created in the same operation as the funnel, never afterwards.
 *
 * Ids come from `newId()` and are never derived from the funnel's own id.
 * `${funnelId}-${kind}` reads like a stable, meaningful key and works in mock
 * mode, where ids are opaque strings — but `lead_funnel_stages.id` is a `uuid`
 * column, so Supabase answered 22P02 (400) while the funnel row, written by a
 * separate request, had already been committed. Every attempt left a funnel
 * with no stages behind, and retrying the same name then hit the unique index
 * on `(store_id, lower(name))` with a 409.
 */
export function buildStarterStages({
  accent,
  names,
  now,
  newId = () => crypto.randomUUID(),
}: IStarterStagesInput): NewFunnelStage[] {
  return STARTER_KINDS.map((kind, position) => ({
    id: newId(),
    name: names[kind],
    accent,
    position,
    kind: kind as LeadFunnelStageKind,
    createdAt: now,
    updatedAt: now,
  }));
}
