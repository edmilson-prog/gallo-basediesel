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
import { CARTEIRA_STRINGS } from "../i18n/pt-BR";
import { getCustomerName } from "@/features/customers/utils/customerDisplay";

export interface INewPermanentIndividualTransferModalProps {
  open: boolean;
  customer: ICustomer | null;
  sellers: ISeller[];
  currentUserId: ID;
  onClose: () => void;
  onCreated?: () => void;
}

export function NewPermanentIndividualTransferModal({
  open,
  customer,
  sellers,
  currentUserId,
  onClose,
  onCreated,
}: INewPermanentIndividualTransferModalProps) {
  const [toSellerId, setToSellerId] = useState<ID | "">("");
  const [reason, setReason] = useState("");
  const mutation = useCreateTransfer();

  useEffect(() => {
    if (open) {
      setToSellerId("");
      setReason("");
    }
  }, [open]);

  const customerName = customer ? getCustomerName(customer) : "";
  const currentSeller = customer
    ? (sellers.find((s) => s.id === customer.sellerId)?.fullName ?? customer.sellerId ?? "—")
    : "—";
  const toName = sellers.find((s) => s.id === toSellerId)?.fullName ?? "";

  const sameSeller = customer ? toSellerId === customer.sellerId : false;
  const missingReason = !reason.trim();

  const canSubmit =
    Boolean(toSellerId) &&
    !sameSeller &&
    !missingReason &&
    !mutation.isPending &&
    Boolean(customer);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!customer || !canSubmit) return;
    try {
      await mutation.mutateAsync({
        storeId: customer.storeId,
        type: "permanent_individual",
        fromSellerId: customer.sellerId ?? "",
        toSellerId: toSellerId as ID,
        customerIds: [customer.id],
        reason: reason.trim(),
        createdBy: currentUserId,
      });
      toast.success(CARTEIRA_STRINGS.modals.permanentIndividual.successToast(customerName, toName));
      onCreated?.();
      onClose();
    } catch {
      toast.error(CARTEIRA_STRINGS.modals.permanentIndividual.failureToast);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !mutation.isPending && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{CARTEIRA_STRINGS.modals.permanentIndividual.title}</DialogTitle>
            <DialogDescription>
              {CARTEIRA_STRINGS.modals.permanentIndividual.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>{CARTEIRA_STRINGS.modals.permanentIndividual.customer}</Label>
            <Input value={customerName} disabled />
          </div>

          <div className="space-y-1.5">
            <Label>{CARTEIRA_STRINGS.modals.permanentIndividual.from}</Label>
            <Input value={currentSeller} disabled />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="perm-ind-to">{CARTEIRA_STRINGS.modals.permanentIndividual.to}</Label>
            <Select value={toSellerId} onValueChange={(v) => setToSellerId(v as ID)}>
              <SelectTrigger id="perm-ind-to">
                <SelectValue placeholder="Selecionar…" />
              </SelectTrigger>
              <SelectContent>
                {sellers
                  .filter((s) => s.id !== customer?.sellerId)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {sameSeller && (
              <p className="text-xs text-destructive">
                {CARTEIRA_STRINGS.modals.permanentIndividual.sameSellerError}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="perm-ind-reason">
              {CARTEIRA_STRINGS.modals.permanentIndividual.reason}
            </Label>
            <Textarea
              id="perm-ind-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={CARTEIRA_STRINGS.modals.permanentIndividual.reasonPlaceholder}
              rows={3}
            />
            {missingReason && (
              <p className="text-xs text-muted-foreground">
                {CARTEIRA_STRINGS.modals.permanentIndividual.missingReasonError}
              </p>
            )}
          </div>

          {toSellerId && (
            <Alert>
              <Icon icon="mdi:alert-outline" size={16} />
              <AlertTitle>Confirmar transferência</AlertTitle>
              <AlertDescription>
                {CARTEIRA_STRINGS.modals.permanentIndividual.confirm(customerName, toName)}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {mutation.isPending
                ? CARTEIRA_STRINGS.modals.permanentIndividual.submitting
                : CARTEIRA_STRINGS.modals.permanentIndividual.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
