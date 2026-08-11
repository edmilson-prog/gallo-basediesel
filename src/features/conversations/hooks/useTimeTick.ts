import { useEffect, useState } from "react";
import { subscribeToClock } from "../engine/sharedClock";

/**
 * Returns a `Date` that updates on a fixed interval (default 60s).
 *
 * Used by `<ConversationListItem>` to keep "há 2 min" relative timestamps
 * fresh without each item owning its own interval — a single tick at the
 * page level fans out to every memoized row via shared React state.
 *
 * The fan-out lives in `engine/sharedClock`: this hook used to open its own
 * `setInterval` per caller, which meant one timer PER ROW here (30-120 of them
 * on a busy Inbox). Same signature, one timer.
 */
export function useTimeTick(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => subscribeToClock(intervalMs, setNow), [intervalMs]);
  return now;
}
