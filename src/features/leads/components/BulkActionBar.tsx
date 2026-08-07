import { useState } from "react";
import type { ID, ILeadFunnel, IPipelineStage, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getAccentClasses } from "@/features/funnels/engine/accentClasses";
import type { IBulkProgress } from "../hooks/useBulkLeadActions";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.list.bulk;

type Pending = "funnel" | "seller" | "lost" | null;

export interface IBulkActionBarProps {
  count: number;
  progress: IBulkProgress | null;
  /** Funnels the lead can be added to — the open one included, harmlessly. */
  funnels: ILeadFunnel[];
  sellers: ISeller[];
  lossReasons: { id: ID; name: string }[];
  lostStage: IPipelineStage | undefined;
  /** True when the open funnel is the triage one — changes what we explain. */
  onDefaultFunnel: boolean;
  onClear: () => void;
  onAddToFunnel: (funnelId: ID, funnelName: string) => void;
  onAssignSeller: (sellerId: ID, sellerName: string) => void;
  onMarkLost: (reason: string, stage: IPipelineStage) => void;
}

/**
 * Appears with the selection, sticky at the foot of the list.
 *
 * Sticky rather than merely last — the phase-6 admin screen shipped a save
 * button below the fold, and a bulk bar you have to scroll to find is the same
 * defect with higher stakes.
 */
export function BulkActionBar({
  count,
  progress,
  funnels,
  sellers,
  lossReasons,
  lostStage,
  onDefaultFunnel,
  onClear,
  onAddToFunnel,
  onAssignSeller,
  onMarkLost,
}: IBulkActionBarProps) {
  const [pending, setPending] = useState<Pending>(null);
  const [choice, setChoice] = useState<string>("");

  if (count === 0) return null;
  const busy = progress !== null;

  const close = () => {
    setPending(null);
    setChoice("");
  };

  const confirm = () => {
    if (choice === "") return;
    if (pending === "funnel") {
      const f = funnels.find((x) => x.id === choice);
      if (f) onAddToFunnel(f.id, f.name);
    } else if (pending === "seller") {
      const s = sellers.find((x) => x.id === choice);
      if (s) onAssignSeller(s.id, s.fullName);
    } else if (pending === "lost" && lostStage) {
      const r = lossReasons.find((x) => x.id === choice);
      onMarkLost(r?.name ?? choice, lostStage);
    }
    close();
  };

  const dialogTitle =
    pending === "funnel" ? COPY.addTitle : pending === "seller" ? COPY.assignTitle : COPY.lostTitle;
  const dialogConfirm =
    pending === "funnel"
      ? COPY.addConfirm
      : pending === "seller"
        ? COPY.assignConfirm
        : COPY.lostConfirm;

  return (
    <>
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-border bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <span className="text-xs font-medium text-foreground">
          {busy ? COPY.running(progress.done, progress.total) : COPY.selected(count)}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setPending("funnel")}>
            <Icon icon="mdi:filter-plus-outline" size={16} aria-hidden />
            {COPY.addToFunnel}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setPending("seller")}>
            <Icon icon="mdi:account-arrow-right-outline" size={16} aria-hidden />
            {COPY.assignSeller}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !lostStage}
            onClick={() => setPending("lost")}
          >
            <Icon icon="mdi:close-circle-outline" size={16} aria-hidden />
            {COPY.markLost}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onClear}>
            {COPY.clear}
          </Button>
        </div>

        {onDefaultFunnel && (
          // In the triage funnel the canonical action is ADD, not move — with
          // N:N the lead joins another funnel and STAYS here until somebody
          // takes it out. Saying so beats letting people wonder why the row
          // did not disappear.
          <p className="w-full text-[11px] text-muted-foreground">{COPY.defaultFunnelNote}</p>
        )}
      </div>

      <Dialog open={pending !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              {pending === "lost" ? COPY.lostBody : COPY.selected(count)}
            </DialogDescription>
          </DialogHeader>

          <Select value={choice} onValueChange={setChoice}>
            <SelectTrigger aria-label={dialogTitle}>
              <SelectValue placeholder={pending === "lost" ? COPY.reason : dialogTitle} />
            </SelectTrigger>
            <SelectContent>
              {pending === "funnel" &&
                funnels.map((f) => (
                  <SelectItem key={f.id} value={f.id} className="gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        "inline-block size-2 shrink-0 rounded-sm",
                        getAccentClasses(f.accent).dot,
                      )}
                    />
                    {f.name}
                  </SelectItem>
                ))}
              {pending === "seller" &&
                sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.fullName}
                  </SelectItem>
                ))}
              {pending === "lost" &&
                lossReasons.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <DialogFooter>
            <Button variant="outline" onClick={close}>
              {COPY.cancel}
            </Button>
            <Button disabled={choice === ""} onClick={confirm}>
              {dialogConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
