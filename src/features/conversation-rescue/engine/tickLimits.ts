/**
 * Hard per-tick caps (incident review 2026-07-18, round 3) — safety rails, not
 * business knobs, so they are constants and never surface in the UI. Same
 * discipline as MAX_ACTIVATIONS_PER_TICK in the SDR backstop tick, which was
 * introduced after a structurally identical mass-dispatch incident.
 *
 * Without them the ONLY brake on enabling the toggle is the max-wait window,
 * and every conversation that clears it broadcasts in a single tick — then
 * force-assigns a few minutes later. Measured against production at the time
 * of writing: 33 conversations would have gone out in one pass.
 *
 * The cron runs every minute, so a capped tick is not a dropped tick: the
 * remainder is picked up on the next pass, spreading the same work over
 * minutes instead of seconds and leaving a human room to hit the kill-switch.
 */

/** Max rescue rows created per tick, across all stores. */
export const MAX_BROADCASTS_PER_TICK = 10;

/** Max forced reassignments per tick, across all stores. */
export const MAX_FORCED_ASSIGNMENTS_PER_TICK = 5;
