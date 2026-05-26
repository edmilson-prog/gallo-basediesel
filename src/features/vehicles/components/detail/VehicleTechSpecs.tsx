import { useState } from "react";
import { toast } from "sonner";
import type { IVehicle } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/Icon";
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
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { formatDateBR } from "@/shared/utils/format";
import { formatKm, formatPlate, maskVin } from "../../utils/vehicleDisplay";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.tech;
const SECTION_COPY = VEHICLE_STRINGS.detail.sections;

const LARGE_KM_THRESHOLD = 50_000;

export interface IVehicleTechSpecsProps {
  vehicle: IVehicle;
  canEdit: boolean;
  onUpdated: () => void;
}

export function VehicleTechSpecs({ vehicle, canEdit, onUpdated }: IVehicleTechSpecsProps) {
  const provider = useVehiclesProvider();
  const [editingKm, setEditingKm] = useState(false);
  const [kmDraft, setKmDraft] = useState<string>(vehicle.currentKm?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmLarge, setConfirmLarge] = useState(false);
  const [pendingKm, setPendingKm] = useState<number | null>(null);
  const [revealVin, setRevealVin] = useState(false);

  const startEdit = () => {
    setEditingKm(true);
    setKmDraft(vehicle.currentKm?.toString() ?? "");
  };

  const saveKm = async (kmValue: number) => {
    setBusy(true);
    try {
      await provider.update(vehicle.id, { currentKm: kmValue });
      auditLog({
        action: "vehicle.km_updated",
        resource: "vehicle",
        resourceId: vehicle.id,
        before: { currentKm: vehicle.currentKm },
        after: { currentKm: kmValue },
      });
      toast.success("Km atualizado.");
      onUpdated();
      setEditingKm(false);
    } catch {
      toast.error("Não foi possível atualizar o km.");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = () => {
    const num = Number(kmDraft);
    if (!Number.isFinite(num) || num < 0) {
      toast.error("Informe um valor numérico válido.");
      return;
    }
    const diff = Math.abs(num - (vehicle.currentKm ?? 0));
    if (vehicle.currentKm !== undefined && diff > LARGE_KM_THRESHOLD) {
      setPendingKm(num);
      setConfirmLarge(true);
      return;
    }
    void saveKm(num);
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {SECTION_COPY.tech}
      </h2>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SpecRow label={COPY.engine} value={vehicle.engine || "—"} />
        <SpecRow
          label={COPY.vin}
          value={
            vehicle.vin ? (
              <span className="inline-flex items-center gap-2 font-mono">
                <span>{revealVin ? vehicle.vin : maskVin(vehicle.vin)}</span>
                <button
                  type="button"
                  onClick={() => setRevealVin((v) => !v)}
                  className="text-xs text-primary hover:underline"
                >
                  {revealVin ? COPY.vinHide : COPY.vinReveal}
                </button>
              </span>
            ) : (
              "—"
            )
          }
        />
        <SpecRow label={COPY.plate} value={formatPlate(vehicle.plate)} mono />
        <SpecRow
          label={COPY.currentKm}
          value={
            editingKm ? (
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  value={kmDraft}
                  onChange={(e) => setKmDraft(e.target.value)}
                  className="h-7 w-32 text-xs"
                  autoFocus
                />
                <Button size="sm" variant="ghost" disabled={busy} onClick={handleSave}>
                  {COPY.save}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setEditingKm(false)}
                >
                  {COPY.cancel}
                </Button>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2">
                <span>{formatKm(vehicle.currentKm)}</span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={startEdit}
                    className="text-xs text-primary hover:underline"
                  >
                    <Icon icon="mdi:pencil" size={12} className="-mt-0.5 inline" /> {COPY.updateKm}
                  </button>
                )}
              </div>
            )
          }
        />
        <SpecRow label={COPY.createdAt} value={formatDateBR(vehicle.createdAt)} />
      </dl>

      <AlertDialog open={confirmLarge} onOpenChange={setConfirmLarge}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar mudança grande?</AlertDialogTitle>
            <AlertDialogDescription>{COPY.largeKmChange}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setConfirmLarge(false);
                setPendingKm(null);
              }}
            >
              {COPY.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmLarge(false);
                if (pendingKm !== null) void saveKm(pendingKm);
                setPendingKm(null);
              }}
            >
              {COPY.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function SpecRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={`mt-0.5 text-sm text-foreground ${mono ? "font-mono uppercase" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
