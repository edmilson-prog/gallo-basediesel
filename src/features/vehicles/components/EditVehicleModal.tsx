import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { IVehicle } from "@/shared/types";
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
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { mergeBrandOptions } from "../utils/vehicleBrands";
import { useVehicleBrandOptions } from "../hooks/useVehicleBrandOptions";

export interface IEditVehicleModalProps {
  open: boolean;
  vehicle: IVehicle;
  onClose: () => void;
  onSaved: () => void;
}

export function EditVehicleModal({ open, vehicle, onClose, onSaved }: IEditVehicleModalProps) {
  const provider = useVehiclesProvider();
  const [brand, setBrand] = useState(vehicle.brand);
  const [model, setModel] = useState(vehicle.model);
  const [year, setYear] = useState(vehicle.year);
  const [engine, setEngine] = useState(vehicle.engine);
  const [plate, setPlate] = useState(vehicle.plate ?? "");
  const [vin, setVin] = useState(vehicle.vin ?? "");
  const [busy, setBusy] = useState(false);
  const { brands } = useVehicleBrandOptions();
  // The vehicle's own brand is folded in so a marque outside the known
  // vocabulary still renders in the trigger instead of a blank field — an
  // untouched save must never look like a deliberate change.
  const brandOptions = useMemo(() => mergeBrandOptions([...brands, brand]), [brands, brand]);

  useEffect(() => {
    if (!open) return;
    setBrand(vehicle.brand);
    setModel(vehicle.model);
    setYear(vehicle.year);
    setEngine(vehicle.engine);
    setPlate(vehicle.plate ?? "");
    setVin(vehicle.vin ?? "");
  }, [open, vehicle]);

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!model.trim()) {
      toast.error("Modelo é obrigatório.");
      return;
    }
    setBusy(true);
    try {
      const before = {
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        engine: vehicle.engine,
        plate: vehicle.plate,
        vin: vehicle.vin,
      };
      const cleanedPlate = plate.trim()
        ? plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
        : undefined;
      const cleanedVin = vin.trim() ? vin.trim().toUpperCase() : undefined;
      await provider.update(vehicle.id, {
        brand,
        model: model.trim(),
        year,
        engine: engine.trim(),
        plate: cleanedPlate,
        vin: cleanedVin,
      });
      auditLog({
        action: "vehicle.updated",
        resource: "vehicle",
        resourceId: vehicle.id,
        before,
        after: { brand, model: model.trim(), year, engine, plate: cleanedPlate, vin: cleanedVin },
      });
      toast.success("Veículo atualizado.");
      onSaved();
      onClose();
    } catch {
      toast.error("Não foi possível atualizar o veículo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Editar veículo</DialogTitle>
            <DialogDescription>
              Ajuste os dados técnicos do veículo. O proprietário não pode ser alterado por aqui.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Marca</Label>
                <Select value={brand} onValueChange={setBrand}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {brandOptions.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Modelo</Label>
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Ano</Label>
                <Input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value) || year)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Motor</Label>
                <Input
                  value={engine}
                  onChange={(e) => setEngine(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Placa</Label>
                <Input
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  className="h-9 font-mono uppercase text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">VIN</Label>
                <Input
                  value={vin}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                  maxLength={17}
                  className="h-9 font-mono uppercase text-sm"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
