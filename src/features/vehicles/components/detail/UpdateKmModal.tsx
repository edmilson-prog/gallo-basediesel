import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { IVehicle } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/Icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { formatKm } from "../../utils/vehicleDisplay";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.kmModal;

const LARGE_KM_THRESHOLD = 50_000;

export interface IUpdateKmModalProps {
  open: boolean;
  vehicle: IVehicle;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Odometer entry, promoted from an inline field in the tech-specs card to a
 * modal any surface can call — the facts strip, the health block and the
 * recommendations all need it, and each one used to have to own its own editor.
 *
 * A jump larger than 50.000 km asks for confirmation before saving: it is far
 * more often a typo than a truck that drove around the world.
 */
export function UpdateKmModal({ open, vehicle, onClose, onSaved }: IUpdateKmModalProps) {
  const provider = useVehiclesProvider();
  const [draft, setDraft] = useState("");
  const [confirmingLarge, setConfirmingLarge] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(vehicle.currentKm?.toString() ?? "");
    setConfirmingLarge(false);
  }, [open, vehicle.currentKm]);

  const parsed = Number(draft);
  const isValid = draft.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
  const isLargeChange =
    isValid &&
    typeof vehicle.currentKm === "number" &&
    Math.abs(parsed - vehicle.currentKm) > LARGE_KM_THRESHOLD;

  const save = async () => {
    if (!isValid) {
      toast.error(COPY.invalid);
      return;
    }
    if (isLargeChange && !confirmingLarge) {
      setConfirmingLarge(true);
      return;
    }
    const value = Math.round(parsed);
    setBusy(true);
    try {
      await provider.update(vehicle.id, { currentKm: value });
      auditLog({
        action: "vehicle.km_updated",
        resource: "vehicle",
        resourceId: vehicle.id,
        before: { currentKm: vehicle.currentKm },
        after: { currentKm: value },
      });
      toast.success(COPY.saved);
      onSaved();
      onClose();
    } catch {
      toast.error(COPY.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon="mdi:counter" size={18} className="text-muted-foreground" />
            {COPY.title}
          </DialogTitle>
          <DialogDescription className="sr-only">{COPY.label}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="vehicle-km" className="text-xs">
            {COPY.label}
          </Label>
          <Input
            id="vehicle-km"
            type="number"
            min={0}
            autoFocus
            value={draft}
            placeholder={COPY.placeholder}
            onChange={(e) => {
              setDraft(e.target.value);
              setConfirmingLarge(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void save();
              }
            }}
          />
          {typeof vehicle.currentKm === "number" && (
            <p className="text-xs text-muted-foreground">
              {COPY.previous(formatKm(vehicle.currentKm))}
            </p>
          )}
          {confirmingLarge && (
            <p className="flex items-start gap-2 rounded-md border border-severity-warning/30 bg-severity-warning/10 px-3 py-2 text-xs text-severity-warning">
              <Icon icon="mdi:alert-outline" size={14} className="mt-px shrink-0" />
              {COPY.largeChange}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {COPY.cancel}
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!isValid || busy}>
            {confirmingLarge ? COPY.confirm : COPY.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
