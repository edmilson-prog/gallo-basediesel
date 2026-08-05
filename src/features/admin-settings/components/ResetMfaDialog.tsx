import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ISeller } from "@/shared/types";
import { resetSellerMfa } from "../api/sellerAccess";

interface IResetMfaDialogProps {
  seller: ISeller;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Owner-only escape hatch for a seller who lost their authenticator app.
 *
 * Two-factor here is TOTP-only and Supabase provides no recovery codes, so
 * without this the account would be unreachable. Clearing the factor lowers the
 * account back to password-only until the seller enrolls again — the dialog is
 * explicit about that, and the action is audited.
 */
export function ResetMfaDialog({ seller, open, onOpenChange }: IResetMfaDialogProps) {
  const mutation = useMutation({
    mutationFn: () => resetSellerMfa(seller.id),
    onSuccess: (removed) => {
      if (removed === 0) {
        toast.info(`${seller.fullName} não tinha verificação em duas etapas ativa.`);
      } else {
        toast.success(`Verificação em duas etapas removida de ${seller.fullName}.`, {
          description: "Peça para ativar novamente assim que recuperar o aplicativo.",
        });
      }
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remover verificação em duas etapas — {seller.fullName}</DialogTitle>
          <DialogDescription>
            Use quando a pessoa perdeu o acesso ao aplicativo autenticador e não consegue mais
            entrar. A conta volta a exigir apenas a senha até que ela ative a verificação de novo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-lg border border-severity-warning/35 bg-severity-warning/10 p-3 text-xs leading-snug text-foreground">
          <Icon
            icon="lucide:triangle-alert"
            className="mt-0.5 size-4 shrink-0 text-severity-warning"
          />
          <p>
            Confirme a identidade da pessoa por um canal confiável antes de remover — este é o único
            caminho de recuperação, e ele enfraquece a proteção da conta. A ação fica registrada na
            auditoria.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Removendo…" : "Remover verificação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
