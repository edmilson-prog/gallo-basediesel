import { useState } from "react";
import { toast } from "sonner";
import type { ID, IPortalUser, PortalUserRole } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/Icon";
import {
  Dialog,
  DialogContent,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBRL } from "@/shared/utils/format";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { usePortalSession } from "../hooks/usePortalSession";
import { usePortalStore } from "../store/portalStore";
import { PortalBanner } from "../components/PortalBanner";
import { PORTAL_ROLE_LABEL, PORTAL_STRINGS as S } from "../i18n/pt-BR";

function defaultFlags(role: PortalUserRole) {
  switch (role) {
    case "admin":
      return {
        canCreateRequests: true,
        canApproveOrders: true,
        canManageFleet: true,
        canViewFinancial: true,
        approvalLimit: 50_000,
      };
    case "comprador":
      return {
        canCreateRequests: true,
        canApproveOrders: false,
        canManageFleet: false,
        canViewFinancial: false,
        approvalLimit: 5_000,
      };
    default:
      return {
        canCreateRequests: false,
        canApproveOrders: false,
        canManageFleet: false,
        canViewFinancial: false,
        approvalLimit: 0,
      };
  }
}

interface IEditState {
  id?: ID;
  name: string;
  email: string;
  role: PortalUserRole;
  approvalLimit: number;
  isActive: boolean;
}

const EMPTY_EDIT: IEditState = {
  name: "",
  email: "",
  role: "comprador",
  approvalLimit: 5_000,
  isActive: true,
};

export function PortalUsersPage() {
  const { user, customer } = usePortalSession();
  const allUsers = usePortalStore((s) => s.users);
  const addUser = usePortalStore((s) => s.addUser);
  const updateUser = usePortalStore((s) => s.updateUser);
  const removeUser = usePortalStore((s) => s.removeUser);

  const [edit, setEdit] = useState<IEditState | null>(null);

  const companyUsers = allUsers.filter((u) => u.customerId === customer?.id);

  if (user?.role !== "admin") {
    return (
      <EmptyState
        icon="mdi:shield-lock-outline"
        title={S.noAccessTitle}
        description={S.noAccessDescription}
        actionLabel={S.back}
        actionTo="/portal/inicio"
      />
    );
  }

  const openNew = () => setEdit({ ...EMPTY_EDIT });
  const openEdit = (u: IPortalUser) =>
    setEdit({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      approvalLimit: u.approvalLimit ?? 0,
      isActive: u.isActive,
    });

  const handleSave = () => {
    if (!edit || !customer || !user) return;
    const flags = defaultFlags(edit.role);
    if (edit.id) {
      updateUser(edit.id, {
        name: edit.name,
        email: edit.email,
        role: edit.role,
        isActive: edit.isActive,
        canCreateRequests: flags.canCreateRequests,
        canApproveOrders: flags.canApproveOrders,
        canManageFleet: flags.canManageFleet,
        canViewFinancial: flags.canViewFinancial,
        approvalLimit: edit.approvalLimit,
      });
    } else {
      addUser({
        customerId: customer.id,
        name: edit.name,
        email: edit.email,
        role: edit.role,
        isActive: edit.isActive,
        canCreateRequests: flags.canCreateRequests,
        canApproveOrders: flags.canApproveOrders,
        canManageFleet: flags.canManageFleet,
        canViewFinancial: flags.canViewFinancial,
        approvalLimit: edit.approvalLimit,
      });
    }
    auditLog({
      actorId: user.id,
      action: edit.id ? "portal_user_update" : "portal_user_create",
      resource: "customer",
      resourceId: customer.id,
      after: { name: edit.name, role: edit.role },
      storeId: "store-matriz",
    });
    toast.success("Usuário salvo.");
    setEdit(null);
  };

  const handleRemove = (id: ID) => {
    removeUser(id);
    if (customer && user) {
      auditLog({
        actorId: user.id,
        action: "portal_user_remove",
        resource: "customer",
        resourceId: customer.id,
        after: { removedUserId: id },
        storeId: "store-matriz",
      });
    }
    toast.success("Usuário removido.");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold text-foreground">{S.usersTitle}</h1>
        <Button size="sm" onClick={openNew}>
          <Icon icon="mdi:account-plus" size={16} className="mr-1" aria-hidden />
          Adicionar
        </Button>
      </div>

      <div className="space-y-2">
        {companyUsers.map((u) => (
          <Card key={u.id} className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              {u.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{u.name}</p>
              <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              {u.approvalLimit ? (
                <p className="text-[11px] text-muted-foreground">
                  {S.userApprovalLimit}: {formatBRL(u.approvalLimit)}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline">{PORTAL_ROLE_LABEL[u.role]}</Badge>
              {!u.isActive && (
                <Badge variant="outline" className="text-muted-foreground">
                  Inativo
                </Badge>
              )}
              <Button size="icon" variant="ghost" onClick={() => openEdit(u)} aria-label="Editar">
                <Icon icon="mdi:pencil" size={16} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive"
                onClick={() => handleRemove(u.id)}
                aria-label={S.userRemove}
              >
                <Icon icon="mdi:trash-can-outline" size={16} />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>
              <Button variant="outline" disabled className="w-full">
                <Icon icon="mdi:email-plus-outline" size={16} className="mr-1" aria-hidden />
                {S.usersNew}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{S.usersNewPlaceholder}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PortalBanner />

      <Dialog open={Boolean(edit)} onOpenChange={(open) => !open && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Editar usuário" : "Novo usuário"}</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="u-name">Nome</Label>
                <Input
                  id="u-name"
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-email">E-mail</Label>
                <Input
                  id="u-email"
                  type="email"
                  value={edit.email}
                  onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Papel</Label>
                <Select
                  value={edit.role}
                  onValueChange={(v) => {
                    const role = v as PortalUserRole;
                    setEdit({ ...edit, role, approvalLimit: defaultFlags(role).approvalLimit });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{S.userRoleAdmin}</SelectItem>
                    <SelectItem value="comprador">{S.userRoleBuyer}</SelectItem>
                    <SelectItem value="visualizador">{S.userRoleViewer}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-limit">{S.userApprovalLimit} (R$)</Label>
                <Input
                  id="u-limit"
                  type="number"
                  min={0}
                  value={edit.approvalLimit}
                  onChange={(e) => setEdit({ ...edit, approvalLimit: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="u-active">{S.userActive}</Label>
                <Switch
                  id="u-active"
                  checked={edit.isActive}
                  onCheckedChange={(v) => setEdit({ ...edit, isActive: v })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!edit?.name || !edit?.email}>
              {S.userSave}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
