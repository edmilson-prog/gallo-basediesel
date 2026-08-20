import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type {
  ID,
  IConversation,
  IConversationContact,
  ILead,
  ISeller,
  IWhatsAppAccount,
} from "@/shared/types";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useSellersProvider } from "@/providers/data";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useAuth } from "@/features/auth/useAuth";
import { FicheFunnelsBlock } from "@/features/funnels/components/FicheFunnelsBlock";
import { ConversationManagementCard } from "@/features/conversations/components/ConversationManagementCard";
import { useOptionalConversationContext } from "@/features/conversations/hooks/ConversationContext";
import type { ICollaboratorWithSeller } from "@/features/conversations/hooks/useConversationDetail";
import {
  PanelCard,
  PanelDivider,
  PanelRow,
} from "@/features/conversations/components/panel/PanelKit";
import { formatDateBR } from "@/shared/utils/format";
import { ConvertLeadModal } from "../ConvertLeadModal";
import { LeadTimeline } from "../detail/LeadTimeline";
import { useLeadPatch } from "../../hooks/useLeadPatch";
import { canConvertLead } from "../../utils/canConvertLead";
import { getOriginMeta, isConverted } from "../../utils/leadDisplay";
import { resolveLeadFicheIdentity } from "../../utils/leadFiche";
import {
  documentCustomerType,
  isPersonalLead,
  togglePersonalTag,
} from "../../engine/conversionReadiness";
import { LEADS_STRINGS } from "../../i18n/pt-BR";
import { LeadConversationsSection } from "./LeadConversationsSection";
import { LeadConversionCard } from "./LeadConversionCard";
import { LeadPanelHeader } from "./LeadPanelHeader";
import { LeadPanelRail } from "./LeadPanelRail";
import { LeadRecordSection } from "./LeadRecordSection";
import { LEAD_PANEL_SECTIONS, type LeadPanelSectionId } from "./panelSections";

const COPY = LEADS_STRINGS.panel;

export interface ILeadPanelBodyProps {
  lead: ILead | null;
  contact: IConversationContact | null;
  conversation: IConversation;
  assignedSeller?: ISeller | null;
  whatsappAccount?: IWhatsAppAccount | null;
  collaborators?: ICollaboratorWithSeller[];
  onConverted?: () => void;
  /** Refreshes the caller's conversation detail — also how a lead write lands. */
  onConversationChanged?: () => void;
  /** Hands the "Mídias" rail entry to the screen's own media panel. */
  onOpenMedia?: () => void;
  className?: string;
}

/**
 * The Atendimento lateral panel for a lead-anchored conversation, rebuilt from
 * `ui_kits/atendimento/painel/painel-lead-v2-conversao.html`.
 *
 * What changed, and why: the panel used to be a list of what the lead HAS
 * (badges, funnels, a collapsed data block). The kit reframes it around what
 * the panel is FOR — this person is not a customer yet, here is exactly what
 * that costs, and here is the button. Everything else moved behind the rail, so
 * the first screen is one question with one answer.
 */
export function LeadPanelBody({
  lead,
  contact,
  conversation,
  assignedSeller,
  whatsappAccount,
  collaborators,
  onConverted,
  onConversationChanged,
  onOpenMedia,
  className,
}: ILeadPanelBodyProps) {
  const navigate = useNavigate();
  const sellersProvider = useSellersProvider();
  const { currentUser } = useAuth();
  const mySellerId: ID | null = currentUser?.sellerId ?? null;

  const canViewLeadStore = usePermission("lead", "view", "store");
  const canViewLeadOwn = usePermission("lead", "view");
  const canEditLeadStore = usePermission("lead", "edit", "store");
  const canEditLeadOwn = usePermission("lead", "edit");

  const [section, setSection] = useState<LeadPanelSectionId>("overview");
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertMode, setConvertMode] = useState<"new" | "link">("new");

  // The always-mounted modal pattern needs an explicit reset: if a background
  // refetch fails soft and nulls `lead` mid-edit the modal unmounts, and a later
  // successful refetch would reopen it out of nowhere.
  useEffect(() => {
    if (!lead) setConvertOpen(false);
  }, [lead]);

  const isLeadOwner = !!lead?.sellerId && lead.sellerId === mySellerId;
  const isAssignee =
    !!conversation.assignedSellerId && conversation.assignedSellerId === mySellerId;
  const canOpenLeadPage = canViewLeadStore || (canViewLeadOwn && (isLeadOwner || isAssignee));
  const canConvert = canConvertLead({ canEditLeadStore, canEditLeadOwn, isLeadOwner, isAssignee });
  // Same composition as converting, deliberately: moving a lead between stages
  // is an edit on the lead, and a second access rule here would be a second
  // thing to keep in sync with the RLS.
  const canEditFunnels = canEditLeadStore || (canEditLeadOwn && (isLeadOwner || isAssignee));

  const ownerId: ID | null = lead?.sellerId ?? null;
  const ownerQuery = useQuery({
    queryKey: ["lead-fiche-owner", ownerId],
    queryFn: () => sellersProvider.get(ownerId as ID),
    enabled: !!ownerId,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const { patch, pendingField } = useLeadPatch(lead);

  /**
   * Every inline write goes through here so the CONVERSATION detail refetches
   * too: `useLeadPatch` invalidates the lead's own keys, but this panel reads
   * its lead from `useConversationDetail` (the conversation-gated RPC), which
   * those keys do not touch. Without this the ring would not move until the
   * next navigation.
   */
  const saveField = async (changes: Partial<ILead>): Promise<boolean> => {
    const keys = Object.keys(changes);
    // The row being edited is the FIRST key — the document editor relies on it
    // (see `buildDocumentSaveChanges`), because a Receita lookup writes the
    // rows it filled in the same call. The extra ones go in the confirmation
    // rather than being left to change on their own behind the popover.
    const field = keys[0] ?? "lead";
    const label = COPY.conversion.fields[field as keyof typeof COPY.conversion.fields] ?? field;
    const ok = await patch(changes, {
      field: `conversion-${field}`,
      action: `lead.${field}_changed`,
      success:
        keys.length > 1 && field === "document"
          ? COPY.conversion.receita.savedWithAutofill(keys.length - 1)
          : COPY.conversion.saved(label),
    });
    if (ok) onConversationChanged?.();
    return ok;
  };

  const togglePersonal = async () => {
    if (!lead) return;
    const already = isPersonalLead(lead);
    const ok = await patch(
      { tags: togglePersonalTag(lead.tags) },
      {
        field: "personal",
        action: already ? "lead.personal_unmarked" : "lead.personal_marked",
        success: already ? COPY.conversion.personalRemoved : COPY.conversion.personalApplied,
      },
    );
    if (ok) onConversationChanged?.();
  };

  const openQuoteForLead = () => {
    if (!lead) return;
    void navigate({ to: "/app/orcamentos/novo", search: { leadId: lead.id } });
  };

  const identity = resolveLeadFicheIdentity(lead, contact);
  if (!identity) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 border-l border-border bg-background px-6 text-center text-xs text-muted-foreground",
          className,
        )}
      >
        <Icon icon="mdi:account-question-outline" size={24} aria-hidden />
        {LEADS_STRINGS.fiche.degradedNotice}
      </div>
    );
  }

  const converted = lead ? isConverted(lead) : false;
  const activeSection = LEAD_PANEL_SECTIONS.find((s) => s.id === section);

  return (
    <div
      className={cn("flex flex-col overflow-hidden border-l border-border bg-background", className)}
    >
      <LeadPanelHeader
        identity={identity}
        lead={lead}
        menu={
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={COPY.moreActions}
              className="grid size-8 shrink-0 place-items-center rounded border border-border bg-foreground/[0.06] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon icon="mdi:dots-vertical" size={16} aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {lead && canOpenLeadPage && (
                <DropdownMenuItem
                  className="gap-2 text-xs"
                  onSelect={() =>
                    void navigate({ to: "/app/leads/$id", params: { id: lead.id } })
                  }
                >
                  <Icon icon="mdi:open-in-new" size={14} aria-hidden />
                  {LEADS_STRINGS.fiche.viewLead}
                </DropdownMenuItem>
              )}
              {lead && canConvert && !converted && (
                <DropdownMenuItem
                  className="gap-2 text-xs"
                  onSelect={() => {
                    setConvertMode("link");
                    setConvertOpen(true);
                  }}
                >
                  <Icon icon="mdi:link-variant" size={14} aria-hidden />
                  {COPY.conversion.linkExisting}
                </DropdownMenuItem>
              )}
              {lead && (
                <DropdownMenuItem className="gap-2 text-xs" onSelect={() => void togglePersonal()}>
                  <Icon icon="mdi:account-outline" size={14} aria-hidden />
                  {isPersonalLead(lead)
                    ? COPY.conversion.personalUndo
                    : COPY.conversion.personal}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <LeadPanelRail
        active={section}
        onSelect={(id) => {
          const target = LEAD_PANEL_SECTIONS.find((s) => s.id === id);
          // A delegating entry hands off to the screen's own panel and leaves
          // the rail where it was — coming back to a section you never chose
          // would be the confusing part.
          if (target?.delegates) {
            onOpenMedia?.();
            return;
          }
          setSection(id);
        }}
      />

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2 pt-2.5">
        {identity.degraded && (
          <p className="mx-3 mb-2.5 rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground">
            <Icon icon="mdi:alert-circle-outline" size={12} className="mr-1 inline" aria-hidden />
            {LEADS_STRINGS.fiche.degradedNotice}
          </p>
        )}

        {section === "overview" && (
          <>
            {lead && !converted && (
              <LeadConversionCard
                lead={lead}
                canConvert={canConvert}
                onConvert={(mode) => {
                  setConvertMode(mode);
                  setConvertOpen(true);
                }}
                onSaveField={saveField}
                pendingField={pendingField}
                canQuote={canOpenLeadPage}
                onOnlyQuote={openQuoteForLead}
                onTogglePersonal={() => void togglePersonal()}
              />
            )}

            {lead && (
              <PanelCard>
                <FicheFunnelsBlock
                  leadId={lead.id}
                  conversationId={conversation.id}
                  storeId={lead.storeId}
                  canEdit={canEditFunnels}
                />
              </PanelCard>
            )}

            <PanelCard icon="mdi:message-outline" title={COPY.registry.title}>
              <ConversationManagementCard
                variant="panel"
                conversation={conversation}
                assignedSeller={assignedSeller}
                whatsappAccount={whatsappAccount}
                collaborators={collaborators}
                onConversationChanged={onConversationChanged}
              />
              {lead && (
                <>
                  <PanelDivider className="my-1.5" />
                  <PanelRow label={COPY.registry.owner}>
                    {ownerQuery.data?.fullName ?? LEADS_STRINGS.fiche.ownerQueue}
                  </PanelRow>
                  <PanelRow label={COPY.registry.createdAt} muted>
                    {formatDateBR(lead.createdAt)} · {getOriginMeta(lead.origin).label}
                  </PanelRow>
                </>
              )}
            </PanelCard>
          </>
        )}

        {section === "record" && lead && (
          <LeadRecordSection
            lead={lead}
            ownerName={ownerQuery.data?.fullName ?? null}
            canEdit={canConvert}
            onSaveField={saveField}
            pendingField={pendingField}
          />
        )}

        {section === "conversations" && lead && (
          <LeadConversationsSection lead={lead} currentConversationId={conversation.id} />
        )}

        {(section === "history" || section === "notes") && lead && (
          <PanelCard>
            <LeadThread
              lead={lead}
              conversation={conversation}
              canEdit={canConvert}
              defaultFilter={section === "notes" ? "nota" : "tudo"}
            />
          </PanelCard>
        )}

        {/* A section that needs the lead and does not have it (pool/degraded). */}
        {!lead && section !== "overview" && activeSection?.available && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            {LEADS_STRINGS.fiche.degradedNotice}
          </p>
        )}

        {activeSection && !activeSection.available && (
          <PanelCard icon={activeSection.icon} title={activeSection.label} tone="muted">
            <p className="text-[11.5px] leading-snug text-muted-foreground">
              {COPY.locked.body(activeSection.label)}
            </p>
            <button
              type="button"
              onClick={() => setSection("overview")}
              className="mt-2 inline-flex items-center gap-1 rounded text-[11px] font-bold text-primary transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon icon="mdi:arrow-left" size={12} aria-hidden />
              {COPY.locked.cta}
            </button>
          </PanelCard>
        )}
      </div>

      {lead && (
        <ConvertLeadModal
          lead={convertOpen ? lead : null}
          initialMode={convertMode}
          initialDocument={lead.document}
          initialType={documentCustomerType(lead.document) ?? undefined}
          onClose={() => setConvertOpen(false)}
          onConverted={() => {
            setConvertOpen(false);
            onConverted?.();
          }}
        />
      )}
    </div>
  );
}

/**
 * The lead's thread inside the panel. Split out so the messages context is only
 * consumed while the section is mounted — the panel must not re-render on every
 * inbound message just to keep a tab it is not showing up to date.
 */
function LeadThread({
  lead,
  conversation,
  canEdit,
  defaultFilter,
}: {
  lead: ILead;
  conversation: IConversation;
  canEdit: boolean;
  defaultFilter: "tudo" | "nota";
}) {
  const ctx = useOptionalConversationContext();
  return (
    <LeadTimeline
      lead={lead}
      conversationId={conversation.id}
      conversationAt={conversation.createdAt}
      messages={ctx?.messages.messages ?? []}
      canEdit={canEdit}
      variant="panel"
      defaultFilter={defaultFilter}
    />
  );
}
