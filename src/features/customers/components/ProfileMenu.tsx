import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { ICustomer } from "@/shared/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Icon } from "@/components/Icon";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useAuth } from "@/features/auth/useAuth";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { CUSTOMER_STRINGS } from "../i18n/pt-BR";

export interface IProfileMenuProps {
  customer: ICustomer;
  onMutated?: () => void;
}

/**
 * Header overflow menu (kebab) — gathers the 7 contextual actions described in
 * the PRD. Each action checks RBAC (PRD-006) before rendering; actions that
 * mutate the customer fire an `auditLog` entry.
 *
 * The destructive "Bloquear cliente" action is gated by an `<AlertDialog>` so
 * an accidental click doesn't flip the customer's status.
 */
export function ProfileMenu({ customer, onMutated }: IProfileMenuProps) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const provider = useCustomersProvider();
  const [blockOpen, setBlockOpen] = useState(false);

  const canEdit = usePermission("customer", "edit");
  const canEditStore = usePermission("customer", "edit", "store");
  const canDelete = usePermission("customer", "delete");
  const canCreateVehicle = usePermission("vehicle", "create");
  const canTransfer = usePermission("transfer", "create");
  const isOwner = currentUser?.role === "Owner";

  const handleMarkDormant = async () => {
    const before = { status: customer.status };
    try {
      await provider.update(customer.id, { status: "dormente" });
      auditLog({
        action: "customer.mark_dormant",
        resource: "customer",
        resourceId: customer.id,
        before,
        after: { status: "dormente" },
      });
      toast.success(CUSTOMER_STRINGS.menu.markedDormantToast);
      onMutated?.();
    } catch {
      toast.error("Não foi possível atualizar o cliente.");
    }
  };

  const handleBlock = async () => {
    const before = { status: customer.status };
    try {
      await provider.update(customer.id, { status: "perdido" });
      auditLog({
        action: "customer.block",
        resource: "customer",
        resourceId: customer.id,
        before,
        after: { status: "perdido" },
      });
      toast.success(CUSTOMER_STRINGS.menu.blockedToast);
      setBlockOpen(false);
      onMutated?.();
    } catch {
      toast.error("Não foi possível bloquear o cliente.");
    }
  };

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={CUSTOMER_STRINGS.header.menuLabel}>
                <Icon icon="mdi:dots-vertical" size={16} />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{CUSTOMER_STRINGS.header.menuLabel}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-56">
          {canEdit && (
            <DropdownMenuItem
              onSelect={() => toast.info("Edição de dados será detalhada em PRD-019.")}
            >
              <Icon icon="mdi:pencil-outline" size={14} />
              {CUSTOMER_STRINGS.menu.edit}
            </DropdownMenuItem>
          )}
          {canEditStore && customer.status !== "dormente" && (
            <DropdownMenuItem onSelect={handleMarkDormant}>
              <Icon icon="mdi:moon-waning-crescent" size={14} />
              {CUSTOMER_STRINGS.menu.markDormant}
            </DropdownMenuItem>
          )}
          {canTransfer && (
            <DropdownMenuItem
              onSelect={() =>
                void navigate({
                  to: `/app/carteiras?customerId=${customer.id}` as never,
                })
              }
            >
              <Icon icon="mdi:swap-horizontal" size={14} />
              {CUSTOMER_STRINGS.menu.transferWallet}
            </DropdownMenuItem>
          )}
          {canCreateVehicle && (
            <DropdownMenuItem
              onSelect={() => toast.info("Use a aba Veículos para cadastrar uma nova unidade.")}
            >
              <Icon icon="mdi:truck-plus-outline" size={14} />
              {CUSTOMER_STRINGS.menu.addVehicle}
            </DropdownMenuItem>
          )}
          {customer.convertedFromLeadId && (
            <DropdownMenuItem
              onSelect={() =>
                void navigate({
                  to: `/app/leads/${customer.convertedFromLeadId}` as never,
                })
              }
            >
              <Icon icon="mdi:source-branch" size={14} />
              {CUSTOMER_STRINGS.menu.viewLead}
            </DropdownMenuItem>
          )}
          {(canDelete || isOwner) && (
            <>
              <DropdownMenuSeparator />
              {canDelete && customer.status !== "perdido" && (
                <DropdownMenuItem
                  onSelect={() => setBlockOpen(true)}
                  className="text-rose-600 focus:bg-rose-500/10 focus:text-rose-700 dark:text-rose-400 dark:focus:text-rose-300"
                >
                  <Icon icon="mdi:account-cancel-outline" size={14} />
                  {CUSTOMER_STRINGS.menu.blockCustomer}
                </DropdownMenuItem>
              )}
              {isOwner && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem
                      disabled
                      onSelect={(e) => e.preventDefault()}
                      className="opacity-60"
                    >
                      <Icon icon="mdi:download-outline" size={14} />
                      {CUSTOMER_STRINGS.menu.exportLgpd}
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  <TooltipContent>{CUSTOMER_STRINGS.menu.exportLgpdHint}</TooltipContent>
                </Tooltip>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={blockOpen} onOpenChange={setBlockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{CUSTOMER_STRINGS.menu.blockConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {CUSTOMER_STRINGS.menu.blockConfirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBlock}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {CUSTOMER_STRINGS.menu.blockConfirmCta}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
