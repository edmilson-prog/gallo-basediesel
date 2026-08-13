import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ICustomer } from "@/shared/types";
import { NewPermanentIndividualTransferModal } from "@/features/carteira/components/NewPermanentIndividualTransferModal";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
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
import { RenameContactDialog } from "./RenameContactDialog";

export interface IProfileMenuProps {
  customer: ICustomer;
  onMutated?: () => void;
  /**
   * Called when the user picks "Editar dados". The detail page wires this to
   * open the inline editor in the Overview tab. When omitted (e.g. the
   * Atendimento fiche), the action navigates to the customer detail page.
   */
  onEditData?: () => void;
  /**
   * Truthy pulse that opens the wallet transfer modal from outside — the detail
   * page's quick-action bar. The modal (and its RBAC + sellers query) stays
   * here, so the header button and the menu item can never diverge.
   */
  transferSignal?: number;
}

/**
 * Header overflow menu (kebab) — gathers the 7 contextual actions described in
 * the PRD. Each action checks RBAC (PRD-006) before rendering; actions that
 * mutate the customer fire an `auditLog` entry.
 *
 * The destructive "Bloquear cliente" action is gated by an `<AlertDialog>` so
 * an accidental click doesn't flip the customer's status.
 */
export function ProfileMenu({
  customer,
  onMutated,
  onEditData,
  transferSignal,
}: IProfileMenuProps) {
  const navigate = useNavigate();
  const { currentUser, hasRole } = useAuth();
  const provider = useCustomersProvider();
  const sellersProvider = useSellersProvider();
  const queryClient = useQueryClient();
  const [blockOpen, setBlockOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);

  useEffect(() => {
    if (transferSignal) setTransferOpen(true);
  }, [transferSignal]);

  // The detail screen reads from TanStack Query — refetch after every mutation
  // (the mock store mutated shared objects in place, which masked this need).
  const refreshCustomer = () => {
    void queryClient.invalidateQueries({ queryKey: ["customer-profile", customer.id] });
    void queryClient.invalidateQueries({ queryKey: ["customers-list"] });
  };

  const sellersQuery = useQuery({
    queryKey: ["customer-profile-sellers", customer.storeId],
    queryFn: () => sellersProvider.list({ storeId: customer.storeId }),
    staleTime: 60_000,
    enabled: transferOpen,
  });

  const canEdit = usePermission("customer", "edit");
  // Mirror the RLS `customers_update` predicate: staff, or the wallet owner.
  const isWalletOwner = currentUser?.sellerId != null && customer.sellerId === currentUser.sellerId;
  const canEditData = canEdit && (hasRole(["Owner", "Gestor"]) || isWalletOwner);
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
      refreshCustomer();
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
      refreshCustomer();
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
            <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
              <Icon icon="mdi:rename-outline" size={14} />
              {CUSTOMER_STRINGS.menu.rename}
            </DropdownMenuItem>
          )}
          {canEditData && (
            <DropdownMenuItem
              onSelect={() => {
                if (onEditData) {
                  onEditData();
                } else {
                  void navigate({ to: `/app/clientes/${customer.id}` as never });
                }
              }}
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
          {canTransfer && customer.sellerId !== null && (
            <DropdownMenuItem onSelect={() => setTransferOpen(true)}>
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
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
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

      <NewPermanentIndividualTransferModal
        open={transferOpen}
        customer={transferOpen ? customer : null}
        sellers={sellersQuery.data ?? []}
        currentSellerId={currentUser?.sellerId}
        onClose={() => setTransferOpen(false)}
        onCreated={() => {
          setTransferOpen(false);
          refreshCustomer();
          onMutated?.();
        }}
      />

      <RenameContactDialog
        customer={customer}
        open={renameOpen}
        onOpenChange={setRenameOpen}
        onRenamed={() => {
          refreshCustomer();
          onMutated?.();
        }}
      />

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
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {CUSTOMER_STRINGS.menu.blockConfirmCta}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
