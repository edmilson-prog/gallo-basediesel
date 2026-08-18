import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import type { IRole, RoleName } from "@/shared/types";
import { useRolesProvider } from "@/providers/data";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { usePermission } from "../../hooks/usePermission";
import { ROLE_EDITOR_LABELS } from "../../i18n/pt-BR";
import { RoleFormDialog, type RoleFormMode } from "./RoleFormDialog";

export interface IRoleRailProps {
  roles: IRole[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Re-select the freshly created/duplicated role and refresh the RBAC cache. */
  onRoleCreated?: (role: IRole) => void | Promise<void>;
  /** Invalidate + re-hydrate after a rename/meta edit. */
  onRolesChanged?: () => void | Promise<void>;
  /** Drop the deleted role from selection and refresh. */
  onRoleDeleted?: (roleId: string) => void | Promise<void>;
}

/** Iconify name per base system role; custom roles fall back to a generic icon. */
const ROLE_ICONS: Record<RoleName, string> = {
  Owner: "mdi:crown",
  Gestor: "mdi:account-tie",
  Vendedor: "mdi:account-cash",
  VendedorExterno: "mdi:map-marker-account",
  SDR: "mdi:robot",
  Financeiro: "mdi:calculator",
  Cliente: "mdi:account-circle",
};

function roleIcon(role: IRole): string {
  return ROLE_ICONS[role.baseRole] ?? "mdi:shield-account";
}

/**
 * Parses the usage count the provider embeds in its "role in use" error.
 *
 * Both the mock (`MockValidationError`) and the Supabase impl throw a message
 * shaped like "Não é possível excluir: 3 usuário(s) ainda usam este papel." —
 * we extract the leading number so the UI can show the friendlier remanejamento
 * copy. Returns null when the error is something else (generic failure).
 */
function parseInUseCount(message: string): number | null {
  if (!/usuário\(s\)/i.test(message)) return null;
  const match = message.match(/(\d+)\s*usuário/i);
  return match ? Number(match[1]) : null;
}

/**
 * Master rail of roles (PRD-211 — scaffold in Task 9, CRUD in Task 11).
 *
 * Groups roles into "De sistema" / "Personalizados", marks the selected one
 * with a left accent, shows a lock badge on system roles, and exposes an
 * Owner-gated "Novo papel" button. Each role carries a kebab menu: system roles
 * offer only "Duplicar"; custom roles add "Renomear" / "Excluir". Create,
 * duplicate and rename run through `RoleFormDialog`; delete runs behind an
 * `AlertDialog` and surfaces the provider's in-use guard. Collapses to a
 * `Select` under 768px.
 */
export function RoleRail({
  roles,
  selectedId,
  onSelect,
  onRoleCreated,
  onRolesChanged,
  onRoleDeleted,
}: IRoleRailProps) {
  const isMobile = useIsMobile();
  const provider = useRolesProvider();
  const canCreate = usePermission("role", "create");
  const canEdit = usePermission("role", "edit");
  const canDelete = usePermission("role", "delete");

  // Role-form dialog state (create / duplicate / rename share one dialog).
  const [formMode, setFormMode] = useState<RoleFormMode | null>(null);
  const [formSource, setFormSource] = useState<IRole | null>(null);
  // Delete-confirm target.
  const [deleteTarget, setDeleteTarget] = useState<IRole | null>(null);

  const { systemRoles, customRoles } = useMemo(() => {
    const systemRoles = roles.filter((r) => r.isSystem);
    const customRoles = roles.filter((r) => !r.isSystem);
    return { systemRoles, customRoles };
  }, [roles]);

  const openCreate = () => {
    setFormSource(null);
    setFormMode("create");
  };
  const openDuplicate = (role: IRole) => {
    setFormSource(role);
    setFormMode("duplicate");
  };
  const openRename = (role: IRole) => {
    setFormSource(role);
    setFormMode("edit-meta");
  };

  const deleteMutation = useMutation({
    mutationFn: (role: IRole) => provider.remove(role.id),
    onSuccess: async (_data, role) => {
      toast.success(ROLE_EDITOR_LABELS.deleteSuccess);
      setDeleteTarget(null);
      await onRoleDeleted?.(role.id);
    },
    onError: (err: Error) => {
      const count = parseInUseCount(err.message);
      if (count !== null) {
        toast.error(ROLE_EDITOR_LABELS.deleteInUse(count));
      } else {
        toast.error(ROLE_EDITOR_LABELS.deleteError, { description: err.message });
      }
      // Keep the dialog open so the user can read the reason and cancel.
    },
  });

  const newRoleButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!canCreate}
      onClick={canCreate ? openCreate : undefined}
      className="w-full justify-start gap-2"
    >
      <Icon icon="mdi:plus" size={16} />
      {ROLE_EDITOR_LABELS.newRole}
    </Button>
  );

  const dialogs = (
    <>
      {formMode && (
        <RoleFormDialog
          mode={formMode}
          open={formMode !== null}
          onOpenChange={(next) => {
            if (!next) {
              setFormMode(null);
              setFormSource(null);
            }
          }}
          roles={roles}
          sourceRole={formSource}
          onCreated={async (role) => {
            await onRoleCreated?.(role);
          }}
          onUpdated={async () => {
            await onRolesChanged?.();
          }}
        />
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next && !deleteMutation.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ROLE_EDITOR_LABELS.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? ROLE_EDITOR_LABELS.deleteBody(deleteTarget.name) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {ROLE_EDITOR_LABELS.deleteCancel}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-severity-critical text-white hover:bg-severity-critical/90"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                // Keep the dialog mounted on error (do not auto-close).
                event.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget);
              }}
            >
              {deleteMutation.isPending ? (
                <span className="flex items-center gap-1.5">
                  <Icon icon="mdi:loading" size={16} className="animate-spin" />
                  {ROLE_EDITOR_LABELS.saving2}
                </span>
              ) : (
                ROLE_EDITOR_LABELS.deleteConfirm
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (isMobile) {
    return (
      <div className="space-y-3">
        <Select value={selectedId ?? undefined} onValueChange={onSelect}>
          <SelectTrigger aria-label={ROLE_EDITOR_LABELS.railSelectLabel}>
            <SelectValue placeholder={ROLE_EDITOR_LABELS.railSelectLabel} />
          </SelectTrigger>
          <SelectContent>
            {roles.map((role) => (
              <SelectItem key={role.id} value={role.id}>
                <span className="flex items-center gap-2">
                  <Icon icon={roleIcon(role)} size={15} />
                  {role.name}
                  {role.isSystem && (
                    <Icon
                      icon="mdi:lock"
                      size={12}
                      className="text-muted-foreground"
                      ariaLabel={ROLE_EDITOR_LABELS.systemRoleBadge}
                    />
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Actions on the selected role (the rail list collapses on mobile). */}
        {selectedId && (
          <RoleActionsMenu
            role={roles.find((r) => r.id === selectedId) ?? null}
            canCreate={canCreate}
            canEdit={canEdit}
            canDelete={canDelete}
            onDuplicate={openDuplicate}
            onRename={openRename}
            onDelete={setDeleteTarget}
            trigger={
              <Button type="button" variant="outline" size="sm" className="w-full gap-2">
                <Icon icon="mdi:dots-vertical" size={16} />
                {ROLE_EDITOR_LABELS.roleActionsLabel}
              </Button>
            }
          />
        )}

        <NewRoleControl canCreate={canCreate}>{newRoleButton}</NewRoleControl>
        {dialogs}
      </div>
    );
  }

  return (
    <nav aria-label={ROLE_EDITOR_LABELS.pageTitle} className="flex flex-col gap-4">
      <RoleGroup
        heading={ROLE_EDITOR_LABELS.railSystemHeading}
        roles={systemRoles}
        selectedId={selectedId}
        onSelect={onSelect}
        roleIcon={roleIcon}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        onDuplicate={openDuplicate}
        onRename={openRename}
        onDelete={setDeleteTarget}
      />
      {customRoles.length > 0 && (
        <RoleGroup
          heading={ROLE_EDITOR_LABELS.railCustomHeading}
          roles={customRoles}
          selectedId={selectedId}
          onSelect={onSelect}
          roleIcon={roleIcon}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
          onDuplicate={openDuplicate}
          onRename={openRename}
          onDelete={setDeleteTarget}
        />
      )}
      <NewRoleControl canCreate={canCreate}>{newRoleButton}</NewRoleControl>
      {dialogs}
    </nav>
  );
}

function RoleGroup({
  heading,
  roles,
  selectedId,
  onSelect,
  roleIcon,
  canCreate,
  canEdit,
  canDelete,
  onDuplicate,
  onRename,
  onDelete,
}: {
  heading: string;
  roles: IRole[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  roleIcon: (role: IRole) => string;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onDuplicate: (role: IRole) => void;
  onRename: (role: IRole) => void;
  onDelete: (role: IRole) => void;
}) {
  return (
    <div className="space-y-1">
      <h3 className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {heading}
      </h3>
      <ul className="space-y-0.5">
        {roles.map((role) => {
          const selected = role.id === selectedId;
          return (
            <li key={role.id} className="group/role flex items-center">
              <button
                type="button"
                onClick={() => onSelect(role.id)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-md border-l-2 border-transparent px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                  selected
                    ? "border-primary bg-primary/10 font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <Icon icon={roleIcon(role)} size={16} className="shrink-0" />
                <span className="flex-1 truncate">{role.name}</span>
                {role.isSystem && (
                  <Icon
                    icon="mdi:lock"
                    size={13}
                    className="shrink-0 text-muted-foreground/70"
                    ariaLabel={ROLE_EDITOR_LABELS.systemRoleBadge}
                  />
                )}
              </button>
              <RoleActionsMenu
                role={role}
                canCreate={canCreate}
                canEdit={canEdit}
                canDelete={canDelete}
                onDuplicate={onDuplicate}
                onRename={onRename}
                onDelete={onDelete}
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground"
                    aria-label={ROLE_EDITOR_LABELS.roleActionsLabel}
                  >
                    <Icon icon="mdi:dots-vertical" size={16} />
                  </Button>
                }
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Per-role kebab menu. System roles expose only "Duplicar"; custom roles add
 * "Renomear" / "Excluir". Each action is gated by the matching permission —
 * Duplicar uses `role:create`, Renomear `role:edit`, Excluir `role:delete`.
 */
function RoleActionsMenu({
  role,
  canCreate,
  canEdit,
  canDelete,
  onDuplicate,
  onRename,
  onDelete,
  trigger,
}: {
  role: IRole | null;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onDuplicate: (role: IRole) => void;
  onRename: (role: IRole) => void;
  onDelete: (role: IRole) => void;
  trigger: React.ReactNode;
}) {
  if (!role) return null;
  const isCustom = !role.isSystem;
  // Duplicating the Dono produced a clone with base `Owner` — listed in the
  // assignment dropdown, then refused by the Edge with 403. Its permission set
  // isn't copyable in any useful way either, since Owner's power comes from the
  // base role, not from the matrix.
  const canDuplicate = canCreate && !role.isOwnerImmutable;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem disabled={!canDuplicate} onSelect={() => onDuplicate(role)}>
          <Icon icon="mdi:content-copy" size={15} />
          {ROLE_EDITOR_LABELS.actionDuplicate}
        </DropdownMenuItem>
        {isCustom && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canEdit} onSelect={() => onRename(role)}>
              <Icon icon="mdi:pencil" size={15} />
              {ROLE_EDITOR_LABELS.actionRename}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canDelete}
              onSelect={() => onDelete(role)}
              className="text-severity-critical focus:text-severity-critical"
            >
              <Icon icon="mdi:trash-can-outline" size={15} />
              {ROLE_EDITOR_LABELS.actionDelete}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Wraps the (possibly disabled) button in a tooltip explaining the gate. */
function NewRoleControl({
  canCreate,
  children,
}: {
  canCreate: boolean;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        {/* span keeps the tooltip working while the button is disabled. */}
        <TooltipTrigger asChild>
          <span className="inline-block w-full">{children}</span>
        </TooltipTrigger>
        <TooltipContent>
          {canCreate
            ? ROLE_EDITOR_LABELS.newRoleTooltip
            : ROLE_EDITOR_LABELS.newRoleForbiddenTooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
