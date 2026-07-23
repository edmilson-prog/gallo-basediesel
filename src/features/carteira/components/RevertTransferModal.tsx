import { toast } from "sonner";
import type { ICarteiraTransfer, ID, ISeller } from "@/shared/types";
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
import { useRevertTransfer } from "../hooks/useTransferMutations";
import { CARTEIRA_STRINGS } from "../i18n/pt-BR";

export interface IRevertTransferModalProps {
  transfer: ICarteiraTransfer | null;
  sellersById: Map<ID, ISeller>;
  /**
   * ISeller.id of the acting user — attributes the `transfer.revert`
   * audit_logs entry. Undefined leaves the entry unrecorded rather than
   * misattributed (see `impl/supabase/transfers.ts`).
   */
  currentSellerId: ID | undefined;
  onClose: () => void;
  onSuccess?: (transfer: ICarteiraTransfer) => void;
}

export function RevertTransferModal({
  transfer,
  sellersById,
  currentSellerId,
  onClose,
  onSuccess,
}: IRevertTransferModalProps) {
  const mutation = useRevertTransfer();

  if (!transfer) return null;

  const fromName = sellersById.get(transfer.fromSellerId)?.fullName ?? transfer.fromSellerId;
  const count = transfer.customerIds.length;
  const isPermanent = transfer.type !== "temporary";
  const description = isPermanent
    ? CARTEIRA_STRINGS.modals.revert.descriptionPermanent(count, fromName)
    : CARTEIRA_STRINGS.modals.revert.descriptionTemporary(count, fromName);

  const handleConfirm = async () => {
    try {
      const updated = await mutation.mutateAsync({
        transferId: transfer.id,
        actorId: currentSellerId,
      });
      toast.success(CARTEIRA_STRINGS.modals.revert.successToast(count, fromName));
      onSuccess?.(updated);
      onClose();
    } catch {
      toast.error(CARTEIRA_STRINGS.modals.revert.failureToast);
    }
  };

  return (
    <AlertDialog open={transfer !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{CARTEIRA_STRINGS.modals.revert.title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            {CARTEIRA_STRINGS.modals.revert.cancel}
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={mutation.isPending}>
            {mutation.isPending
              ? CARTEIRA_STRINGS.modals.revert.submitting
              : CARTEIRA_STRINGS.modals.revert.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
