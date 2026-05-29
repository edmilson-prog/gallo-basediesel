import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import type { ID, IPortalRequestItem, PortalRequestUrgency } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/Icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { usePortalSession } from "../hooks/usePortalSession";
import { usePortalVehicles } from "../hooks/usePortalResources";
import { usePortalStore } from "../store/portalStore";
import { PortalBanner } from "../components/PortalBanner";
import { PORTAL_STRINGS as S } from "../i18n/pt-BR";

export interface IPortalNewRequestSearch {
  vehicleId?: string;
}

type Step = 1 | 2 | 3 | 4;

export function PortalNewRequestPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/portal/solicitacoes/nova" }) as IPortalNewRequestSearch;
  const { user, customer } = usePortalSession();
  const { data: vehicles = [] } = usePortalVehicles(customer?.id);
  const addRequest = usePortalStore((s) => s.addRequest);

  const [step, setStep] = useState<Step>(1);
  const [items, setItems] = useState<IPortalRequestItem[]>([]);
  const [draftDesc, setDraftDesc] = useState("");
  const [draftQty, setDraftQty] = useState(1);
  const [draftVehicle, setDraftVehicle] = useState<ID | undefined>(search.vehicleId);
  const [urgency, setUrgency] = useState<PortalRequestUrgency>("normal");
  const [scheduledFor, setScheduledFor] = useState("");
  const [notes, setNotes] = useState("");

  if (!user?.canCreateRequests) {
    return (
      <EmptyState
        icon="mdi:lock-outline"
        title={S.noAccessTitle}
        description={S.requestNoPermission}
        actionLabel={S.back}
        actionTo="/portal/solicitacoes"
      />
    );
  }

  const addItem = () => {
    if (!draftDesc.trim()) return;
    setItems((prev) => [
      ...prev,
      {
        id: `pri-${Date.now()}`,
        description: draftDesc.trim(),
        quantity: Math.max(1, draftQty),
        targetVehicleId: draftVehicle,
      },
    ]);
    setDraftDesc("");
    setDraftQty(1);
  };

  const handleSubmit = () => {
    if (!user || !customer || items.length === 0) return;
    const request = addRequest({
      customerId: customer.id,
      requestedBy: user.id,
      items,
      urgency,
      scheduledFor:
        urgency === "programada" && scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
      notes: notes || undefined,
      storeId: "store-matriz",
    });
    auditLog({
      actorId: user.id,
      action: "portal_request_create",
      resource: "quote",
      resourceId: request.id,
      after: { customerId: customer.id, items: items.length, urgency },
      storeId: "store-matriz",
    });
    toast.success(S.reqCreated);
    void navigate({ to: "/portal/solicitacoes/$id", params: { id: request.id } });
  };

  const vehicleLabel = (id: ID | undefined) => {
    if (!id) return "—";
    const v = vehicles.find((x) => x.id === id);
    return v ? `${v.brand} ${v.model} (${v.plate ?? "s/ placa"})` : "—";
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-2xl font-semibold text-foreground">{S.requestsNew}</h1>

      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                step >= n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {n}
            </span>
            {n < 4 && <span className="h-0.5 flex-1 bg-border" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card className="space-y-4 p-5">
          <p className="text-sm font-medium text-foreground">{S.reqStepItems}</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_5rem]">
            <Input
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              placeholder={S.reqItemPlaceholder}
            />
            <Input
              type="number"
              min={1}
              value={draftQty}
              onChange={(e) => setDraftQty(Number(e.target.value))}
            />
          </div>
          <Select
            value={draftVehicle ?? "none"}
            onValueChange={(v) => setDraftVehicle(v === "none" ? undefined : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Veículo de destino (opcional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem veículo específico</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.brand} {v.model} ({v.plate ?? "s/ placa"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={addItem} disabled={!draftDesc.trim()}>
            <Icon icon="mdi:plus" size={16} className="mr-1" aria-hidden />
            {S.reqAddItem}
          </Button>

          <div className="space-y-1.5 border-t border-border pt-3">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum item adicionado.</p>
            ) : (
              items.map((it) => (
                <div key={it.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {it.quantity}× {it.description}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {vehicleLabel(it.targetVehicleId)}
                  </span>
                </div>
              ))
            )}
          </div>

          <Button className="w-full" disabled={items.length === 0} onClick={() => setStep(2)}>
            Continuar
          </Button>
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-4 p-5">
          <p className="text-sm font-medium text-foreground">{S.reqStepUrgency}</p>
          <Select value={urgency} onValueChange={(v) => setUrgency(v as PortalRequestUrgency)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">{S.reqUrgencyNormal}</SelectItem>
              <SelectItem value="urgente">{S.reqUrgencyUrgent}</SelectItem>
              <SelectItem value="programada">{S.reqUrgencyScheduled}</SelectItem>
            </SelectContent>
          </Select>
          {urgency === "programada" && (
            <div className="space-y-1.5">
              <Label htmlFor="req-date">{S.reqScheduledFor}</Label>
              <Input
                id="req-date"
                type="date"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
              Voltar
            </Button>
            <Button className="flex-1" onClick={() => setStep(3)}>
              Continuar
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-4 p-5">
          <p className="text-sm font-medium text-foreground">{S.reqStepNotes}</p>
          <Textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={S.reqNotes}
          />
          <PortalBanner text="Anexar fotos disponível na Fase 2." />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
              Voltar
            </Button>
            <Button className="flex-1" onClick={() => setStep(4)}>
              Continuar
            </Button>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="space-y-4 p-5">
          <p className="text-sm font-medium text-foreground">{S.reqStepReview}</p>
          <div className="space-y-1 text-sm">
            {items.map((it) => (
              <div key={it.id} className="flex justify-between">
                <span className="text-foreground">
                  {it.quantity}× {it.description}
                </span>
                <span className="text-xs text-muted-foreground">
                  {vehicleLabel(it.targetVehicleId)}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-2 text-sm text-muted-foreground">
            Urgência: <span className="text-foreground">{urgency}</span>
          </div>

          {customer?.portalContract?.discountPct ? (
            <div className="space-y-1 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                <Icon icon="mdi:sale" size={16} className="text-primary" aria-hidden />
                Desconto de contrato: {customer.portalContract.discountPct}%
              </p>
              {customer.portalContract.categoryDiscounts &&
                Object.keys(customer.portalContract.categoryDiscounts).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Descontos especiais por categoria:{" "}
                    {Object.entries(customer.portalContract.categoryDiscounts)
                      .map(([cat, pct]) => `${cat} ${pct}%`)
                      .join(", ")}
                    .
                  </p>
                )}
              <p className="text-xs text-muted-foreground">
                Aplicado automaticamente ao orçamento que a GALLO emitir.
              </p>
            </div>
          ) : null}
          <PortalBanner text="Catálogo personalizado completo (preços por contrato em tempo real) disponível na Fase 2." />

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep(3)}>
              Voltar
            </Button>
            <Button className="flex-1" onClick={handleSubmit}>
              {S.reqSubmit}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
