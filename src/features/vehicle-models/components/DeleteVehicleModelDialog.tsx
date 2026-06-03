import type { IVehicleModel } from "@/shared/types";
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

export interface IDeleteVehicleModelDialogProps {
  model: IVehicleModel | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteVehicleModelDialog({
  model,
  onOpenChange,
  onConfirm,
}: IDeleteVehicleModelDialogProps) {
  return (
    <AlertDialog open={model !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir modelo?</AlertDialogTitle>
          <AlertDialogDescription>
            {model ? (
              <>
                <strong>
                  {model.brand} {model.model} ({model.engine})
                </strong>{" "}
                será removido do catálogo de modelos. Esta ação não pode ser desfeita.
                <br />
                <br />
                Se quiser preservar o histórico, considere <strong>inativar</strong> o modelo em vez
                de excluí-lo — uma opção reversível disponível no menu de ações.
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Excluir modelo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
