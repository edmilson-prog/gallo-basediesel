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

interface IUnsavedChangesDialogProps {
  open: boolean;
  onConfirmDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedChangesDialog({
  open,
  onConfirmDiscard,
  onCancel,
}: IUnsavedChangesDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Alterações não salvas</AlertDialogTitle>
          <AlertDialogDescription>
            Você tem alterações que ainda não foram salvas. Se sair agora, elas serão descartadas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmDiscard}>Descartar e sair</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
