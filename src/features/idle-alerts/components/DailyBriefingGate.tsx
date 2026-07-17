import { useEffect, useRef, useState } from "react";
import { useIdleSummary } from "../hooks/useIdleSummary";
import { consumeExplicitLogin } from "../hooks/useExplicitLoginFlag";
import { shouldShowBriefing } from "../engine/briefingGate";
import { DailyBriefing } from "./DailyBriefing";

/**
 * Mounted once in AppLayout. Waits for the first summary result after an
 * explicit login; shows the full-screen briefing at most once per login.
 */
export function DailyBriefingGate() {
  const { summary, isLoading } = useIdleSummary();
  const [explicit, setExplicit] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const consumedRef = useRef<boolean | null>(null);

  useEffect(() => {
    // StrictMode replays this effect in dev; latch the first (real) consumption
    // so the one-shot flag isn't read-then-lost on the replay.
    if (consumedRef.current === null) {
      consumedRef.current = consumeExplicitLogin();
    }
    setExplicit(consumedRef.current);
  }, []);

  if (dismissed || isLoading) return null;
  if (!shouldShowBriefing(explicit, summary)) return null;
  return <DailyBriefing summary={summary!} onDismiss={() => setDismissed(true)} />;
}
