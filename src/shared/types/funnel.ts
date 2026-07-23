/**
 * Funnel identity slot. Persisted as a smallint, never as a hex string — the
 * user picks WHICH of the system's identities a funnel occupies, not a colour.
 * Slot 0 is the neutral one, reserved for the default triage funnel.
 */
export type FunnelAccent = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Lifecycle role of a stage inside its funnel. Retires CLOSING_STAGE_ID. */
export type LeadFunnelStageKind = "entrada" | "aberta" | "ganho" | "perda";
