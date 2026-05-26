import { useEffect, useState } from "react";

/**
 * Returns a `Date` that updates on a fixed interval (default 60s).
 *
 * Used by `<ConversationListItem>` to keep "há 2 min" relative timestamps
 * fresh without each item owning its own interval — a single tick at the
 * page level fans out to every memoized row via shared React state.
 */
export function useTimeTick(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
