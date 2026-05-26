import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { ICarteiraTransfer, ID, ISeller } from "@/shared/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/Icon";
import { useCreateTransfer } from "../hooks/useTransferMutations";
import { useSellerCustomers } from "../hooks/useStoreCustomers";
import { CARTEIRA_STRINGS } from "../i18n/pt-BR";
import { dateInputToISO, dateInputValue, formatDate } from "../utils/formatters";
import { getCustomerName } from "@/features/customers/utils/customerDisplay";

export interface INewTemporaryTransferModalProps {
  open: boolean;
  sellers: ISeller[];
  storeId: ID;
  currentUserId: ID;
  activeTransfers: ICarteiraTransfer[];
  onClose: () => void;
  onCreated?: (transfer: ICarteiraTransfer) => void;
}

type Reason = keyof typeof CARTEIRA_STRINGS.modals.temporary.reasons;

const REASON_OPTIONS: Reason[] = ["ferias", "licenca", "treinamento", "outro"];

function reasonLabel(value: Reason) {
  return CARTEIRA_STRINGS.modals.temporary.reasons[value];
}

export function NewTemporaryTransferModal({
  open,
  sellers,
  storeId,
  currentUserId,
  activeTransfers,
  onClose,
  onCreated,
}: INewTemporaryTransferModalProps) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const [fromSellerId, setFromSellerId] = useState<ID | "">("");
  const [toSellerId, setToSellerId] = useState<ID | "">("");
  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(tomorrow);
  const [reason, setReason] = useState<Reason | "">("");
  const [details, setDetails] = useState("");
  const [coverageMode, setCoverageMode] = useState<"all" | "subset">("all");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<ID>>(new Set());
  const [allowConflict, setAllowConflict] = useState(false);

  const mutation = useCreateTransfer();

  useEffect(() => {
    if (open) {
      setFromSellerId("");
      setToSellerId("");
      setStartDate(today);
      setEndDate(tomorrow);
      setReason("");
      setDetails("");
      setCoverageMode("all");
      setSelectedCustomerIds(new Set());
      setAllowConflict(false);
    }
  }, [open, today, tomorrow]);

  const customersQuery = useSellerCustomers(fromSellerId || undefined, storeId);
  const sellerCustomers = useMemo(
    () => customersQuery.data?.data ?? [],
    [customersQuery.data?.data],
  );

  const conflict = useMemo(() => {
    if (!fromSellerId) return null;
    return (
      activeTransfers.find(
        (t) => t.type === "temporary" && t.fromSellerId === fromSellerId && t.status === "active",
      ) ?? null
    );
  }, [activeTransfers, fromSellerId]);

  const sameSeller = fromSellerId !== "" && fromSellerId === toSellerId;
  const endBeforeStart = startDate && endDate && new Date(endDate) <= new Date(startDate);

  const customerIds = useMemo<ID[]>(() => {
    if (coverageMode === "all") return sellerCustomers.map((c) => c.id);
    return Array.from(selectedCustomerIds);
  }, [coverageMode, sellerCustomers, selectedCustomerIds]);

  const fromName = sellers.find((s) => s.id === fromSellerId)?.fullName ?? "—";
  const toName = sellers.find((s) => s.id === toSellerId)?.fullName ?? "—";

  const canSubmit =
    Boolean(fromSellerId) &&
    Boolean(toSellerId) &&
    !sameSeller &&
    Boolean(startDate) &&
    Boolean(endDate) &&
    !endBeforeStart &&
    Boolean(reason) &&
    customerIds.length > 0 &&
    !mutation.isPending &&
    (!conflict || allowConflict);

  const handleToggleCustomer = (id: ID) => {
    setSelectedCustomerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    const startIso = dateInputToISO(startDate);
    const endIso = dateInputToISO(endDate, true);
    if (!startIso || !endIso) return;
    const reasonLabelText = reason ? reasonLabel(reason as Reason) : "Sem motivo";
    const fullReason = details.trim() ? `${reasonLabelText} — ${details.trim()}` : reasonLabelText;
    try {
      const created = await mutation.mutateAsync({
        storeId,
        type: "temporary",
        fromSellerId: fromSellerId as ID,
        toSellerId: toSellerId as ID,
        customerIds,
        reason: fullReason,
        startDate: startIso,
        endDate: endIso,
        createdBy: currentUserId,
      });
      toast.success(CARTEIRA_STRINGS.modals.temporary.successToast(customerIds.length, toName));
      onCreated?.(created);
      onClose();
    } catch {
      toast.error(CARTEIRA_STRINGS.modals.temporary.failureToast);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !mutation.isPending && onClose()}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{CARTEIRA_STRINGS.modals.temporary.title}</DialogTitle>
            <DialogDescription>{CARTEIRA_STRINGS.modals.temporary.description}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="temp-from">{CARTEIRA_STRINGS.modals.temporary.from}</Label>
              <Select value={fromSellerId} onValueChange={(v) => setFromSellerId(v as ID)}>
                <SelectTrigger id="temp-from">
                  <SelectValue placeholder="Selecionar…" />
                </SelectTrigger>
                <SelectContent>
                  {sellers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="temp-to">{CARTEIRA_STRINGS.modals.temporary.to}</Label>
              <Select
                value={toSellerId}
                onValueChange={(v) => setToSellerId(v as ID)}
                disabled={!fromSellerId}
              >
                <SelectTrigger id="temp-to">
                  <SelectValue placeholder="Selecionar…" />
                </SelectTrigger>
                <SelectContent>
                  {sellers
                    .filter((s) => s.id !== fromSellerId)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.fullName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {sameSeller && (
                <p className="text-xs text-destructive">
                  {CARTEIRA_STRINGS.modals.temporary.sameSellerError}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="temp-start">{CARTEIRA_STRINGS.modals.temporary.startDate}</Label>
              <Input
                id="temp-start"
                type="date"
                value={dateInputValue(dateInputToISO(startDate))}
                onChange={(e) => setStartDate(e.target.value)}
                min={today}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="temp-end">{CARTEIRA_STRINGS.modals.temporary.endDate}</Label>
              <Input
                id="temp-end"
                type="date"
                value={dateInputValue(dateInputToISO(endDate))}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || today}
              />
              {endBeforeStart && (
                <p className="text-xs text-destructive">
                  {CARTEIRA_STRINGS.modals.temporary.endBeforeStartError}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="temp-reason">{CARTEIRA_STRINGS.modals.temporary.reason}</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
                <SelectTrigger id="temp-reason">
                  <SelectValue placeholder={CARTEIRA_STRINGS.modals.temporary.reasonPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {REASON_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {reasonLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="temp-details">{CARTEIRA_STRINGS.modals.temporary.details}</Label>
              <Input
                id="temp-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={CARTEIRA_STRINGS.modals.temporary.detailsPlaceholder}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-sm font-medium text-foreground">
              {CARTEIRA_STRINGS.modals.temporary.coverage}
            </p>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="coverage-mode"
                  checked={coverageMode === "all"}
                  onChange={() => setCoverageMode("all")}
                />
                <span>{CARTEIRA_STRINGS.modals.temporary.coverageAll}</span>
                <span className="text-xs text-muted-foreground">
                  {fromSellerId
                    ? CARTEIRA_STRINGS.modals.temporary.coverageAllHint(sellerCustomers.length)
                    : ""}
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="coverage-mode"
                  checked={coverageMode === "subset"}
                  onChange={() => setCoverageMode("subset")}
                  disabled={!fromSellerId}
                />
                <span>{CARTEIRA_STRINGS.modals.temporary.coverageSubset}</span>
              </label>
            </div>

            {coverageMode === "subset" && fromSellerId && (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border bg-card p-2">
                {customersQuery.isLoading && (
                  <p className="py-3 text-center text-xs text-muted-foreground">Carregando…</p>
                )}
                {!customersQuery.isLoading && sellerCustomers.length === 0 && (
                  <p className="py-3 text-center text-xs text-muted-foreground">
                    Vendedor sem clientes ativos.
                  </p>
                )}
                {sellerCustomers.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedCustomerIds.has(c.id)}
                      onCheckedChange={() => handleToggleCustomer(c.id)}
                    />
                    <span className="truncate">{getCustomerName(c)}</span>
                  </label>
                ))}
              </div>
            )}

            {coverageMode === "subset" && selectedCustomerIds.size === 0 && (
              <p className="text-xs text-destructive">
                {CARTEIRA_STRINGS.modals.temporary.noCustomersError}
              </p>
            )}
          </div>

          {conflict && (
            <Alert>
              <Icon icon="mdi:alert-circle-outline" size={16} />
              <AlertTitle>Conflito de cobertura</AlertTitle>
              <AlertDescription className="flex items-start gap-2">
                <span>
                  {CARTEIRA_STRINGS.modals.temporary.conflictWarning(
                    fromName,
                    formatDate(conflict.endDate),
                  )}
                </span>
                <label className="ml-auto flex items-center gap-1.5 text-xs font-medium">
                  <Checkbox
                    checked={allowConflict}
                    onCheckedChange={(checked) => setAllowConflict(checked === true)}
                  />
                  Continuar mesmo assim
                </label>
              </AlertDescription>
            </Alert>
          )}

          {canSubmit && (
            <Alert>
              <Icon icon="mdi:information-outline" size={16} />
              <AlertTitle>{CARTEIRA_STRINGS.modals.temporary.previewTitle}</AlertTitle>
              <AlertDescription>
                {CARTEIRA_STRINGS.modals.temporary.preview(
                  customerIds.length,
                  fromName,
                  toName,
                  formatDate(dateInputToISO(startDate)),
                  formatDate(dateInputToISO(endDate, true)),
                )}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {mutation.isPending
                ? CARTEIRA_STRINGS.modals.temporary.submitting
                : CARTEIRA_STRINGS.modals.temporary.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
