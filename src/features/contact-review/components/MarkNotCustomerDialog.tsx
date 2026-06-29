import { toast } from "sonner";
import type { IConversation, ICustomer, ID } from "@/shared/types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CONTACT_REVIEW_STRINGS as S } from "../i18n/pt-BR";
import { useContactConversion } from "../hooks/useContactConversion";

export interface IMarkNotCustomerDialogProps {
  customerId: ID;
  conversation?: IConversation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}

export function MarkNotCustomerDialog({
  customerId, conversation, open, onOpenChange, onDone,
}: IMarkNotCustomerDialogProps) {
  const { saving, discard } = useContactConversion();

  const handleConfirm = async () => {
    try {
      await discard(customerId, conversation?.id ?? null);
      toast.success(S.discard.success);
      onDone?.();
      onOpenChange(false);
    } catch {
      toast.error(S.discard.failure);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{S.discard.title}</AlertDialogTitle>
          <AlertDialogDescription>{S.discard.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>{S.discard.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); void handleConfirm(); }}
            disabled={saving}
          >
            {saving ? S.discard.submitting : S.discard.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
