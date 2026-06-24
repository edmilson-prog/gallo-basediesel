export function formatHandleTime(ms: number): string {
  if (ms <= 0) return "—";
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return `${Math.round(ms / 1000)}s`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
