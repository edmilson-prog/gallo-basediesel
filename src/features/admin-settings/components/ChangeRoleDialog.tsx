import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ISeller } from "@/shared/types";
import { setSellerRole, type InviteSellerRole } from "../api/sellerAccess";

const ROLE_OPTIONS: { value: InviteSellerRole; label: string }[] = [
  { value: "seller_internal", label: "Vendedor interno" },
  { value: "seller_external", label: "Vendedor externo" },
  { value: "manager", label: "Gestor" },
];

interface IChangeRoleDialogProps {
  seller: ISeller;
  storeId: string;
  currentRole: InviteSellerRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Owner-facing dialog to change a seller's platform access role (profiles.role).
 * The role drives RLS, so the change is applied server-side by `set-seller-role`
 * and only reaches the seller's session on their next token refresh.
 */
export function ChangeRoleDialog({
  seller,
  storeId,
  currentRole,
  open,
  onOpenChange,
}: IChangeRoleDialogProps) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<InviteSellerRole>(currentRole);

  const mutation = useMutation({
    mutationFn: () => setSellerRole(seller.id, role),
    onSuccess: () => {
      toast.success(`Papel de ${seller.fullName} atualizado.`, {
        description: "O novo papel vale no próximo login do vendedor.",
      });
      void queryClient.invalidateQueries({ queryKey: ["sellers", storeId] });
      void queryClient.invalidateQueries({ queryKey: ["seller-access", storeId] });
      onOpenChange(false);
    },
    onError: (err: Error) =>
      toast.error("Não foi possível alterar o papel", { description: err.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alterar papel — {seller.fullName}</DialogTitle>
          <DialogDescription>
            O papel define o que o vendedor enxerga na plataforma. Gestores veem todas as carteiras
            e os indicadores financeiros; vendedores veem apenas a própria carteira.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="role-select">Papel</Label>
            <Select value={role} onValueChange={(v) => setRole(v as InviteSellerRole)}>
              <SelectTrigger id="role-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            A mudança vale no próximo login do vendedor (na próxima renovação da sessão).
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || role === currentRole}
          >
            {mutation.isPending ? "Salvando…" : "Salvar papel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
