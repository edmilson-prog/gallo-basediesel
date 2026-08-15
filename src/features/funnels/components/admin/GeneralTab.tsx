import { useState } from "react";
import type { FunnelAccent, ILeadFunnel } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FUNNEL_ACCENT_SLOTS, getAccentClasses } from "../../engine/accentClasses";
import { COPY } from "../../i18n/pt-BR";

/** The same curated set the creation modal offers — one vocabulary, not two. */
const ICONS = [
  "mdi:filter-variant", "mdi:air-filter", "mdi:oil", "mdi:engine-outline",
  "mdi:car-turbocharger", "mdi:car-brake-disc", "mdi:car-battery", "mdi:pipe",
  "mdi:cog-outline", "mdi:wrench-outline", "mdi:fuel", "mdi:radiator",
  "mdi:tire", "mdi:truck-outline", "mdi:lightning-bolt", "mdi:thermometer",
  "mdi:gauge", "mdi:hydraulic-oil-level", "mdi:screw-lag", "mdi:cog-transfer-outline",
  "mdi:snowflake", "mdi:shield-check-outline", "mdi:package-variant-closed", "mdi:hammer-wrench",
] as const;

/** Slot 0 is the neutral one, reserved for the default triage funnel. */
const SELECTABLE: FunnelAccent[] = FUNNEL_ACCENT_SLOTS.filter((s) => s !== 0);

export interface IGeneralTabProps {
  funnel: ILeadFunnel;
  draft: Pick<ILeadFunnel, "name" | "icon" | "accent" | "description" | "entryAlertThreshold">;
  onChange: (patch: Partial<IGeneralTabProps["draft"]>) => void;
  onArchive: () => void;
}

export function GeneralTab({ funnel, draft, onChange, onArchive }: IGeneralTabProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor="funnel-name">{COPY.admin.general.name}</Label>
        <Input
          id="funnel-name"
          value={draft.name}
          maxLength={40}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      <div className="grid gap-1.5">
        <Label>{COPY.admin.general.icon}</Label>
        <div className="flex flex-wrap gap-1">
          {ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              aria-label={icon}
              aria-pressed={draft.icon === icon}
              onClick={() => onChange({ icon })}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                draft.icon === icon
                  ? "border-primary bg-accent text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon icon={icon} size={16} aria-hidden />
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>{COPY.admin.general.accent}</Label>
        {/* Nine enumerated slots, never a hex — the user picks WHICH identity
            the funnel occupies, not a colour (owner decision 7). */}
        <div className="flex gap-1.5">
          {SELECTABLE.map((slot) => (
            <button
              key={slot}
              type="button"
              aria-label={`${slot}`}
              aria-pressed={draft.accent === slot}
              onClick={() => onChange({ accent: slot })}
              className={cn(
                "size-7 rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                getAccentClasses(slot).dot,
                draft.accent === slot
                  ? "ring-2 ring-ring ring-offset-2"
                  : "opacity-60 hover:opacity-100",
              )}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="funnel-description">{COPY.admin.general.descriptionField}</Label>
        <Textarea
          id="funnel-description"
          rows={2}
          value={draft.description ?? ""}
          onChange={(e) => onChange({ description: e.target.value || undefined })}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="funnel-threshold">{COPY.admin.general.threshold}</Label>
        <Input
          id="funnel-threshold"
          type="number"
          min={1}
          className="w-32"
          value={draft.entryAlertThreshold}
          onChange={(e) => onChange({ entryAlertThreshold: Math.max(1, Number(e.target.value)) })}
        />
        <p className="text-[11px] text-muted-foreground">{COPY.admin.general.thresholdHint}</p>
      </div>

      <div className="border-t border-border pt-4">
        {funnel.isDefault ? (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Icon icon="mdi:lock-outline" size={12} aria-hidden />
            {COPY.admin.general.cannotArchiveDefault}
          </p>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
            <Icon icon="mdi:archive-outline" size={16} aria-hidden />
            {COPY.admin.general.archive}
          </Button>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{COPY.admin.general.archiveTitle(funnel.name)}</AlertDialogTitle>
            {/* Archive, never delete: a funnel with history does not vanish,
                because the reports depend on it. */}
            <AlertDialogDescription>{COPY.admin.general.archiveBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{COPY.fiche.removeCancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                onArchive();
              }}
            >
              {COPY.admin.general.archiveConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
