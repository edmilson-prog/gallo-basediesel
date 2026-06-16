import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { toast } from "sonner";
import type { IRole, PermissionAction, PermissionScope } from "@/shared/types";
import { useRolesProvider } from "@/providers/data";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { usePermission } from "../hooks/usePermission";
import { rehydrateRbac } from "../store/useRbacHydration";
import { RoleRail } from "../components/role-editor/RoleRail";
import { PermissionMatrix } from "../components/role-editor/PermissionMatrix";
import { SystemRoleWarning } from "../components/role-editor/SystemRoleWarning";
import { usePermissionDraft } from "../components/role-editor/usePermissionDraft";
import { ROLE_EDITOR_LABELS } from "../i18n/pt-BR";

/** Picks the default selection: the Owner role, else the first role. */
function pickDefaultRole(roles: IRole[]): IRole | undefined {
  return roles.find((r) => r.baseRole === "Owner") ?? roles[0];
}

/**
 * Role editor (PRD-211 Task 10 — editable matrix).
 *
 * Master-detail: `RoleRail` on the left, an editable `PermissionMatrix` of the
 * selected role on the right. The page owns a per-role draft of the permission
 * matrix; a persistent action bar offers Salvar / Descartar with an unsaved
 * indicator. Owner is immutable; system roles surface a first-edit warning and
 * a Restaurar padrão action. Saving persists via the roles provider, then
 * invalidates the TanStack Query and re-hydrates the in-memory RBAC cache so
 * `hasPermission` (and menu/route guards) reflect the new matrix.
 */
export function RolesPage() {
  const provider = useRolesProvider();
  const queryClient = useQueryClient();
  const canEditRoles = usePermission("role", "edit");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Session-wide opt-out of the system-role first-edit warning ("Não avisar
  // novamente nesta sessão"). Lives at the page level so it spans role switches.
  const [systemWarningAcknowledged, setSystemWarningAcknowledged] = useState(false);

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

  const selectedRole = useMemo(
    () => roles?.find((r) => r.id === selectedId),
    [roles, selectedId],
  );

  // Default selection once roles load, and re-pick a valid one if the selected
  // role vanished after a refetch (e.g. removed elsewhere).
  useEffect(() => {
    if (!roles || roles.length === 0) return;
    if (selectedId && roles.some((r) => r.id === selectedId)) return;
    const initial = pickDefaultRole(roles);
    setSelectedId(initial ? initial.id : null);
  }, [roles, selectedId]);

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
          <ErrorState
            onRetry={() => void Promise.all([rolesQuery.refetch(), resourcesQuery.refetch()])}
          />
        ) : isLoading || !roles || !resources ? (
          <LoadingState />
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[16rem_1fr]">
            <aside className="md:sticky md:top-24 md:self-start">
              <RoleRail roles={roles} selectedId={selectedId} onSelect={setSelectedId} />
            </aside>
            <section className="min-w-0">
              {selectedRole ? (
                <RoleEditor
                  key={selectedRole.id}
                  role={selectedRole}
                  resources={resources}
                  canEditRoles={canEditRoles}
                  systemWarningAcknowledged={systemWarningAcknowledged}
                  onAcknowledgeSystemWarning={() => setSystemWarningAcknowledged(true)}
                  onPersisted={async () => {
                    // Refetch roles, re-hydrate the RBAC cache from the fresh set.
                    await queryClient.invalidateQueries({ queryKey: ["rbac", "roles"] });
                    await rehydrateRbac(provider.list());
                  }}
                />
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

interface IRoleEditorProps {
  role: IRole;
  resources: import("@/shared/types").IRbacResource[];
  canEditRoles: boolean;
  /** True once the user opted out of the system-role warning for the session. */
  systemWarningAcknowledged: boolean;
  /** Propagates a session-wide opt-out up to the page. */
  onAcknowledgeSystemWarning: () => void;
  onPersisted: () => Promise<void>;
}

/**
 * Editing surface for a single role — keyed by `role.id` so the draft resets
 * cleanly on selection change (and re-bases when the provider data changes).
 */
function RoleEditor({
  role,
  resources,
  canEditRoles,
  systemWarningAcknowledged,
  onAcknowledgeSystemWarning,
  onPersisted,
}: IRoleEditorProps) {
  const provider = useRolesProvider();
  const draft = usePermissionDraft(role);
  const { dirty } = draft;

  // The matrix is editable only when the user may edit roles and the role is not
  // the immutable Owner.
  const editable = canEditRoles && !role.isOwnerImmutable;

  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  // --- System-role first-edit warning state ---
  const [warningOpen, setWarningOpen] = useState(false);
  const [warningDontAsk, setWarningDontAsk] = useState(false);
  // Suppress the warning once acknowledged for THIS role's editing session
  // (independent of the page-level opt-out).
  const localAcknowledgedRef = useRef(false);
  // The edit pending behind the warning dialog.
  const pendingEditRef = useRef<{ resource: string; action: PermissionAction } | null>(null);

  // Re-base the draft when the persisted role object changes (post save/restore
  // refetch hands a new object with the same id).
  useEffect(() => {
    draft.rebase(role);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const needsSystemWarning =
    role.isSystem &&
    !role.isOwnerImmutable &&
    !systemWarningAcknowledged &&
    !localAcknowledgedRef.current;

  const handleToggle = useCallback(
    (resource: string, action: PermissionAction) => {
      if (!editable) return;
      if (needsSystemWarning) {
        // First edit of a system role — gate behind the warning.
        pendingEditRef.current = { resource, action };
        setWarningOpen(true);
        return;
      }
      draft.toggleAction(resource, action);
    },
    [editable, needsSystemWarning, draft],
  );

  const handleScopeChange = useCallback(
    (resource: string, scope: PermissionScope) => {
      if (!editable) return;
      draft.setScope(resource, scope);
    },
    [editable, draft],
  );

  const confirmWarning = useCallback(() => {
    localAcknowledgedRef.current = true;
    if (warningDontAsk) onAcknowledgeSystemWarning();
    setWarningOpen(false);
    const pending = pendingEditRef.current;
    pendingEditRef.current = null;
    if (pending) draft.toggleAction(pending.resource, pending.action);
  }, [warningDontAsk, onAcknowledgeSystemWarning, draft]);

  const cancelWarning = useCallback(() => {
    setWarningOpen(false);
    pendingEditRef.current = null;
  }, []);

  const handleSave = useCallback(async () => {
    if (!editable || !dirty || saving) return;
    setSaving(true);
    try {
      await provider.setPermissions(role.id, draft.serialize());
      await onPersisted();
      toast.success(ROLE_EDITOR_LABELS.saveSuccess);
      // The rebase effect clears the dirty flag once the fresh role arrives.
    } catch {
      toast.error(ROLE_EDITOR_LABELS.saveError);
    } finally {
      setSaving(false);
    }
  }, [editable, dirty, saving, provider, role.id, draft, onPersisted]);

  const handleDiscard = useCallback(() => {
    draft.reset(role);
  }, [draft, role]);

  const handleRestore = useCallback(async () => {
    setRestoreOpen(false);
    if (restoring) return;
    setRestoring(true);
    try {
      await provider.restoreDefaults(role.id);
      await onPersisted();
      toast.success(ROLE_EDITOR_LABELS.restoreSuccess);
    } catch {
      toast.error(ROLE_EDITOR_LABELS.restoreError);
    } finally {
      setRestoring(false);
    }
  }, [restoring, provider, role.id, onPersisted]);

  // Block in-app navigation while there are unsaved edits.
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const blocker = useBlocker({
    shouldBlockFn: () => dirtyRef.current,
    enableBeforeUnload: () => dirtyRef.current,
    withResolver: true,
  });

  // Guard hard reloads / tab close too.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const showActionBar = editable;

  return (
    <div className="flex flex-col gap-3">
      <PermissionMatrix
        role={role}
        resources={resources}
        draft={draft.draft}
        changedResources={draft.changedResources}
        editable={editable}
        onToggle={handleToggle}
        onScopeChange={handleScopeChange}
      />

      {/* Persistent action bar */}
      {showActionBar && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80">
          {dirty ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-severity-warning">
              <Icon icon="mdi:circle-medium" size={18} />
              {ROLE_EDITOR_LABELS.unsavedIndicator}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{role.name}</span>
          )}

          <div className="ml-auto flex items-center gap-2">
            {role.isSystem && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5"
                disabled={restoring}
                onClick={() => setRestoreOpen(true)}
              >
                <Icon icon="mdi:backup-restore" size={16} />
                {ROLE_EDITOR_LABELS.restoreDefaults}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!dirty || saving}
              onClick={handleDiscard}
            >
              {ROLE_EDITOR_LABELS.discard}
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={!dirty || saving}
              onClick={() => void handleSave()}
            >
              {saving ? (
                <>
                  <Icon icon="mdi:loading" size={16} className="animate-spin" />
                  {ROLE_EDITOR_LABELS.saving}
                </>
              ) : (
                <>
                  <Icon icon="mdi:content-save" size={16} />
                  {ROLE_EDITOR_LABELS.save}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* No-edit-permission hint (matrix stays read-only). */}
      {!canEditRoles && !role.isOwnerImmutable && (
        <p className="px-1 text-xs text-muted-foreground">
          {ROLE_EDITOR_LABELS.noEditPermissionHint}
        </p>
      )}

      {/* System-role first-edit warning */}
      <SystemRoleWarning
        open={warningOpen}
        dontAskAgain={warningDontAsk}
        onDontAskAgainChange={setWarningDontAsk}
        onConfirm={confirmWarning}
        onCancel={cancelWarning}
      />

      {/* Restore-to-defaults confirmation */}
      <AlertDialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ROLE_EDITOR_LABELS.restoreTitle}</AlertDialogTitle>
            <AlertDialogDescription>{ROLE_EDITOR_LABELS.restoreBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{ROLE_EDITOR_LABELS.restoreCancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRestore()}>
              {ROLE_EDITOR_LABELS.restoreConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved-changes navigation guard */}
      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ROLE_EDITOR_LABELS.unsavedTitle}</AlertDialogTitle>
            <AlertDialogDescription>{ROLE_EDITOR_LABELS.unsavedBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.status === "blocked" && blocker.reset()}>
              {ROLE_EDITOR_LABELS.unsavedKeepEditing}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (blocker.status === "blocked") {
                  dirtyRef.current = false;
                  blocker.proceed();
                }
              }}
            >
              {ROLE_EDITOR_LABELS.unsavedConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
