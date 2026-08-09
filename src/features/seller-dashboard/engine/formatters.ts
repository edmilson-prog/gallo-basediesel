/** Compact duration label from milliseconds: "3 min", "1h 12min", "2h". */
export function formatMinutesLabel(ms: number): string {
  if (ms <= 0) return "—";
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}min`;
}

/** Compact elapsed-since label from an ISO instant: "25 min", "3h", "4d 2h". */
// Deliberately not imported from `@/features/idle-alerts` (which has an
// equivalent `formatElapsed`): that function isn't exported from the
// feature's barrel (`src/features/idle-alerts/index.ts`), and reaching past
// another feature's barrel into its internals isn't this codebase's
// pattern. This ~10-line duplicate keeps `seller-dashboard` self-contained.
export function formatWaitLabel(fromIso: string, now: Date): string {
  const ms = Math.max(0, now.getTime() - new Date(fromIso).getTime());
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days}d ${restHours}h` : `${days}d`;
}

/** Time-of-day greeting in pt-BR from an hour-of-day (0-23). */
export function greetingLabel(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}
