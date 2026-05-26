import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IVehicle } from "@/shared/types";
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
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { Switch } from "@/components/ui/switch";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { useOrdersProvider } from "@/providers/data/hooks/useOrdersProvider";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { formatDateBR } from "@/shared/utils/format";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.service;

export interface IAddServiceEntryModalProps {
  open: boolean;
  vehicle: IVehicle;
  onClose: () => void;
  onSaved: () => void;
}

export function AddServiceEntryModal({
  open,
  vehicle,
  onClose,
  onSaved,
}: IAddServiceEntryModalProps) {
  const provider = useVehiclesProvider();
  const ordersProvider = useOrdersProvider();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [km, setKm] = useState<string>(vehicle.currentKm?.toString() ?? "");
  const [parts, setParts] = useState<string[]>([]);
  const [partInput, setPartInput] = useState("");
  const [notes, setNotes] = useState("");
  const [associateOrder, setAssociateOrder] = useState(false);
  const [orderId, setOrderId] = useState<ID | "">("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setDate(new Date().toISOString().slice(0, 10));
    setKm(vehicle.currentKm?.toString() ?? "");
    setParts([]);
    setPartInput("");
    setNotes("");
    setAssociateOrder(false);
    setOrderId("");
    setErrors({});
  }, [open, vehicle.currentKm]);

  const ordersQuery = useQuery({
    queryKey: ["orders-for-customer", vehicle.customerId] as const,
    enabled: open && associateOrder,
    staleTime: 60_000,
    queryFn: () =>
      ordersProvider.list({ customerId: vehicle.customerId, pageSize: 20 }).then((r) => r.data),
  });

  const handleAddPart = () => {
    const value = partInput.trim();
    if (!value) return;
    if (parts.includes(value)) {
      setPartInput("");
      return;
    }
    setParts((prev) => [...prev, value]);
    setPartInput("");
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const next: Record<string, string> = {};
    if (!date) next.date = COPY.requiredDate;
    if (parts.length === 0) next.parts = COPY.requiredParts;
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const kmNum = km.trim() ? Number(km) : undefined;
      await provider.addServiceEntry(vehicle.id, {
        vehicleId: vehicle.id,
        orderId: associateOrder && orderId !== "" ? (orderId as ID) : undefined,
        parts,
        date: new Date(date).toISOString(),
        km: Number.isFinite(kmNum) ? kmNum : undefined,
      });
      auditLog({
        action: "vehicle.service_added",
        resource: "vehicle",
        resourceId: vehicle.id,
        after: { parts, date, km: kmNum, orderId: orderId || undefined },
      });
      toast.success(COPY.created);
      onSaved();
      onClose();
    } catch {
      toast.error(COPY.createError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{COPY.addTitle}</DialogTitle>
            <DialogDescription>{COPY.addDescription}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="svc-date">
                  {COPY.date}
                </Label>
                <Input
                  id="svc-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-9 text-sm"
                  aria-invalid={Boolean(errors.date)}
                />
                {errors.date && <p className="text-[11px] text-destructive">{errors.date}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="svc-km">
                  {COPY.km}
                </Label>
                <Input
                  id="svc-km"
                  type="number"
                  value={km}
                  onChange={(e) => setKm(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{COPY.parts}</Label>
              <div className="flex flex-wrap gap-1 rounded-md border border-border bg-background p-2">
                {parts.map((p) => (
                  <Badge key={p} variant="outline" className="gap-1 text-[11px]">
                    {p}
                    <button
                      type="button"
                      onClick={() => setParts((prev) => prev.filter((x) => x !== p))}
                      aria-label={`Remover ${p}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Icon icon="mdi:close" size={10} />
                    </button>
                  </Badge>
                ))}
                <Input
                  value={partInput}
                  onChange={(e) => setPartInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddPart();
                    }
                  }}
                  placeholder={parts.length === 0 ? "Filtro de óleo, correia…" : ""}
                  className="h-7 flex-1 border-0 px-1 text-xs shadow-none focus-visible:ring-0"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">{COPY.partsHelper}</p>
              {errors.parts && <p className="text-[11px] text-destructive">{errors.parts}</p>}
            </div>

            <div className="space-y-1">
              <Label className="text-xs" htmlFor="svc-notes">
                {COPY.notes}
              </Label>
              <Textarea
                id="svc-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="text-sm"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2">
                <Icon icon="mdi:link-variant" size={14} className="text-muted-foreground" />
                <Label htmlFor="associate-order" className="text-xs">
                  {COPY.associateOrder}
                </Label>
              </div>
              <Switch
                id="associate-order"
                checked={associateOrder}
                onCheckedChange={setAssociateOrder}
              />
            </div>

            {associateOrder && (
              <div className="space-y-1">
                <Label className="text-xs">{COPY.orderSearch}</Label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-1">
                  {ordersQuery.isLoading ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground">Carregando…</p>
                  ) : !ordersQuery.data || ordersQuery.data.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground">
                      Nenhum pedido encontrado para este cliente.
                    </p>
                  ) : (
                    ordersQuery.data.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setOrderId(o.id)}
                        className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent ${
                          orderId === o.id ? "bg-accent text-accent-foreground" : ""
                        }`}
                      >
                        <Icon icon="mdi:receipt-text-outline" size={12} />
                        <span className="font-mono">{o.id}</span>
                        <span className="ml-auto text-muted-foreground">
                          {formatDateBR(o.createdAt)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
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
