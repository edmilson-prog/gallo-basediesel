import { useMemo } from "react";
import type { IRole, RoleName } from "@/shared/types";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { usePermission } from "../../hooks/usePermission";
import { ROLE_EDITOR_LABELS } from "../../i18n/pt-BR";

export interface IRoleRailProps {
  roles: IRole[];
  selectedId: string | null;
  onSelect: (id: string) => void;
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
 * Master rail of roles (PRD-211 Task 9 — scaffold).
 *
 * Groups roles into "De sistema" / "Personalizados", marks the selected one
 * with a left accent, shows a lock badge on system roles, and exposes an
 * Owner-gated "Novo papel" button (present-but-disabled with a tooltip when the
 * user lacks `role:create`). Collapses to a `Select` under 768px.
 */
export function RoleRail({ roles, selectedId, onSelect }: IRoleRailProps) {
  const isMobile = useIsMobile();
  const canCreate = usePermission("role", "create");

  const { systemRoles, customRoles } = useMemo(() => {
    const systemRoles = roles.filter((r) => r.isSystem);
    const customRoles = roles.filter((r) => !r.isSystem);
    return { systemRoles, customRoles };
  }, [roles]);

  const newRoleButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!canCreate}
      className="w-full justify-start gap-2"
    >
      <Icon icon="mdi:plus" size={16} />
      {ROLE_EDITOR_LABELS.newRole}
    </Button>
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
        <NewRoleControl canCreate={canCreate}>{newRoleButton}</NewRoleControl>
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
      />
      {customRoles.length > 0 && (
        <RoleGroup
          heading={ROLE_EDITOR_LABELS.railCustomHeading}
          roles={customRoles}
          selectedId={selectedId}
          onSelect={onSelect}
          roleIcon={roleIcon}
        />
      )}
      <NewRoleControl canCreate={canCreate}>{newRoleButton}</NewRoleControl>
    </nav>
  );
}

function RoleGroup({
  heading,
  roles,
  selectedId,
  onSelect,
  roleIcon,
}: {
  heading: string;
  roles: IRole[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  roleIcon: (role: IRole) => string;
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
            <li key={role.id}>
              <button
                type="button"
                onClick={() => onSelect(role.id)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border-l-2 border-transparent px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/60",
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
            </li>
          );
        })}
      </ul>
    </div>
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
