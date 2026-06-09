import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ISeller } from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { useSellersProvider } from "@/providers/data";
import { AUTH_SOURCE } from "@/features/auth/authSource";
import { SectionHeader } from "../components/SectionHeader";
import { listSellerAccessRoles } from "../api/sellerAccess";
import { CreateAccessDialog } from "../components/CreateAccessDialog";
import { ResetPasswordDialog } from "../components/ResetPasswordDialog";
import { ToggleSellerAccessButton } from "../components/ToggleSellerAccessButton";

const ROLE_LABEL: Record<ISeller["type"], string> = {
  internal: "Vendedor interno",
  external: "Vendedor externo",
  representative: "Representante",
};

const SUPABASE_AUTH = AUTH_SOURCE === "supabase";

/**
 * Usuários — gestão de acesso à plataforma (PRD-107 Fase 3).
 *
 * Em modo Supabase: lista a equipe com o status de acesso e permite ao Owner
 * criar o login de cada vendedor (Edge Function `invite-seller`) e desligar/
 * reativar (Edge Function `set-seller-access`). Em modo mock, segue informativo
 * (a equipe vem do seed). Trocar papéis e convite por email chegam depois
 * (PRD-107 / PRD-141).
 */
export function UsersPlaceholderPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const provider = useSellersProvider();
  const [inviteFor, setInviteFor] = useState<ISeller | null>(null);
  const [resetFor, setResetFor] = useState<ISeller | null>(null);

  const sellersQuery = useQuery({
    queryKey: ["sellers", storeId],
    queryFn: () => provider.list({ storeId }),
  });

  const accessQuery = useQuery({
    queryKey: ["seller-access", storeId],
    queryFn: () => listSellerAccessRoles(storeId),
    enabled: SUPABASE_AUTH,
  });

  const sellers = sellersQuery.data;
  const accessRoles = accessQuery.data ?? new Map<string, string>();

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Usuários"
        description="Gerencie quem tem acesso à plataforma — vendedores internos, externos, representantes e usuários administrativos."
      />

      {!SUPABASE_AUTH && (
        <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          A criação de acessos exige o backend Supabase ativo (
          <code className="font-mono text-xs">VITE_AUTH_SOURCE=supabase</code>). Em modo mock, a
          equipe é definida pelo seed (PRD-004).
        </div>
      )}

      <div className="rounded-md border border-border bg-card p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Equipe atual da loja
        </p>
        {!sellers ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <ul className="space-y-2">
            {sellers.map((s) => {
              const accessRole = accessRoles.get(s.id);
              const hasAccess = accessRole !== undefined;
              const isOwnerAccess = accessRole === "owner";
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {s.fullName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{s.fullName}</p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{ROLE_LABEL[s.type]}</Badge>
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
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-1.5"
                                onClick={() => setResetFor(s)}
                              >
                                <Icon icon="mdi:key-variant" size={14} />
                                Redefinir senha
                              </Button>
                              <ToggleSellerAccessButton seller={s} storeId={storeId} />
                            </>
                          )}
                        </>
                      ))}
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
          Criar acesso, redefinir senha e desligar/reativar já disponíveis. Trocar papéis e convite
          por email chegam nas próximas fases (PRD-107 / PRD-141).
        </p>
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
    </div>
  );
}
