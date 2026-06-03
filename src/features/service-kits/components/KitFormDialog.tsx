import type { ID, IServiceKit } from "@/shared/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ICreateServiceKitInput } from "@/providers/data";
import { KitForm } from "./KitForm";

export interface IKitFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: ID;
  initial?: IServiceKit;
  saving?: boolean;
  onSubmit: (input: ICreateServiceKitInput) => void;
}

export function KitFormDialog({
  open,
  onOpenChange,
  storeId,
  initial,
  saving,
  onSubmit,
}: IKitFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar kit" : "Novo kit de revisão"}</DialogTitle>
        </DialogHeader>
        <KitForm
          storeId={storeId}
          initial={initial}
          saving={saving}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
