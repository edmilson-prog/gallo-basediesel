import { useEffect, useState } from "react";
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

  useEffect(() => {
    // Consume the one-shot flag on mount (post-login app boot).
    setExplicit(consumeExplicitLogin());
  }, []);

  if (dismissed || isLoading) return null;
  if (!shouldShowBriefing(explicit, summary)) return null;
  return <DailyBriefing summary={summary!} onDismiss={() => setDismissed(true)} />;
}
