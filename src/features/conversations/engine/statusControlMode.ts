/**
 * Status control display mode — which of the three header controls the
 * attendant sees. Pure module so the normalizer can be unit-tested and reused
 * by the persistence hook. Mirrors the project's "modes the user switches in
 * the UI" pattern (notes consult, scheduling center).
 */
export type StatusControlMode = "pill" | "menu" | "segmented";

export const STATUS_CONTROL_MODES: readonly StatusControlMode[] = [
  "pill",
  "menu",
  "segmented",
] as const;

export const DEFAULT_STATUS_CONTROL_MODE: StatusControlMode = "pill";

/** Coerce any persisted/unknown value into a valid mode (default = pill). */
export function normalizeStatusControlMode(value: unknown): StatusControlMode {
  return STATUS_CONTROL_MODES.includes(value as StatusControlMode)
    ? (value as StatusControlMode)
    : DEFAULT_STATUS_CONTROL_MODE;
}
