import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { ISeller } from "@/shared/types";
import { setSellerAccess } from "../api/sellerAccess";

interface IToggleSellerAccessButtonProps {
  seller: ISeller;
  storeId: string;
}

/**
 * Desligar / Reativar a seller's platform login (PRD-107 Fase 3). Deactivation
 * is destructive-ish (the seller loses access) so it goes through a confirm
 * dialog; the actual ban/un-ban happens server-side in `set-seller-access`.
 */
export function ToggleSellerAccessButton({ seller, storeId }: IToggleSellerAccessButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const willDeactivate = seller.active;

  const mutation = useMutation({
    mutationFn: () => setSellerAccess(seller.id, !willDeactivate),
    onSuccess: () => {
      toast.success(
        willDeactivate
          ? `Acesso de ${seller.fullName} desligado.`
          : `Acesso de ${seller.fullName} reativado.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["sellers", storeId] });
      void queryClient.invalidateQueries({ queryKey: ["seller-access", storeId] });
      setOpen(false);
    },
    onError: (err: Error) =>
      toast.error("Não foi possível atualizar o acesso", { description: err.message }),
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant={willDeactivate ? "outline" : "default"} className="gap-1.5">
          <Icon
            icon={willDeactivate ? "mdi:account-cancel-outline" : "mdi:account-check-outline"}
            size={14}
          />
          {willDeactivate ? "Desligar" : "Reativar"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {willDeactivate ? "Desligar acesso" : "Reativar acesso"} — {seller.fullName}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {willDeactivate
              ? "O vendedor perde o login e é desconectado no próximo refresh da sessão. O histórico (pedidos, carteira, comissões) é preservado — você pode reativar quando quiser."
              : "O vendedor volta a acessar a plataforma com as credenciais atuais."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            disabled={mutation.isPending}
            className={
              willDeactivate
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
          >
            {mutation.isPending ? "Processando…" : willDeactivate ? "Desligar" : "Reativar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
