import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { ICustomer, ID, ISeller } from "@/shared/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { CARTEIRA_STRINGS } from "../i18n/pt-BR";
import { getCustomerName } from "@/features/customers/utils/customerDisplay";

export interface INewPermanentBatchTransferModalProps {
  open: boolean;
  customers: ICustomer[];
  sellers: ISeller[];
  storeId: ID;
  currentUserId: ID;
  onClose: () => void;
  onCreated?: () => void;
}

export function NewPermanentBatchTransferModal({
  open,
  customers,
  sellers,
  storeId,
  currentUserId,
  onClose,
  onCreated,
}: INewPermanentBatchTransferModalProps) {
  const [toSellerId, setToSellerId] = useState<ID | "">("");
  const [reason, setReason] = useState("");
  const [showList, setShowList] = useState(false);
  const mutation = useCreateTransfer();

  useEffect(() => {
    if (open) {
      setToSellerId("");
      setReason("");
      setShowList(false);
    }
  }, [open]);

  // Only customers with a wallet owner can be transferred; imported pending_review
  // anchors (seller_id null) belong to no carteira. Filter once so count, the
  // preview list, the grouping and the success toast all agree.
  const transferableCustomers = useMemo(
    () => customers.filter((c): c is ICustomer & { sellerId: ID } => c.sellerId !== null),
    [customers],
  );
  const count = transferableCustomers.length;
  const toName = sellers.find((s) => s.id === toSellerId)?.fullName ?? "";
  const missingReason = !reason.trim();

  /**
   * Agrupa por seller origem — pode haver clientes de vendedores diferentes na
   * seleção em lote. Cria 1 ICarteiraTransfer batch por grupo origem→destino.
   */
  const groupsByFrom = useMemo(() => {
    const map = new Map<ID, ID[]>();
    transferableCustomers.forEach((c) => {
      const arr = map.get(c.sellerId) ?? [];
      arr.push(c.id);
      map.set(c.sellerId, arr);
    });
    return map;
  }, [transferableCustomers]);

  const canSubmit = Boolean(toSellerId) && !missingReason && count > 0 && !mutation.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    try {
      for (const [fromSellerId, customerIds] of groupsByFrom.entries()) {
        if (fromSellerId === toSellerId) continue;
        await mutation.mutateAsync({
          storeId,
          type: "permanent_batch",
          fromSellerId,
          toSellerId: toSellerId as ID,
          customerIds,
          reason: reason.trim(),
          createdBy: currentUserId,
        });
      }
      toast.success(CARTEIRA_STRINGS.modals.permanentBatch.successToast(count, toName));
      onCreated?.();
      onClose();
    } catch {
      toast.error(CARTEIRA_STRINGS.modals.permanentBatch.failureToast);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !mutation.isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{CARTEIRA_STRINGS.modals.permanentBatch.title}</DialogTitle>
            <DialogDescription>
              {CARTEIRA_STRINGS.modals.permanentBatch.description(count)}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <button
              type="button"
              onClick={() => setShowList((v) => !v)}
              className="flex w-full items-center gap-2 text-sm font-medium text-foreground"
            >
              <Icon icon={showList ? "mdi:chevron-up" : "mdi:chevron-down"} size={16} />
              {showList
                ? CARTEIRA_STRINGS.modals.permanentBatch.collapseList
                : CARTEIRA_STRINGS.modals.permanentBatch.expandList}
              <span className="ml-auto text-xs text-muted-foreground">{count} cliente(s)</span>
            </button>
            {showList && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1 text-xs text-foreground">
                {transferableCustomers.map((c) => (
                  <li key={c.id} className="truncate">
                    {getCustomerName(c)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="perm-batch-to">{CARTEIRA_STRINGS.modals.permanentBatch.to}</Label>
            <Select value={toSellerId} onValueChange={(v) => setToSellerId(v as ID)}>
              <SelectTrigger id="perm-batch-to">
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
            <Label htmlFor="perm-batch-reason">
              {CARTEIRA_STRINGS.modals.permanentBatch.reason}
            </Label>
            <Textarea
              id="perm-batch-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={CARTEIRA_STRINGS.modals.permanentBatch.reasonPlaceholder}
              rows={3}
            />
            {missingReason && (
              <p className="text-xs text-muted-foreground">
                {CARTEIRA_STRINGS.modals.permanentBatch.missingReasonError}
              </p>
            )}
          </div>

          {toSellerId && (
            <Alert>
              <Icon icon="mdi:alert-octagon-outline" size={16} />
              <AlertTitle>{CARTEIRA_STRINGS.modals.permanentBatch.confirmTitle}</AlertTitle>
              <AlertDescription>
                {CARTEIRA_STRINGS.modals.permanentBatch.confirm(count, toName)}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {mutation.isPending
                ? CARTEIRA_STRINGS.modals.permanentBatch.submitting
                : CARTEIRA_STRINGS.modals.permanentBatch.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
