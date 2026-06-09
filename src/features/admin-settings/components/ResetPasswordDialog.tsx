import { useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ISeller } from "@/shared/types";
import { generateTempPassword, resetSellerPassword } from "../api/sellerAccess";

interface IResetPasswordDialogProps {
  seller: ISeller;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Owner-facing dialog to set a fresh temporary password for a seller who lost
 * theirs. The password is generated client-side and shown for hand-off before
 * confirming; `reset-seller-password` applies it server-side. Replacing the
 * current password invalidates it immediately, so the dialog warns about that.
 */
export function ResetPasswordDialog({ seller, open, onOpenChange }: IResetPasswordDialogProps) {
  const [password, setPassword] = useState(generateTempPassword);

  const mutation = useMutation({
    mutationFn: () => resetSellerPassword(seller.id, password),
    onSuccess: () => {
      toast.success(`Senha de ${seller.fullName} redefinida.`, {
        description: "Repasse a nova senha temporária e oriente a troca no primeiro acesso.",
      });
      onOpenChange(false);
    },
    onError: (err: Error) =>
      toast.error("Não foi possível redefinir a senha", { description: err.message }),
  });

  const copyPassword = () => {
    void navigator.clipboard.writeText(password);
    toast.success("Senha copiada.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redefinir senha — {seller.fullName}</DialogTitle>
          <DialogDescription>
            Gera uma nova senha temporária para o vendedor. A senha atual deixa de funcionar
            imediatamente — copie a nova antes de confirmar e repasse com segurança.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!seller.active && (
            <div className="flex items-start gap-2 rounded-md border border-severity-warning/40 bg-severity-warning/10 px-3 py-2 text-xs text-severity-warning">
              <Icon icon="mdi:alert" size={14} className="mt-0.5 shrink-0" />
              <span>
                Este vendedor está <strong>desligado</strong>. Redefinir a senha não reativa o
                acesso — clique em <strong>Reativar</strong> para ele conseguir entrar.
              </span>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="reset-password">Nova senha temporária</Label>
            <div className="flex gap-2">
              <Input id="reset-password" value={password} readOnly className="font-mono" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copyPassword}
                title="Copiar senha"
              >
                <Icon icon="mdi:content-copy" size={16} />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setPassword(generateTempPassword())}
                title="Gerar nova senha"
              >
                <Icon icon="mdi:refresh" size={16} />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Redefinindo…" : "Redefinir senha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
