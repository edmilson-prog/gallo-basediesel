import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import type { ISeller } from "@/shared/types";
import { useSellersProvider } from "@/providers/data";

interface IDeleteSellerDialogProps {
  seller: ISeller;
  storeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Destructive confirmation for the soft delete (users CRUD): the seller loses
 * the login and disappears from every list, but the record stays in the
 * database so orders/conversations history keeps resolving.
 */
export function DeleteSellerDialog({
  seller,
  storeId,
  open,
  onOpenChange,
}: IDeleteSellerDialogProps) {
  const provider = useSellersProvider();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => provider.remove(seller.id),
    onSuccess: async () => {
      toast.success(`${seller.fullName} foi excluído(a).`, {
        description: "O histórico de vendas e conversas permanece preservado.",
      });
      await queryClient.invalidateQueries({ queryKey: ["sellers", storeId] });
      await queryClient.invalidateQueries({ queryKey: ["seller-access", storeId] });
      onOpenChange(false);
    },
    onError: (err: Error) =>
      toast.error("Não foi possível excluir o usuário", { description: err.message }),
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {seller.fullName}?</AlertDialogTitle>
          <AlertDialogDescription>
            O usuário perde o acesso à plataforma e deixa de aparecer nas listas (equipe,
            distribuição, rankings). O histórico de vendas, clientes e conversas permanece
            preservado. Esta ação não pode ser desfeita pela tela.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Excluindo…" : "Excluir usuário"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
