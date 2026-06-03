import type { IVehicleModelKit } from "@/shared/types";
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

export interface IDeleteModelKitDialogProps {
  kit: IVehicleModelKit | null;
  onConfirm(): void;
  onOpenChange(open: boolean): void;
}

export function DeleteModelKitDialog({ kit, onConfirm, onOpenChange }: IDeleteModelKitDialogProps) {
  return (
    <AlertDialog open={kit !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir kit?</AlertDialogTitle>
          <AlertDialogDescription>
            {kit ? (
              <>
                Tem certeza que deseja excluir o kit <strong>&quot;{kit.name}&quot;</strong>? Esta
                ação não pode ser desfeita.
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
