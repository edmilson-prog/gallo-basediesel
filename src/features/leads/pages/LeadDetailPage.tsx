import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { LeadHeader } from "../components/detail/LeadHeader";
import { LeadDataCard } from "../components/detail/LeadDataCard";
import { LeadTabs } from "../components/detail/LeadTabs";
import { ConvertLeadModal } from "../components/ConvertLeadModal";
import { MarkAsLostModal } from "../components/MarkAsLostModal";
import { useLeadDetail } from "../hooks/useLeadDetail";
import { isConverted, isLost } from "../utils/leadDisplay";
import { LEADS_STRINGS } from "../i18n/pt-BR";

export function LeadDetailPage() {
  const { id } = useParams({ from: "/app/leads/$id" });
  const navigate = useNavigate();
  const canEdit = usePermission("lead", "edit");

  const detail = useLeadDetail(id);
  const lead = detail.data ?? null;

  const sellersProvider = useSellersProvider();
  const customersProvider = useCustomersProvider();

  const sellerQuery = useQuery({
    queryKey: ["seller", lead?.sellerId] as const,
    enabled: Boolean(lead?.sellerId),
    staleTime: 5 * 60_000,
    queryFn: () => sellersProvider.get(lead!.sellerId).catch(() => null),
  });

  const convertedCustomerQuery = useQuery({
    queryKey: ["lead-converted-customer", lead?.convertedToCustomerId] as const,
    enabled: Boolean(lead?.convertedToCustomerId),
    staleTime: 60_000,
    queryFn: () => customersProvider.get(lead!.convertedToCustomerId as ID).catch(() => null),
  });

  const [editing, setEditing] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);

  useEffect(() => {
    setEditing(false);
  }, [id]);

  const converted = useMemo(() => (lead ? isConverted(lead) : false), [lead]);
  const lost = useMemo(() => (lead ? isLost(lead) : false), [lead]);

  if (detail.isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center text-sm text-muted-foreground">
        Carregando lead…
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-3 text-center">
        <Icon icon="mdi:alert-circle-outline" size={28} className="text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">{LEADS_STRINGS.detail.notFound}</p>
        <p className="text-xs text-muted-foreground">{LEADS_STRINGS.detail.description}</p>
        <Button size="sm" onClick={() => void navigate({ to: "/app/leads" })}>
          {LEADS_STRINGS.page.backToList}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col bg-background">
      <LeadHeader
        lead={lead}
        seller={sellerQuery.data ?? undefined}
        convertedCustomer={convertedCustomerQuery.data ?? null}
        canEdit={canEdit && !converted && !lost}
        onEdit={() => setEditing(true)}
        onMarkConverted={() => setConvertOpen(true)}
        onMarkLost={() => setLostOpen(true)}
      />

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto grid max-w-5xl gap-4">
          <LeadDataCard
            lead={lead}
            seller={sellerQuery.data ?? undefined}
            canEdit={canEdit && !converted && !lost}
            editing={editing}
            onCancelEdit={() => setEditing(false)}
          />
          <div className="rounded-lg border border-border bg-card p-4">
            <LeadTabs lead={lead} />
          </div>
        </div>
      </div>

      <ConvertLeadModal
        lead={convertOpen ? lead : null}
        onClose={() => setConvertOpen(false)}
        onConverted={(customerId) => {
          setConvertOpen(false);
          void navigate({ to: "/app/clientes/$id", params: { id: customerId } });
        }}
      />

      <MarkAsLostModal
        lead={lostOpen ? lead : null}
        onClose={() => setLostOpen(false)}
        onMarked={() => {
          setLostOpen(false);
          void detail.refetch();
        }}
      />
    </div>
  );
}
