import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ISeller } from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { useSellersProvider } from "@/providers/data";
import { PlaceholderSection } from "../components/PlaceholderSection";

const ROLE_LABEL: Record<ISeller["type"], string> = {
  internal: "Vendedor interno",
  external: "Vendedor externo",
  representative: "Representante",
};

export function UsersPlaceholderPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const provider = useSellersProvider();
  const [sellers, setSellers] = useState<ISeller[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    provider.list({ storeId }).then((list) => {
      if (!cancelled) setSellers(list);
    });
    return () => {
      cancelled = true;
    };
  }, [provider, storeId]);

  return (
    <PlaceholderSection
      title="Usuários"
      description="Gerencie quem tem acesso à plataforma — vendedores internos, externos, representantes e usuários administrativos."
      icon="mdi:account-group-outline"
      prdCodes="020 + 105"
      whatComes={[
        "Cadastrar, desligar e reativar vendedores",
        "Atribuir papéis (Owner, Gestor, Vendedor, SDR, Financeiro)",
        "Override individual do modo de cadastro de veículos",
        "Definir disponibilidade fixa e regiões de atuação",
        "Convite por email com fluxo Supabase Auth",
      ]}
      statusNote="Por enquanto, a equipe é definida via seed do mock (PRD-004)."
    >
      <div className="rounded-md border border-border bg-card p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Equipe atual da loja
        </p>
        {!sellers ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <ul className="space-y-2">
            {sellers.map((s) => (
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
                  <Badge variant="secondary" className="gap-1">
                    <Icon
                      icon={
                        s.availability === "online"
                          ? "mdi:circle"
                          : s.availability === "ausente"
                            ? "mdi:moon-waning-crescent"
                            : "mdi:circle-outline"
                      }
                      size={10}
                    />
                    {s.availability}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PlaceholderSection>
  );
}
