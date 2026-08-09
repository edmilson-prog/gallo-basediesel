import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { FunnelAccent, ID, ILeadFunnel } from "@/shared/types";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLeadFunnelsProvider } from "@/providers/data/hooks/useLeadFunnelsProvider";
import { cn } from "@/lib/utils";
import { getAccentClasses } from "../engine/accentClasses";
import { buildStarterStages } from "../engine/starterStages";
import { COPY } from "../i18n/pt-BR";

/** Curated from the heavy-truck parts world — the icon carries the meaning. */
const ICONS = [
  "mdi:filter-variant",
  "mdi:air-filter",
  "mdi:oil",
  "mdi:engine-outline",
  "mdi:car-turbocharger",
  "mdi:car-brake-disc",
  "mdi:car-battery",
  "mdi:pipe",
  "mdi:cog-outline",
  "mdi:wrench-outline",
  "mdi:fuel",
  "mdi:radiator",
  "mdi:tire",
  "mdi:truck-outline",
  "mdi:lightning-bolt",
  "mdi:thermometer",
  "mdi:gauge",
  "mdi:hydraulic-oil-level",
  "mdi:screw-lag",
  "mdi:cog-transfer-outline",
  "mdi:snowflake",
  "mdi:shield-check-outline",
  "mdi:package-variant-closed",
  "mdi:hammer-wrench",
] as const;

/** Slot 0 is the neutral one, reserved for the default triage funnel. */
const SELECTABLE_ACCENTS: FunnelAccent[] = [1, 2, 3, 4, 5, 6, 7, 8];

const NAME_MAX = 40;

export interface INewFunnelModalProps {
  open: boolean;
  onClose: () => void;
  storeId: ID | null | undefined;
  existing: ILeadFunnel[];
  onCreated: (funnel: ILeadFunnel) => void;
}

function nextFreeAccent(existing: ILeadFunnel[]): FunnelAccent {
  const taken = new Set(existing.map((f) => f.accent));
  return SELECTABLE_ACCENTS.find((a) => !taken.has(a)) ?? SELECTABLE_ACCENTS[0]!;
}

export function NewFunnelModal({
  open,
  onClose,
  storeId,
  existing,
  onCreated,
}: INewFunnelModalProps) {
  const provider = useLeadFunnelsProvider();
  const queryClient = useQueryClient();

  const suggestedAccent = useMemo(() => nextFreeAccent(existing), [existing]);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>(ICONS[0]);
  const [accent, setAccent] = useState<FunnelAccent>(suggestedAccent);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setIcon(ICONS[0]);
    setAccent(nextFreeAccent(existing));
    setDescription("");
    setError(null);
  };

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError(COPY.newFunnel.nameRequired);
    if (existing.some((f) => f.name.toLowerCase() === trimmed.toLowerCase())) {
      return setError(COPY.newFunnel.nameTaken);
    }
    if (!storeId) return;

    setSaving(true);
    setError(null);
    try {
      // Funnel and stages as one operation: the funnel is invalid until it has
      // a won and a lost stage (deferred constraint trigger), and a funnel that
      // fails halfway would keep holding its name against the unique index.
      const created = await provider.createFunnelWithStages(
        {
          storeId,
          name: trimmed,
          description: description.trim() || undefined,
          accent,
          icon,
          position: existing.reduce((max, f) => Math.max(max, f.position), -1) + 1,
          isDefault: false,
          openToStore: true,
          entryAlertThreshold: 50,
        },
        buildStarterStages({ accent, names: COPY.starterStages, now: new Date().toISOString() }),
      );

      await queryClient.invalidateQueries({ queryKey: ["lead-funnels"] });
      await queryClient.invalidateQueries({ queryKey: ["lead-funnel-counts"] });

      toast.success(COPY.newFunnel.created(created.name));
      reset();
      onCreated(created);
    } catch (cause) {
      // The console was the only place the real reason showed up while the
      // dialog said "não foi possível" — keep it, and name the one case the
      // user can act on.
      console.error("[funnels] createFunnelWithStages failed", cause);
      const message = cause instanceof Error ? cause.message : "";
      setError(
        /duplicate key|23505/i.test(message) ? COPY.newFunnel.nameTaken : COPY.newFunnel.failed,
      );
      // A funnel the server rejected may still have landed before the failure;
      // refetch so `existing` reflects the server, not this component's memory.
      void queryClient.invalidateQueries({ queryKey: ["lead-funnels"] });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{COPY.newFunnel.title}</DialogTitle>
          {/* Radix warns when a dialog has no description, and a screen reader
              opening this one heard the title and nothing else. */}
          <DialogDescription>{COPY.newFunnel.subtitle}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="funnel-name">{COPY.newFunnel.name}</Label>
            <Input
              id="funnel-name"
              value={name}
              maxLength={NAME_MAX}
              placeholder={COPY.newFunnel.namePlaceholder}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>{COPY.newFunnel.icon}</Label>
            <div className="grid grid-cols-8 gap-1">
              {ICONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={i}
                  aria-pressed={i === icon}
                  onClick={() => setIcon(i)}
                  className={cn(
                    "grid h-8 place-items-center rounded border transition-colors",
                    i === icon
                      ? "border-primary bg-muted text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <Icon icon={i} size={16} />
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>{COPY.newFunnel.accent}</Label>
            <div className="flex flex-wrap gap-2">
              {SELECTABLE_ACCENTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-label={`Identidade ${a}`}
                  aria-pressed={a === accent}
                  onClick={() => setAccent(a)}
                  className={cn(
                    "size-7 rounded-md border-2 transition-colors",
                    getAccentClasses(a).dot,
                    a === accent ? "border-foreground" : "border-transparent",
                  )}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="funnel-description">{COPY.newFunnel.description}</Label>
            <Textarea
              id="funnel-description"
              value={description}
              rows={2}
              placeholder={COPY.newFunnel.descriptionPlaceholder}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-severity-critical">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            {COPY.newFunnel.cancel}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || !storeId}>
            {COPY.newFunnel.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
