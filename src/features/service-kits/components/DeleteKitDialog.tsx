import type { IServiceKit } from "@/shared/types";
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

export interface IDeleteKitDialogProps {
  kit: IServiceKit | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteKitDialog({ kit, onOpenChange, onConfirm }: IDeleteKitDialogProps) {
  return (
    <AlertDialog open={kit !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir kit</AlertDialogTitle>
          <AlertDialogDescription>
            {kit ? `Excluir "${kit.name}"? Esta ação não pode ser desfeita.` : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Excluir kit
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
