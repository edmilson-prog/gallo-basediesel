import { useState } from "react";
import { useAuth } from "@/features/auth/useAuth";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import type { IIdleSummary } from "@/shared/types";
import { formatElapsed } from "../engine/idleLevel";
import { IdlePendingSheet } from "./IdlePendingSheet";
import { useTimeTick } from "@/features/conversations/hooks/useTimeTick";

/** Full-screen post-login interstitial (mockup "Briefing do dia" aprovado). */
export function DailyBriefing({
  summary,
  onDismiss,
}: {
  summary: IIdleSummary;
  onDismiss: () => void;
}) {
  const { currentUser } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Same pattern as IdlePendingSheet: a single shared tick keeps the "top
  // urgentes" elapsed labels fresh instead of freezing at mount time — this
  // overlay is short-lived, but the sheet it opens into is not.
  const now = useTimeTick(60_000);
  const total = summary.counts.level1 + summary.counts.level2 + summary.counts.level3;
  const top = summary.entries.slice(0, 4);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">
          Briefing do dia
        </p>
        <h2 className="mt-2 text-xl font-bold text-foreground">
          Antes de começar, {currentUser?.displayName?.split(" ")[0] ?? "atendente"}…
        </h2>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <BriefStat count={summary.counts.level3} label="críticas" tone="critical" />
          <BriefStat count={summary.counts.level2} label="em alerta" tone="warning" />
          <BriefStat count={summary.counts.level1} label="atenção" tone="muted" />
        </div>
        {top.length > 0 && (
          <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Mais urgentes
            </p>
            {top.map((e) => (
              <div
                key={e.conversationId}
                className="flex items-center justify-between border-b border-border/50 py-1.5 text-xs last:border-0"
              >
                <span className="truncate text-foreground">{e.contactName}</span>
                <span className="shrink-0 font-semibold text-severity-critical">
                  {formatElapsed(e.awaitingReplySince, now)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-5 flex gap-3">
          <Button className="flex-1" onClick={() => setSheetOpen(true)}>
            Revisar as {total} conversa{total === 1 ? "" : "s"}
            <Icon icon="mdi:arrow-right" size={16} className="ml-2" />
          </Button>
          <Button variant="outline" onClick={onDismiss}>
            Pular
          </Button>
        </div>
      </div>
      <IdlePendingSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) onDismiss();
        }}
        summary={summary}
      />
    </div>
  );
}

function BriefStat({
  count,
  label,
  tone,
}: {
  count: number;
  label: string;
  tone: "critical" | "warning" | "muted";
}) {
  const toneClass =
    tone === "critical"
      ? "border-severity-critical/40 text-severity-critical"
      : tone === "warning"
        ? "border-severity-warning/40 text-severity-warning"
        : "border-border text-foreground";
  return (
    <div className={`rounded-lg border bg-background p-3 text-center ${toneClass}`}>
      <div className="text-2xl font-extrabold tabular-nums">{count}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
