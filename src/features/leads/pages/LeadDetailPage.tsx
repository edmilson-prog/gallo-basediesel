import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { ID, IMessage, ISeller, LeadNextActionKind, LeadTemperature } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useConversationsProvider } from "@/providers/data/hooks/useConversationsProvider";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import {
  leadEntriesQueryKey,
  useLeadDetailFunnels,
} from "@/features/funnels/hooks/useLeadDetailFunnels";
import { useEntryMutations } from "@/features/funnels/hooks/useEntryMutations";
import { LeadHeader } from "../components/detail/LeadHeader";
import { LeadNowBlock } from "../components/detail/LeadNowBlock";
import { LeadFunnelsCard } from "../components/detail/LeadFunnelsCard";
import { LeadDataCard } from "../components/detail/LeadDataCard";
import { LeadConversationCard } from "../components/detail/LeadConversationCard";
import { LeadTimeline } from "../components/detail/LeadTimeline";
import { ConvertLeadModal } from "../components/ConvertLeadModal";
import { MarkAsLostModal } from "../components/MarkAsLostModal";
import { useLeadDetail } from "../hooks/useLeadDetail";
import { useLeadPatch } from "../hooks/useLeadPatch";
import { isConverted, isLost } from "../utils/leadDisplay";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.detail;
const NO_MESSAGES: IMessage[] = [];

export function LeadDetailPage() {
  const { id } = useParams({ from: "/app/leads/$id" });
  const navigate = useNavigate();
  const canEditPermission = usePermission("lead", "edit");

  const detail = useLeadDetail(id);
  const lead = detail.data ?? null;

  const sellersProvider = useSellersProvider();
  const customersProvider = useCustomersProvider();
  const conversationsProvider = useConversationsProvider();

  const [sellersQuery, convertedCustomerQuery, conversationQuery] = useQueries({
    queries: [
      {
        // The responsável is editable in the header, so the whole roster is
        // needed here — not just the one seller the lead points at.
        queryKey: ["sellers-list", lead?.storeId, "all"] as const,
        enabled: Boolean(lead),
        staleTime: 60_000,
        queryFn: () => sellersProvider.list({ storeId: lead?.storeId }),
      },
      {
        queryKey: ["lead-converted-customer", lead?.convertedToCustomerId] as const,
        enabled: Boolean(lead?.convertedToCustomerId),
        staleTime: 60_000,
        queryFn: () => customersProvider.get(lead!.convertedToCustomerId as ID).catch(() => null),
      },
      {
        queryKey: ["lead-conversations", lead?.id] as const,
        enabled: Boolean(lead),
        staleTime: 30_000,
        queryFn: () => conversationsProvider.list({ leadId: lead!.id, pageSize: 5 }),
      },
    ],
  });

  const sellers: ISeller[] = useMemo(() => sellersQuery.data ?? [], [sellersQuery.data]);
  const seller = useMemo(
    () => (lead?.sellerId ? sellers.find((s) => s.id === lead.sellerId) : undefined),
    [sellers, lead?.sellerId],
  );

  // The most recent conversation is the one worth showing: a lead with three
  // threads is a lead somebody reopened, and the live one is the last.
  const conversation = useMemo(() => {
    const all = conversationQuery.data?.data ?? [];
    return (
      [...all].sort(
        (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
      )[0] ?? null
    );
  }, [conversationQuery.data]);

  // Lifted so the timeline can summarise the same messages the card loaded,
  // instead of fetching them a second time under a different key.
  const [messages, setMessages] = useState<IMessage[]>(NO_MESSAGES);

  const { patch, pendingField } = useLeadPatch(lead);
  const funnels = useLeadDetailFunnels(id, lead?.storeId);
  const entryMutations = useEntryMutations({
    entriesQueryKey: leadEntriesQueryKey(id),
    storeId: lead?.storeId,
  });

  const [convertOpen, setConvertOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);

  const converted = lead ? isConverted(lead) : false;
  const lost = lead ? isLost(lead) : false;
  const canEdit = canEditPermission && !converted && !lost;

  if (detail.isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem-var(--shell-banner-offset,0px))] items-center justify-center text-sm text-muted-foreground">
        Carregando lead…
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex h-[calc(100vh-4rem-var(--shell-banner-offset,0px))] flex-col items-center justify-center gap-3 text-center">
        <Icon icon="mdi:alert-circle-outline" size={28} className="text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">{COPY.notFound}</p>
        <p className="text-xs text-muted-foreground">{COPY.description}</p>
        <Button size="sm" onClick={() => void navigate({ to: "/app/leads" })}>
          {LEADS_STRINGS.page.backToList}
        </Button>
      </div>
    );
  }

  /** The customer's last inbound message — why the lead is waiting. */
  const lastInbound = [...messages].reverse().find((m) => m.direction === "in");

  return (
    <div className="flex h-[calc(100vh-4rem-var(--shell-banner-offset,0px))] min-h-0 flex-col bg-background">
      <LeadHeader
        lead={lead}
        seller={seller}
        sellers={sellers}
        convertedCustomer={convertedCustomerQuery.data ?? null}
        canEdit={canEdit}
        pendingField={pendingField}
        onTemperatureChange={(temperature: LeadTemperature) =>
          void patch(
            { temperature },
            {
              field: "temperature",
              action: "lead.updated",
              success: COPY.state.temperatureSaved(LEADS_STRINGS.temperature[temperature]),
            },
          )
        }
        onSellerChange={(sellerId) =>
          void patch(
            { sellerId },
            {
              field: "sellerId",
              action: "lead.seller_changed",
              success: COPY.state.sellerSaved(
                sellerId
                  ? (sellers.find((s) => s.id === sellerId)?.fullName ?? "")
                  : COPY.state.sellerQueue,
              ),
            },
          )
        }
        onMarkConverted={() => setConvertOpen(true)}
        onMarkLost={() => setLostOpen(true)}
      />

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(22rem,1fr)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-4">
            {!converted && !lost && (
              <LeadNowBlock
                lead={lead}
                canEdit={canEdit}
                pendingField={pendingField}
                waitingSince={lastInbound?.sentAt}
                onSet={(kind: LeadNextActionKind, dueAt) =>
                  void patch(
                    { nextActionAt: dueAt, nextActionKind: kind },
                    {
                      field: "nextActionAt",
                      action: "lead.updated",
                      success: COPY.now.saved(
                        COPY.now.kinds[kind],
                        LEADS_STRINGS.card.nextAction.today,
                      ),
                    },
                  )
                }
                onClear={(completed) =>
                  void patch(
                    { nextActionAt: undefined, nextActionKind: undefined },
                    {
                      field: "nextActionAt",
                      action: "lead.updated",
                      success: completed ? COPY.now.completed : COPY.now.removed,
                    },
                  )
                }
              />
            )}

            <LeadFunnelsCard
              participations={funnels.view.visible}
              stagesByFunnel={funnels.stagesByFunnel}
              addableFunnels={funnels.addableFunnels}
              lockedCount={funnels.view.lockedCount}
              totalValue={funnels.totalValue}
              canEdit={canEdit}
              pendingEntryId={entryMutations.pendingEntryId}
              onMove={(participation, stageId) => {
                const stage = funnels.stagesByFunnel
                  .get(participation.funnel.id)
                  ?.find((s) => s.id === stageId);
                if (!stage) return;
                entryMutations.moveStage(
                  participation.entry,
                  stageId,
                  participation.funnel.name,
                  stage.name,
                );
              }}
              onSetValue={(participation, value) =>
                entryMutations.setValue(participation.entry, value, participation.funnel.name)
              }
              onAdd={(funnelId, funnelName) => entryMutations.addToFunnel(id, funnelId, funnelName)}
              onRemove={(participation) =>
                entryMutations.removeFrom(participation.entry, participation.funnel.name)
              }
            />

            <LeadDataCard
              lead={lead}
              seller={seller}
              canEdit={canEdit}
              pendingField={pendingField}
              onEmailChange={(email) =>
                void patch(
                  { email },
                  {
                    field: "email",
                    action: "lead.updated",
                    success: email
                      ? COPY.inline.saved(COPY.fields.email)
                      : COPY.inline.cleared(COPY.fields.email),
                  },
                )
              }
              onTagsChange={(tags) =>
                void patch(
                  { tags },
                  {
                    field: "tags",
                    action: "lead.updated",
                    success: COPY.inline.saved(COPY.fields.tags),
                  },
                )
              }
            />
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <LeadConversationCard
              conversation={conversation}
              isLoading={conversationQuery.isLoading}
              onMessages={setMessages}
            />
            <LeadTimeline
              lead={lead}
              conversationId={conversation?.id}
              conversationAt={conversation?.lastMessageAt}
              messages={messages}
              canEdit={canEditPermission}
            />
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
