/**
 * One shared `setInterval` per interval length, for the whole app.
 *
 * `useTimeTick` always promised in its docstring that "a single tick at the
 * page level fans out to every memoized row", but it used to open its own
 * timer per caller — and `<ConversationListItem>` calls it per ROW, so an
 * Inbox showing 30-120 conversations really ran 30-120 timers, each waking the
 * main thread on its own phase. That produced the stream of
 * `[Violation] 'setTimeout' handler took <N>ms` console entries (2026-08-11).
 *
 * Kept here (clock-free `engine/`, in the sense the rest of the folder means:
 * no React) so the fan-out logic is unit-testable with fake timers, while the
 * hook stays a thin `useState` + `useEffect` wrapper.
 */
interface IClock {
  id: number;
  subscribers: Set<(now: Date) => void>;
}

const clocks = new Map<number, IClock>();

/**
 * Registers `onTick` on the clock for `intervalMs`, creating the underlying
 * timer only for the first subscriber. Returns the unsubscribe function; the
 * last subscriber to leave clears the timer, so an unmounted screen leaves
 * nothing running.
 */
export function subscribeToClock(intervalMs: number, onTick: (now: Date) => void): () => void {
  let clock = clocks.get(intervalMs);
  if (!clock) {
    const subscribers = new Set<(now: Date) => void>();
    const id = setInterval(() => {
      // One Date per tick, shared by every subscriber — identity equality then
      // behaves the same for all of them downstream.
      const now = new Date();
      // Iterate a copy: a subscriber may unsubscribe (unmount) during the tick.
      [...subscribers].forEach((subscriber) => subscriber(now));
    }, intervalMs) as unknown as number;
    clock = { id, subscribers };
    clocks.set(intervalMs, clock);
  }
  const active = clock;
  active.subscribers.add(onTick);

  return () => {
    active.subscribers.delete(onTick);
    if (active.subscribers.size === 0) {
      clearInterval(active.id);
      // Only drop the entry if it is still ours — a resubscribe during teardown
      // may already have installed a fresh clock under the same key.
      if (clocks.get(intervalMs) === active) clocks.delete(intervalMs);
    }
  };
}

/** Test seam: how many timers are live right now. */
export function activeClockCount(): number {
  return clocks.size;
}
