import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useRolesProvider } from "@/providers/data";
import { setSellerRole } from "../api/sellerAccess";

interface IChangeRoleDialogProps {
  seller: ISeller;
  storeId: string;
  /** Current effective role id (custom role id, or system role id === RoleName). */
  currentRoleId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Owner-facing dialog to assign a seller's platform role. Lists every assignable
 * role (the 7 system roles minus Owner, plus any custom roles), so an Owner can
 * pin a bespoke permission set per user. The role drives RLS via its base role,
 * so the change is applied server-side by `set-seller-role` and only reaches the
 * seller's session on their next token refresh.
 */
export function ChangeRoleDialog({
  seller,
  storeId,
  currentRoleId,
  open,
  onOpenChange,
}: IChangeRoleDialogProps) {
  const queryClient = useQueryClient();
  const rolesProvider = useRolesProvider();
  const [roleId, setRoleId] = useState<string>(currentRoleId);

  const rolesQuery = useQuery({
    queryKey: ["rbac", "roles"],
    queryFn: () => rolesProvider.list(),
  });

  // Owner is immutable (never assignable); customer-base roles aren't platform
  // access for staff; store-scoped roles only apply to their own store (mirrors
  // the Edge guard). Everything else (system + this store's custom roles) is
  // assignable.
  const assignable = (rolesQuery.data ?? [])
    .filter(
      (r) =>
        !r.isOwnerImmutable &&
        r.baseRole !== "Cliente" &&
        (r.storeId == null || r.storeId === storeId),
    )
    .sort((a, b) =>
      a.isSystem === b.isSystem ? a.name.localeCompare(b.name) : a.isSystem ? -1 : 1,
    );

  const mutation = useMutation({
    mutationFn: () => setSellerRole(seller.id, roleId),
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
            O papel define o que o vendedor enxerga na plataforma. Papéis customizados herdam o nível
            de acesso a dados do papel-base correspondente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="role-select">Papel</Label>
            {rolesQuery.isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger id="role-select">
                  <SelectValue placeholder="Selecione um papel" />
                </SelectTrigger>
                <SelectContent>
                  {assignable.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                      {!r.isSystem && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          (base: {r.baseRole})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {rolesQuery.isError && (
              <p className="text-xs text-severity-critical">
                Não foi possível carregar os papéis. Tente novamente.
              </p>
            )}
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
            disabled={mutation.isPending || rolesQuery.isLoading || roleId === currentRoleId}
          >
            {mutation.isPending ? "Salvando…" : "Salvar papel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
