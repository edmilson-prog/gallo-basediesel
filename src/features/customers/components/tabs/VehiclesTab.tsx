import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ICustomer, IVehicle } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
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
import { cn } from "@/lib/utils";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { useSettingsProvider } from "@/providers/data/hooks/useSettingsProvider";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { formatDateBR } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { TabSkeleton } from "../TabSkeleton";
import { TabEmptyState } from "../TabEmptyState";

const COPY = CUSTOMER_STRINGS.vehicles;

const VEHICLE_ICON = "mdi:truck-outline";

export interface IVehiclesTabProps {
  customer: ICustomer;
}

export function VehiclesTab({ customer }: IVehiclesTabProps) {
  const provider = useVehiclesProvider();
  const settings = useSettingsProvider();
  const canCreate = usePermission("vehicle", "create");
  const [addOpen, setAddOpen] = useState(false);

  const vehiclesQuery = useQuery({
    queryKey: ["customer-vehicles", customer.id] as const,
    staleTime: 60 * 1000,
    queryFn: () => provider.listByCustomer(customer.id),
  });

  const settingsQuery = useQuery({
    queryKey: ["platform-settings", customer.storeId] as const,
    staleTime: 30 * 60 * 1000,
    queryFn: () => settings.get(customer.storeId).catch(() => null),
  });

  const cadastroMode = settingsQuery.data?.vehicleCadastroMode ?? "aprovacao_obrigatoria";
  const vehicles = vehiclesQuery.data ?? [];

  const handleAdded = () => {
    setAddOpen(false);
    void vehiclesQuery.refetch();
  };

  return (
    <div className="space-y-3">
      <header className="flex items-center gap-2">
        <Icon icon={VEHICLE_ICON} size={16} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{COPY.title}</h3>
        {canCreate && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto gap-1"
            onClick={() => setAddOpen(true)}
          >
            <Icon icon="mdi:plus" size={14} />
            {COPY.addVehicle}
          </Button>
        )}
      </header>

      {vehiclesQuery.isLoading ? (
        <TabSkeleton rows={3} rowHeight="h-24" />
      ) : vehicles.length === 0 ? (
        <TabEmptyState icon="mdi:truck-remove-outline" message={COPY.empty} />
      ) : (
        <ul className="space-y-2">
          {vehicles.map((v) => (
            <VehicleCard key={v.id} vehicle={v} />
          ))}
        </ul>
      )}

      <AddVehicleDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        customer={customer}
        cadastroMode={cadastroMode}
        onAdded={handleAdded}
      />
    </div>
  );
}

function VehicleCard({ vehicle }: { vehicle: IVehicle }) {
  const recent = [...vehicle.serviceHistory]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  return (
    <li className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon icon={VEHICLE_ICON} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {vehicle.brand} {vehicle.model}{" "}
            <span className="font-normal text-muted-foreground">· {vehicle.year}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">{vehicle.engine}</p>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {vehicle.plate && (
              <span>
                <strong className="font-semibold">{COPY.plate}:</strong>{" "}
                <span className="font-mono uppercase text-foreground">{vehicle.plate}</span>
              </span>
            )}
            {typeof vehicle.currentKm === "number" && (
              <span>
                <strong className="font-semibold">{COPY.km}:</strong>{" "}
                <span className="text-foreground">{vehicle.currentKm.toLocaleString("pt-BR")}</span>
              </span>
            )}
          </div>
        </div>
        {vehicle.cadastroStatus === "pendente" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
            <Icon icon="mdi:clock-outline" size={10} />
            {COPY.pendingApproval}
          </span>
        )}
      </div>

      <div className="mt-3 border-t border-border pt-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {COPY.serviceHistory}
        </p>
        {recent.length === 0 ? (
          <p className="mt-1 text-xs italic text-muted-foreground">{COPY.noService}</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-[11px]">
            {recent.map((entry) => (
              <li key={entry.id} className="flex items-baseline justify-between gap-2">
                <span className="truncate text-muted-foreground">
                  {entry.parts.slice(0, 2).join(", ")}
                  {entry.parts.length > 2 ? "…" : ""}
                </span>
                <span className="text-foreground">{formatDateBR(entry.date)}</span>
              </li>
            ))}
          </ul>
        )}
        {vehicle.serviceHistory.length > 3 && (
          <p className="mt-1 text-[10px] italic text-muted-foreground">{COPY.viewAll}</p>
        )}
      </div>
    </li>
  );
}

interface IAddVehicleDialogProps {
  open: boolean;
  onClose: () => void;
  customer: ICustomer;
  cadastroMode: "aprovacao_obrigatoria" | "auto_aprovado";
  onAdded: () => void;
}

function AddVehicleDialog({
  open,
  onClose,
  customer,
  cadastroMode,
  onAdded,
}: IAddVehicleDialogProps) {
  const provider = useVehiclesProvider();
  const [brand, setBrand] = useState("Volvo");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [engine, setEngine] = useState("");
  const [plate, setPlate] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (!brand || !model || !engine) {
      toast.error("Preencha marca, modelo e motor.");
      return;
    }
    setBusy(true);
    try {
      const created = await provider.create({
        customerId: customer.id,
        brand,
        model,
        year,
        engine,
        plate: plate ? plate.toUpperCase() : undefined,
        cadastroStatus: cadastroMode === "auto_aprovado" ? "aprovado" : "pendente",
      } as Parameters<typeof provider.create>[0]);
      auditLog({
        action: "vehicle.created",
        resource: "vehicle",
        resourceId: created.id,
        after: { customerId: customer.id, brand, model, year },
      });
      toast.success(
        cadastroMode === "auto_aprovado"
          ? "Veículo cadastrado."
          : "Veículo enviado para aprovação.",
      );
      onAdded();
    } catch {
      toast.error("Não foi possível cadastrar o veículo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{COPY.addVehicle}</DialogTitle>
          <DialogDescription>
            {cadastroMode === "auto_aprovado"
              ? "O veículo será cadastrado imediatamente."
              : "O cadastro ficará pendente até aprovação do gestor."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Marca">
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </Field>
          <Field label="Modelo">
            <Input value={model} onChange={(e) => setModel(e.target.value)} />
          </Field>
          <Field label="Ano">
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || year)}
            />
          </Field>
          <Field label="Motor">
            <Input value={engine} onChange={(e) => setEngine(e.target.value)} />
          </Field>
          <Field label="Placa (opcional)" className="col-span-2">
            <Input
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="ABC1D23"
              className="font-mono uppercase"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
