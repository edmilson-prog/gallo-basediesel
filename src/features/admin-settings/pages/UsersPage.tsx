import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ISeller } from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { useDepartmentsProvider, useSellersProvider } from "@/providers/data";
import { AUTH_SOURCE } from "@/features/auth/authSource";
import { useAuth } from "@/features/auth/useAuth";
import { mapDbRoleToRoleName } from "@/features/auth/roleMap";
import { useStorePresence } from "@/features/shell/hooks/useStorePresence";
import { SectionHeader } from "../components/SectionHeader";
import { listSellerAccessInfo, type ISellerAccessInfo } from "../api/sellerAccess";
import { CreateAccessDialog } from "../components/CreateAccessDialog";
import { ChangeRoleDialog } from "../components/ChangeRoleDialog";
import { ResetPasswordDialog } from "../components/ResetPasswordDialog";
import { ResetMfaDialog } from "../components/ResetMfaDialog";
import { ToggleSellerAccessButton } from "../components/ToggleSellerAccessButton";
import { SellerFormDialog } from "../components/SellerFormDialog";
import { DeleteSellerDialog } from "../components/DeleteSellerDialog";

const ROLE_LABEL: Record<ISeller["type"], string> = {
  internal: "Vendedor interno",
  external: "Vendedor externo",
  representative: "Representante",
};

const SUPABASE_AUTH = AUTH_SOURCE === "supabase";

const LAST_SIGN_IN_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

/** Secondary line under the e-mail: last sign-in, or a placeholder in demo mode. */
function lastAccessLabel(
  info: ISellerAccessInfo | undefined,
  supabaseAuth: boolean,
): string | null {
  if (!supabaseAuth) return "Último acesso: —";
  if (!info) return null; // no access yet — nothing to show
  if (!info.lastSignInAt) return "Nunca acessou";
  return `Último acesso: ${LAST_SIGN_IN_FORMAT.format(new Date(info.lastSignInAt))}`;
}

/**
 * Usuários — CRUD completo da equipe (users CRUD + PRD-107 Fase 3).
 *
 * Cadastro/edição/exclusão (soft delete) funcionam em ambas as fontes de dados
 * via ISellersProvider. As operações de ACESSO (criar login, redefinir senha,
 * papéis, desligar/reativar) exigem o backend Supabase (Edge Functions).
 */
export function UsersPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const provider = useSellersProvider();
  const departmentsProvider = useDepartmentsProvider();
  const [inviteFor, setInviteFor] = useState<ISeller | null>(null);
  const [resetFor, setResetFor] = useState<ISeller | null>(null);
  const [mfaResetFor, setMfaResetFor] = useState<ISeller | null>(null);
  const [roleFor, setRoleFor] = useState<ISeller | null>(null);
  const [editFor, setEditFor] = useState<ISeller | null>(null);
  const [deleteFor, setDeleteFor] = useState<ISeller | null>(null);
  const [creating, setCreating] = useState(false);
  const { userRole, currentUser } = useAuth();
  const isOwner = userRole === "Owner";

  const presence = useStorePresence(storeId);

  const sellersQuery = useQuery({
    queryKey: ["sellers", storeId],
    queryFn: () => provider.list({ storeId }),
  });

  const accessQuery = useQuery({
    queryKey: ["seller-access", storeId],
    queryFn: () => listSellerAccessInfo(),
    enabled: SUPABASE_AUTH,
  });

  const departmentsQuery = useQuery({
    queryKey: ["departments", storeId],
    queryFn: () => departmentsProvider.list({ storeId }),
  });

  const sellers = sellersQuery.data;
  const accessInfo = accessQuery.data ?? new Map<string, ISellerAccessInfo>();
  const departmentNameById = new Map(
    (departmentsQuery.data ?? []).map((d) => [d.id, d.name] as const),
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Usuários"
        description="Gerencie quem tem acesso à plataforma — vendedores internos, externos, representantes e usuários administrativos."
      />

      {!SUPABASE_AUTH && (
        <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          As operações de acesso (criar login, redefinir senha, papéis, desligar) exigem o backend
          Supabase ativo (<code className="font-mono text-xs">VITE_AUTH_SOURCE=supabase</code>).
          Cadastro, edição e exclusão funcionam também em modo demonstração.
        </div>
      )}

      <div className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Equipe atual da loja
          </p>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setEditFor(null);
              setCreating(true);
            }}
          >
            <Icon icon="mdi:account-plus" size={16} />
            Novo usuário
          </Button>
        </div>
        {!sellers ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <ul className="space-y-2">
            {sellers.map((s) => {
              const accessRole = accessInfo.get(s.id)?.role;
              const hasAccess = accessRole !== undefined;
              const isOwnerAccess = accessRole === "owner";
              const isSelf = currentUser?.sellerId === s.id;
              const isOnline = presence ? presence.has(s.id) : s.availability !== "offline";
              const accessLabel = lastAccessLabel(accessInfo.get(s.id), SUPABASE_AUTH);
              const departmentName = s.departmentId
                ? departmentNameById.get(s.departmentId)
                : undefined;
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {s.fullName.slice(0, 2).toUpperCase()}
                      </div>
                      <span
                        aria-hidden
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
                          isOnline ? "bg-severity-success" : "bg-muted-foreground/40",
                        )}
                      />
                    </div>
                    <div>
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        {s.fullName}
                        {isOnline && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-severity-success">
                            Online
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground/80">
                        <Icon icon="mdi:office-building-outline" size={12} />
                        {departmentName ?? "Sem departamento"}
                      </p>
                      {accessLabel && (
                        <p className="text-[11px] text-muted-foreground/80">{accessLabel}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{ROLE_LABEL[s.type]}</Badge>
                    {SUPABASE_AUTH && accessRole === "manager" && (
                      <Badge variant="outline" className="border-primary/40 text-primary">
                        Gestor
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      onClick={() => setEditFor(s)}
                    >
                      <Icon icon="mdi:pencil-outline" size={14} />
                      Editar
                    </Button>
                    {SUPABASE_AUTH &&
                      (accessQuery.isLoading ? (
                        <Skeleton className="h-6 w-28" />
                      ) : !hasAccess ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => setInviteFor(s)}
                        >
                          <Icon icon="mdi:account-plus-outline" size={14} />
                          Criar acesso
                        </Button>
                      ) : (
                        <>
                          {s.active ? (
                            <Badge
                              variant="outline"
                              className="gap-1 border-severity-success/40 text-severity-success"
                            >
                              <Icon icon="mdi:check-circle" size={12} />
                              Acesso ativo
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-muted-foreground">
                              <Icon icon="mdi:cancel" size={12} />
                              Desligado
                            </Badge>
                          )}
                          {!isOwnerAccess && (
                            <>
                              {isOwner && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-1.5"
                                  onClick={() => setRoleFor(s)}
                                >
                                  <Icon icon="mdi:account-switch-outline" size={14} />
                                  Alterar papel
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-1.5"
                                onClick={() => setResetFor(s)}
                              >
                                <Icon icon="mdi:key-variant" size={14} />
                                Redefinir senha
                              </Button>
                              {isOwner && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-1.5"
                                  onClick={() => setMfaResetFor(s)}
                                >
                                  <Icon icon="mdi:cellphone-remove" size={14} />
                                  Remover 2FA
                                </Button>
                              )}
                              <ToggleSellerAccessButton seller={s} storeId={storeId} />
                            </>
                          )}
                        </>
                      ))}
                    {!isOwnerAccess && !isSelf && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-destructive hover:text-destructive"
                        onClick={() => setDeleteFor(s)}
                      >
                        <Icon icon="mdi:trash-can-outline" size={14} />
                        Excluir
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {SUPABASE_AUTH && accessQuery.isError && (
          <p className="mt-3 text-xs text-severity-critical">
            Não foi possível carregar o status de acesso. Verifique se você está logado como gestor.
          </p>
        )}
      </div>

      {SUPABASE_AUTH && (
        <p className="text-xs italic text-muted-foreground">
          O cadastro cria o usuário sem login — use "Criar acesso" para liberar a plataforma (senha
          temporária ou convite por e-mail). A exclusão preserva o histórico de vendas e conversas.
        </p>
      )}

      {(creating || editFor) && (
        <SellerFormDialog
          storeId={storeId}
          seller={editFor}
          hasAccess={editFor ? accessInfo.has(editFor.id) : false}
          open={creating || editFor !== null}
          onOpenChange={(open) => {
            if (!open) {
              setCreating(false);
              setEditFor(null);
            }
          }}
        />
      )}

      {deleteFor && (
        <DeleteSellerDialog
          seller={deleteFor}
          storeId={storeId}
          open={deleteFor !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteFor(null);
          }}
        />
      )}

      {inviteFor && (
        <CreateAccessDialog
          seller={inviteFor}
          storeId={storeId}
          open={inviteFor !== null}
          onOpenChange={(open) => {
            if (!open) setInviteFor(null);
          }}
        />
      )}

      {resetFor && (
        <ResetPasswordDialog
          seller={resetFor}
          open={resetFor !== null}
          onOpenChange={(open) => {
            if (!open) setResetFor(null);
          }}
        />
      )}

      {mfaResetFor && (
        <ResetMfaDialog
          seller={mfaResetFor}
          open={mfaResetFor !== null}
          onOpenChange={(open) => {
            if (!open) setMfaResetFor(null);
          }}
        />
      )}

      {roleFor &&
        (() => {
          const info = accessInfo.get(roleFor.id);
          // Effective role id: the custom override if pinned, else the system
          // role id (=== RoleName) derived from the base role.
          const currentRoleId =
            info?.roleId ?? mapDbRoleToRoleName(info?.role ?? "seller_internal");
          return (
            <ChangeRoleDialog
              seller={roleFor}
              storeId={storeId}
              currentRoleId={currentRoleId}
              open={roleFor !== null}
              onOpenChange={(open) => {
                if (!open) setRoleFor(null);
              }}
            />
          );
        })()}
    </div>
  );
}
