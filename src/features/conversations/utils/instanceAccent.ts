/**
 * Identity color for a WhatsApp instance, derived from its id. A closed palette
 * that NEVER overlaps the severity tokens — color encodes identity, never state.
 */
const INSTANCE_PALETTE = ["#2dd4bf", "#a78bfa", "#f472b6", "#818cf8", "#fb923c", "#38bdf8"];

export function instanceAccent(accountId: string): string {
  let hash = 0;
  for (const ch of accountId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return INSTANCE_PALETTE[hash % INSTANCE_PALETTE.length]!;
}
