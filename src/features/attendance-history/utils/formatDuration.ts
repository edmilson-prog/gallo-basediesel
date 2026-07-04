/**
 * Formats a millisecond duration for the attendance-history timeline
 * (pt-BR, compact) — pure, no I/O: "1d 3h", "2h 10min", "12min", "< 1min".
 */
export function formatDuration(ms: number): string {
  if (ms < 60_000) return "< 1min";

  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
  return `${minutes}min`;
}
