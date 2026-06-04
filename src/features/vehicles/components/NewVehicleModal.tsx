import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  ICustomer,
  ID,
  IVehicle,
  VehicleCadastroMode,
  VehicleCadastroStatus,
} from "@/shared/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { VEHICLE_STRINGS } from "../i18n/pt-BR";
import { VEHICLE_BRANDS } from "../utils/listFilters";

const COPY = VEHICLE_STRINGS.newModal;

const CURRENT_YEAR = new Date().getFullYear();

export interface INewVehicleModalProps {
  open: boolean;
  onClose: () => void;
  cadastroMode: VehicleCadastroMode;
  /** Pre-selected customer (used when launching from a customer profile). */
  presetCustomer?: ICustomer | null;
  onCreated?: (vehicle: IVehicle) => void;
}

export function NewVehicleModal({
  open,
  onClose,
  cadastroMode,
  presetCustomer = null,
  onCreated,
}: INewVehicleModalProps) {
  const vehiclesProvider = useVehiclesProvider();
  const customersProvider = useCustomersProvider();
  const { currentUser } = useAuth();
  const role = useCurrentRole();
  const { currentStoreId } = useCurrentStore();
  const isManagerOrOwner = role === "Owner" || role === "Gestor";

  const [customerId, setCustomerId] = useState<ID | "">(presetCustomer?.id ?? "");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerListOpen, setCustomerListOpen] = useState(false);
  const [brand, setBrand] = useState("Volvo");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [engine, setEngine] = useState("");
  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [currentKm, setCurrentKm] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setCustomerId(presetCustomer?.id ?? "");
    setCustomerSearch(
      presetCustomer
        ? presetCustomer.type === "B2B"
          ? presetCustomer.nomeFantasia
          : presetCustomer.fullName
        : "",
    );
    setBrand("Volvo");
    setModel("");
    setYear(CURRENT_YEAR);
    setEngine("");
    setPlate("");
    setVin("");
    setCurrentKm("");
    setErrors({});
  }, [open, presetCustomer]);

  // Busca de cliente (autocomplete simples)
  const customersQuery = useQuery({
    queryKey: ["vehicles-customer-search", customerSearch, currentStoreId] as const,
    enabled: open && customerSearch.trim().length > 0 && !presetCustomer,
    staleTime: 30_000,
    queryFn: () =>
      customersProvider.list({
        search: customerSearch.trim(),
        pageSize: 8,
        storeId: isManagerOrOwner ? undefined : (currentStoreId ?? undefined),
        sellerIds: !isManagerOrOwner && currentUser?.sellerId ? [currentUser.sellerId] : undefined,
      }),
  });
  const customerSuggestions = customersQuery.data?.data ?? [];

  // Vehicles do cliente selecionado (para detectar duplicata de placa)
  const customerVehiclesQuery = useQuery({
    queryKey: ["vehicles-for-customer", customerId] as const,
    enabled: open && customerId !== "",
    staleTime: 30_000,
    queryFn: () => vehiclesProvider.listByCustomer(customerId as ID),
  });

  const targetStoreId = useMemo(() => {
    if (presetCustomer) return presetCustomer.storeId;
    const found = customerSuggestions.find((c) => c.id === customerId);
    return found?.storeId ?? currentStoreId ?? "store-matriz";
  }, [presetCustomer, customerSuggestions, customerId, currentStoreId]);

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!customerId) e.customer = COPY.requiredCustomer;
    if (!model.trim()) e.model = COPY.requiredModel;
    if (!year || year < 1990 || year > CURRENT_YEAR + 1) e.year = COPY.invalidYear;
    if (vin.trim().length > 0 && !/^[A-Za-z0-9]{17}$/.test(vin.trim())) e.vin = COPY.invalidVin;
    if (plate.trim().length > 0) {
      const cleaned = plate.replace(/[^A-Za-z0-9]/g, "");
      if (cleaned.length !== 7) e.plate = COPY.invalidPlate;
    }
    if (plate.trim().length > 0 && customerVehiclesQuery.data) {
      const cleaned = plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      const dup = customerVehiclesQuery.data.find(
        (v) => (v.plate ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() === cleaned,
      );
      if (dup) e.plate = COPY.duplicatePlate(cleaned);
    }
    return e;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const next = validate();
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const status: VehicleCadastroStatus =
        cadastroMode === "auto_aprovado" ? "aprovado" : "pendente";
      const kmNum = currentKm.trim() ? Number(currentKm) : undefined;
      const created = await vehiclesProvider.create({
        customerId: customerId as ID,
        brand,
        model: model.trim(),
        year,
        engine: engine.trim(),
        modelId: null,
        plate: plate.trim() ? plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase() : undefined,
        vin: vin.trim() ? vin.trim().toUpperCase() : undefined,
        currentKm: Number.isFinite(kmNum) ? kmNum : undefined,
        cadastroStatus: status,
      } as Omit<IVehicle, "id" | "createdAt" | "serviceHistory">);
      auditLog({
        action: "vehicle.created",
        resource: "vehicle",
        resourceId: created.id,
        storeId: targetStoreId,
        after: {
          customerId,
          brand,
          model: model.trim(),
          year,
          cadastroStatus: status,
        },
      });
      toast.success(status === "aprovado" ? COPY.createdAuto : COPY.createdPending);
      onCreated?.(created);
      onClose();
    } catch {
      toast.error(COPY.createError);
    } finally {
      setBusy(false);
    }
  };

  const modeDescription =
    cadastroMode === "auto_aprovado"
      ? COPY.descriptionAuto
      : cadastroMode === "aprovacao_obrigatoria"
        ? COPY.descriptionApproval
        : COPY.descriptionManual;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{COPY.title}</DialogTitle>
            <DialogDescription>{modeDescription}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-3">
            {/* Cliente */}
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="vehicle-customer">
                {COPY.customer}
              </Label>
              {presetCustomer ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                  <Icon icon="mdi:account" size={14} className="text-muted-foreground" />
                  <span className="truncate">
                    {presetCustomer.type === "B2B"
                      ? presetCustomer.nomeFantasia
                      : presetCustomer.fullName}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {presetCustomer.type}
                  </span>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    id="vehicle-customer"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setCustomerListOpen(true);
                      if (customerId !== "") setCustomerId("");
                    }}
                    onFocus={() => setCustomerListOpen(true)}
                    placeholder={COPY.customerPlaceholder}
                    className="h-9 text-sm"
                    aria-invalid={Boolean(errors.customer)}
                  />
                  {customerListOpen && customerSuggestions.length > 0 && customerId === "" && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[200px] overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
                      {customerSuggestions.map((c) => {
                        const name = c.type === "B2B" ? c.nomeFantasia : c.fullName;
                        return (
                          <button
                            type="button"
                            key={c.id}
                            onClick={() => {
                              setCustomerId(c.id);
                              setCustomerSearch(name);
                              setCustomerListOpen(false);
                            }}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                          >
                            <Icon icon="mdi:account" size={12} className="text-muted-foreground" />
                            <span className="truncate">{name}</span>
                            <span className="ml-auto text-[10px] text-muted-foreground">
                              {c.type}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {errors.customer && <p className="text-[11px] text-destructive">{errors.customer}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{COPY.brand}</Label>
                <Select value={brand} onValueChange={setBrand}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_BRANDS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="vehicle-model">
                  {COPY.model}
                </Label>
                <Input
                  id="vehicle-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={COPY.modelPlaceholder}
                  className="h-9 text-sm"
                  aria-invalid={Boolean(errors.model)}
                />
                {errors.model && <p className="text-[11px] text-destructive">{errors.model}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="vehicle-year">
                  {COPY.year}
                </Label>
                <Input
                  id="vehicle-year"
                  type="number"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value) || 0)}
                  className="h-9 text-sm"
                  aria-invalid={Boolean(errors.year)}
                />
                {errors.year && <p className="text-[11px] text-destructive">{errors.year}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="vehicle-engine">
                  {COPY.engine}
                </Label>
                <Input
                  id="vehicle-engine"
                  value={engine}
                  onChange={(e) => setEngine(e.target.value)}
                  placeholder={COPY.enginePlaceholder}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="vehicle-plate">
                  {COPY.plate}
                </Label>
                <Input
                  id="vehicle-plate"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  placeholder={COPY.platePlaceholder}
                  className={cn("h-9 font-mono uppercase text-sm")}
                  aria-invalid={Boolean(errors.plate)}
                />
                {errors.plate && <p className="text-[11px] text-destructive">{errors.plate}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="vehicle-vin">
                  {COPY.vin}
                </Label>
                <Input
                  id="vehicle-vin"
                  value={vin}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                  placeholder={COPY.vinPlaceholder}
                  maxLength={17}
                  className="h-9 font-mono uppercase text-sm"
                  aria-invalid={Boolean(errors.vin)}
                />
                {errors.vin && <p className="text-[11px] text-destructive">{errors.vin}</p>}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs" htmlFor="vehicle-km">
                {COPY.currentKm}
              </Label>
              <Input
                id="vehicle-km"
                type="number"
                value={currentKm}
                onChange={(e) => setCurrentKm(e.target.value)}
                className="h-9 text-sm"
                placeholder="0"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              {COPY.cancel}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? COPY.saving : COPY.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
