import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { generateTempPassword, inviteSeller, type InviteSellerRole } from "../api/sellerAccess";

const ROLE_BY_TYPE: Record<ISeller["type"], InviteSellerRole> = {
  internal: "seller_internal",
  external: "seller_external",
  representative: "seller_external",
};

const ROLE_LABEL: Record<InviteSellerRole, string> = {
  seller_internal: "Vendedor interno",
  seller_external: "Vendedor externo",
  manager: "Gestor",
};

interface ICreateAccessDialogProps {
  seller: ISeller;
  storeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Owner-facing dialog to create platform access for an existing seller. The
 * password is generated client-side, shown for hand-off, and sent to the
 * `invite-seller` Edge Function (email invite via Resend lands with PRD-141).
 */
export function CreateAccessDialog({
  seller,
  storeId,
  open,
  onOpenChange,
}: ICreateAccessDialogProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(seller.email);
  const [password, setPassword] = useState(generateTempPassword);
  const role = ROLE_BY_TYPE[seller.type];

  const mutation = useMutation({
    mutationFn: () =>
      inviteSeller({ sellerId: seller.id, email: email.trim().toLowerCase(), password, role }),
    onSuccess: () => {
      toast.success(`Acesso criado para ${seller.fullName}.`, {
        description: "Compartilhe a senha temporária e oriente a troca no primeiro acesso.",
      });
      void queryClient.invalidateQueries({ queryKey: ["seller-access", storeId] });
      onOpenChange(false);
    },
    onError: (err: Error) =>
      toast.error("Não foi possível criar o acesso", { description: err.message }),
  });

  const copyPassword = () => {
    void navigator.clipboard.writeText(password);
    toast.success("Senha copiada.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar acesso — {seller.fullName}</DialogTitle>
          <DialogDescription>
            Cria o login do vendedor na plataforma. A senha é temporária — repasse com segurança e
            oriente a troca no primeiro acesso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Papel</Label>
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              {ROLE_LABEL[role]}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-password">Senha temporária</Label>
            <div className="flex gap-2">
              <Input id="invite-password" value={password} readOnly className="font-mono" />
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
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !email.trim()}>
            {mutation.isPending ? "Criando…" : "Criar acesso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
