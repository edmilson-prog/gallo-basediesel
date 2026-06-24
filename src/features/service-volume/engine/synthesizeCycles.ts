/**
 * Deterministic synthesis of "novo atendimento" event timestamps for the mock.
 * Rule (Global Constraints): each conversation contributes 1 first-contact
 * event at createdAt, plus N synthetic reopen events when the conversation
 * looks like it cycled (terminal statuses are more likely to have reopened).
 * No Math.random — derived from a hash of the conversation id so reloads are
 * stable. The real PRD-214 derives these from conversation_status_events.
 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff; // 0..1
}

export function synthesizeNovoAtendimentoTimestamps(conv: {
  id: string;
  createdAt: string;
  lastMessageAt: string;
  status: string;
}): string[] {
  const out = [conv.createdAt];
  const lo = new Date(conv.createdAt).getTime();
  const hi = new Date(conv.lastMessageAt).getTime();
  if (hi <= lo) return out;

  // Terminal/older conversations are more likely to have reopened.
  const propensity = conv.status === "resolvida" || conv.status === "arquivada" ? 0.7 : 0.25;
  const seed = hash(conv.id);
  if (seed > propensity) return out;

  const reopens = 1 + Math.floor(hash(conv.id + "r") * 2); // 1..2 extra cycles
  for (let i = 1; i <= reopens; i++) {
    const frac = hash(conv.id + `:${i}`);
    out.push(new Date(lo + frac * (hi - lo)).toISOString());
  }
  return out;
}
