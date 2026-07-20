import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, ILead } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { LeadHeader } from "../components/detail/LeadHeader";
import { LeadDataCard } from "../components/detail/LeadDataCard";
import { LeadTabs } from "../components/detail/LeadTabs";
import { ConvertLeadModal } from "../components/ConvertLeadModal";
import { MarkAsLostModal } from "../components/MarkAsLostModal";
import { useLeadDetail } from "../hooks/useLeadDetail";
import { isConverted, isLost } from "../utils/leadDisplay";
import {
  buildLeadPatch,
  toLeadDraft,
  validateLeadDraft,
  type ILeadDraft,
  type ILeadDraftErrors,
} from "../utils/leadDraft";
import { LEADS_STRINGS } from "../i18n/pt-BR";

export function LeadDetailPage() {
  const { id } = useParams({ from: "/app/leads/$id" });
  const navigate = useNavigate();
  const canEdit = usePermission("lead", "edit");

  const detail = useLeadDetail(id);
  const lead = detail.data ?? null;

  const sellersProvider = useSellersProvider();
  const customersProvider = useCustomersProvider();
  const leadsProvider = useLeadsProvider();
  const queryClient = useQueryClient();

  const sellerQuery = useQuery({
    queryKey: ["seller", lead?.sellerId] as const,
    enabled: Boolean(lead?.sellerId),
    staleTime: 5 * 60_000,
    queryFn: () => sellersProvider.get(lead!.sellerId as ID).catch(() => null),
  });

  const convertedCustomerQuery = useQuery({
    queryKey: ["lead-converted-customer", lead?.convertedToCustomerId] as const,
    enabled: Boolean(lead?.convertedToCustomerId),
    staleTime: 60_000,
    queryFn: () => customersProvider.get(lead!.convertedToCustomerId as ID).catch(() => null),
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ILeadDraft | null>(null);
  const [errors, setErrors] = useState<ILeadDraftErrors>({});
  const [saving, setSaving] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);

  useEffect(() => {
    setEditing(false);
    setDraft(null);
    setErrors({});
  }, [id]);

  const converted = useMemo(() => (lead ? isConverted(lead) : false), [lead]);
  const lost = useMemo(() => (lead ? isLost(lead) : false), [lead]);

  const startEdit = () => {
    if (!lead) return;
    setDraft(toLeadDraft(lead));
    setErrors({});
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(null);
    setErrors({});
    setEditing(false);
  };

  const changeDraft = (patch: Partial<ILeadDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const save = async () => {
    if (!lead || !draft) return;
    const validation = validateLeadDraft(draft);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    const patch = buildLeadPatch(lead, draft);
    if (Object.keys(patch).length === 0) {
      cancelEdit();
      return;
    }

    setSaving(true);
    try {
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const key of Object.keys(patch) as (keyof ILead)[]) {
        before[key] = lead[key];
        after[key] = patch[key];
      }

      await leadsProvider.update(lead.id, patch);
      auditLog({
        action: "lead.updated",
        resource: "lead",
        resourceId: lead.id,
        before,
        after,
      });
      toast.success(LEADS_STRINGS.toasts.updated);
      await queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
      await queryClient.invalidateQueries({ queryKey: ["leads-list"] });
      await queryClient.invalidateQueries({ queryKey: ["lead-audits", lead.id] });
      cancelEdit();
    } catch {
      toast.error(LEADS_STRINGS.toasts.updateError);
    } finally {
      setSaving(false);
    }
  };

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
        onEdit={startEdit}
        onMarkConverted={() => setConvertOpen(true)}
        onMarkLost={() => setLostOpen(true)}
      />

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto grid max-w-5xl gap-4">
          <LeadDataCard
            lead={lead}
            seller={sellerQuery.data ?? undefined}
            editing={editing}
            draft={draft ?? toLeadDraft(lead)}
            onDraftChange={changeDraft}
            errors={errors}
          />
          <div className="rounded-lg border border-border bg-card p-4">
            <LeadTabs lead={lead} />
          </div>
        </div>
      </div>

      {editing && (
        <div className="sticky bottom-0 z-10 border-t border-border bg-card/95 px-6 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={cancelEdit}
              disabled={saving}
            >
              {LEADS_STRINGS.detail.cancel}
            </Button>
            <Button
              size="sm"
              className="cursor-pointer"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Icon icon="svg-spinners:ring-resize" size={14} />
                  {LEADS_STRINGS.detail.saving}
                </>
              ) : (
                LEADS_STRINGS.detail.editAction
              )}
            </Button>
          </div>
        </div>
      )}

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
