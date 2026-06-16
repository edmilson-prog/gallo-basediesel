import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IRole } from "@/shared/types";
import { useRolesProvider } from "@/providers/data";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { RoleRail } from "../components/role-editor/RoleRail";
import { PermissionMatrix } from "../components/role-editor/PermissionMatrix";
import { ROLE_EDITOR_LABELS } from "../i18n/pt-BR";

/** Picks the default selection: the Owner role, else the first role. */
function pickDefaultRole(roles: IRole[]): IRole | undefined {
  return roles.find((r) => r.baseRole === "Owner") ?? roles[0];
}

/**
 * Role editor (PRD-211 Task 9 — read-only scaffold).
 *
 * Master-detail: `RoleRail` on the left, `PermissionMatrix` of the selected
 * role on the right. Roles and the resource catalog come from the roles
 * provider via TanStack Query. Everything is read-only; editing / persistence
 * arrive in the editable task.
 */
export function RolesPage() {
  const provider = useRolesProvider();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rolesQuery = useQuery({
    queryKey: ["rbac", "roles"],
    queryFn: () => provider.list(),
  });
  const resourcesQuery = useQuery({
    queryKey: ["rbac", "resources"],
    queryFn: () => provider.listResources(),
  });

  const roles = rolesQuery.data;
  const resources = resourcesQuery.data;

  // Default selection once roles load (Owner role).
  useEffect(() => {
    if (!roles || selectedId) return;
    const initial = pickDefaultRole(roles);
    if (initial) setSelectedId(initial.id);
  }, [roles, selectedId]);

  const selectedRole = useMemo(
    () => roles?.find((r) => r.id === selectedId),
    [roles, selectedId],
  );

  const isLoading = rolesQuery.isLoading || resourcesQuery.isLoading;
  const isError = rolesQuery.isError || resourcesQuery.isError;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Glassmorphism page header */}
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/85 px-6 py-4 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {ROLE_EDITOR_LABELS.pageTitle}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {ROLE_EDITOR_LABELS.pageDescription}
        </p>
      </header>

      <div className="flex-1 px-6 py-5">
        {isError ? (
          <ErrorState onRetry={() => void Promise.all([rolesQuery.refetch(), resourcesQuery.refetch()])} />
        ) : isLoading || !roles || !resources ? (
          <LoadingState />
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[16rem_1fr]">
            <aside className="md:sticky md:top-24 md:self-start">
              <RoleRail roles={roles} selectedId={selectedId} onSelect={setSelectedId} />
            </aside>
            <section className="min-w-0">
              {selectedRole ? (
                <PermissionMatrix role={selectedRole} resources={resources} />
              ) : (
                <EmptyState />
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-[16rem_1fr]">
      <div className="space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
      <Skeleton className="h-[28rem] w-full" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-center">
      <Icon icon="mdi:shield-account-outline" size={32} className="text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Selecione um papel para ver suas permissões.</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-center">
      <Icon icon="mdi:alert-circle-outline" size={32} className="text-severity-critical" />
      <p className="text-sm text-muted-foreground">Não foi possível carregar os papéis.</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Tentar novamente
      </button>
    </div>
  );
}
