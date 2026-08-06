import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type {
  IConversation,
  IConversationContact,
  ID,
  ILead,
  ISeller,
  IWhatsAppAccount,
} from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateBR, formatPhone } from "@/shared/utils/format";
import { FicheFunnelsBlock } from "@/features/funnels/components/FicheFunnelsBlock";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSellersProvider } from "@/providers/data";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useAuth } from "@/features/auth/useAuth";
// Reuses the customer fiche's breakpoint hook as the single source of truth
// (column ≥1280 / drawer 768–1279 / route <768 — identical thresholds).
import { useFicheLayout } from "@/features/customers/hooks/useFicheLayout";
import { ConversationManagementCard } from "@/features/conversations/components/ConversationManagementCard";
import type { ICollaboratorWithSeller } from "@/features/conversations/hooks/useConversationDetail";
import { ConvertLeadModal } from "./ConvertLeadModal";
import {
  TEMPERATURE_META,
  getInitials,
  getNextActionInfo,
  getOriginMeta,
  isConverted,
  isLost,
} from "../utils/leadDisplay";
import { resolveLeadFicheIdentity } from "../utils/leadFiche";
import { canConvertLead } from "../utils/canConvertLead";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.fiche;

export interface ILeadProfileFicheProps {
  /** Lead resolved via the conversation-gated RPC — null falls back to `contact`. */
  lead: ILead | null;
  /** Pool-safe contact from `conversation_contacts` — feeds the degraded card. */
  contact: IConversationContact | null;
  /** The anchoring conversation — feeds the direct-read predicate of "Ver lead". */
  conversation: IConversation;
  /** Resolved from conversation.assignedSellerId by the caller — feeds the management card. */
  assignedSeller?: ISeller | null;
  /** Resolved from conversation.whatsappAccountId by the caller — feeds the management card. */
  whatsappAccount?: IWhatsAppAccount | null;
  /** Resolved from useConversationDetail by the caller — feeds the management card. */
  collaborators?: ICollaboratorWithSeller[];
  /** Drawer open state from `useConversationFiche()`. */
  open: boolean;
  /** Drawer close handler. */
  onOpenChange: (open: boolean) => void;
  /** Called after a successful lead→customer conversion (caller refreshes the detail). */
  onConverted?: () => void;
  /** Bubbles a status/tag/collaborator change up so the caller can refresh its conversation cache. */
  onConversationChanged?: () => void;
}

/**
 * Read-only lateral fiche for LEAD-anchored conversations — the counterpart of
 * `CustomerProfileFiche` for the post-Funnel-Frente-3 world where most
 * conversations anchor on a lead (customer_id null) and the "Ficha" button
 * used to be a dead click. Same three responsive behaviors (column ≥1280px /
 * drawer 768–1279 / route <768 handled by `useFicheButtonHandler`).
 * Spec: docs/superpowers/specs/2026-07-18-lead-fiche-lateral.md.
 */
export function LeadProfileFiche({
  lead,
  contact,
  conversation,
  assignedSeller,
  whatsappAccount,
  collaborators,
  open,
  onOpenChange,
  onConverted,
  onConversationChanged,
}: ILeadProfileFicheProps) {
  const mode = useFicheLayout();

  // Route mode (<768px) deliberately falls back to the same overlay Sheet as
  // drawer mode — a spec §4 deviation, recorded in the PR: navigating to
  // /app/leads/:id would land the pool attendant on "Lead não encontrado"
  // (the PAGE reads under the per-owner leads RLS; only the fiche is
  // conversation-gated), so the mobile "Ficha" tap opens the sheet instead.
  if (mode === "drawer" || mode === "route") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full max-w-sm overflow-hidden p-0 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>{COPY.title}</SheetTitle>
          </SheetHeader>
          <LeadProfileBody
            lead={lead}
            contact={contact}
            conversation={conversation}
            assignedSeller={assignedSeller}
            whatsappAccount={whatsappAccount}
            collaborators={collaborators}
            onConverted={onConverted}
            onConversationChanged={onConversationChanged}
            className="h-full border-l-0"
          />
        </SheetContent>
      </Sheet>
    );
  }

  // column mode
  return (
    <aside
      className={cn(
        "hidden h-full shrink-0 transition-[width] duration-200 ease-in-out xl:block",
        open ? "w-[360px]" : "w-0 overflow-hidden",
      )}
      aria-hidden={!open}
    >
      {open && (
        <LeadProfileBody
          lead={lead}
          contact={contact}
          conversation={conversation}
          assignedSeller={assignedSeller}
          whatsappAccount={whatsappAccount}
          collaborators={collaborators}
          onConverted={onConverted}
          onConversationChanged={onConversationChanged}
          className="h-full"
        />
      )}
    </aside>
  );
}

function LeadProfileBody({
  lead,
  contact,
  conversation,
  assignedSeller,
  whatsappAccount,
  collaborators,
  onConverted,
  onConversationChanged,
  className,
}: {
  lead: ILead | null;
  contact: IConversationContact | null;
  conversation: IConversation;
  assignedSeller?: ISeller | null;
  whatsappAccount?: IWhatsAppAccount | null;
  collaborators?: ICollaboratorWithSeller[];
  onConverted?: () => void;
  onConversationChanged?: () => void;
  className?: string;
}) {
  const navigate = useNavigate();
  const sellersProvider = useSellersProvider();
  const { currentUser } = useAuth();
  const mySellerId: ID | null = currentUser?.sellerId ?? null;
  const canViewLeadStore = usePermission("lead", "view", "store");
  const canViewLeadOwn = usePermission("lead", "view");
  const canEditLeadStore = usePermission("lead", "edit", "store");
  const canEditLeadOwn = usePermission("lead", "edit");
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertInitialMode, setConvertInitialMode] = useState<"new" | "link">("new");

  // The always-mounted ConvertLeadModal pattern needs an explicit reset: if a
  // background detail refetch fails soft and nulls `lead` mid-edit, the modal
  // unmounts — without this, a later successful refetch would reopen it out of
  // nowhere (convertOpen would still be true).
  useEffect(() => {
    if (!lead) setConvertOpen(false);
  }, [lead]);

  // RLS-honest action gating (review round 2). "Ver lead" navigates to
  // /app/leads/:id, which reads under the per-owner leads RLS: staff (store
  // scope), the lead's owner, or the conversation's assignee
  // (seller_handles_lead grants direct reads for ASSIGNED conversations only —
  // the pool variant was reverted for per-row perf in 20260619170000).
  const isLeadOwner = !!lead?.sellerId && lead.sellerId === mySellerId;
  const isAssignee =
    !!conversation.assignedSellerId && conversation.assignedSellerId === mySellerId;
  const canOpenLeadPage = canViewLeadStore || (canViewLeadOwn && (isLeadOwner || isAssignee));
  // Conversion is now backed by the gated `convert_lead_mark` RPC, so the
  // assigned attendant of the conversation can convert too — not just staff or
  // the lead's owner. The customer belongs to whoever converts, so its INSERT
  // already passes the customers RLS; only the lead UPDATE needs the RPC.
  const canConvert = canConvertLead({ canEditLeadStore, canEditLeadOwn, isLeadOwner, isAssignee });
  // Same composition as converting, and deliberately so: moving a lead between
  // stages of a funnel is an edit on the lead, and inventing a second access
  // rule here would be a second thing to keep in sync with the RLS.
  const canEditFunnels = canEditLeadStore || (canEditLeadOwn && (isLeadOwner || isAssignee));
  const [dataOpen, setDataOpen] = useState(false);

  const ownerId: ID | null = lead?.sellerId ?? null;
  const ownerQuery = useQuery({
    queryKey: ["lead-fiche-owner", ownerId],
    queryFn: () => sellersProvider.get(ownerId as ID),
    enabled: !!ownerId,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const identity = resolveLeadFicheIdentity(lead, contact);
  if (!identity) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 border-l border-border bg-card px-6 text-center text-xs text-muted-foreground",
          className,
        )}
      >
        <Icon icon="mdi:account-question-outline" size={24} aria-hidden />
        {COPY.degradedNotice}
      </div>
    );
  }

  const tempMeta = lead ? TEMPERATURE_META[lead.temperature] : null;
  const originMeta = lead ? getOriginMeta(lead.origin) : null;
  const converted = lead ? isConverted(lead) : false;
  const lost = lead ? isLost(lead) : false;
  const nextAction = lead?.nextActionAt ? getNextActionInfo(lead.nextActionAt) : null;

  return (
    <div className={cn("flex flex-col overflow-hidden border-l border-border bg-card", className)}>
      {/* Identity header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        <Avatar className="h-12 w-12">
          {identity.avatarUrl && <AvatarImage src={identity.avatarUrl} alt="" />}
          <AvatarFallback className="text-sm font-semibold">
            {getInitials(identity.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{identity.name}</h2>
          <p className="text-xs text-muted-foreground">{formatPhone(identity.phone)}</p>
          {identity.email && (
            <p className="truncate text-xs text-muted-foreground">{identity.email}</p>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {identity.degraded && (
          <p className="mb-3 rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground">
            <Icon icon="mdi:alert-circle-outline" size={12} className="mr-1 inline" aria-hidden />
            {COPY.degradedNotice}
          </p>
        )}

        {lead && (
          <>
            {/* State badges. The stage chip that used to open this row is gone:
                it named a stage of the store's single legacy pipeline, which
                with N funnels answers for one of them. The block below says
                the stage in each funnel the lead is actually in. */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {tempMeta && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    tempMeta.tone,
                  )}
                >
                  <Icon icon={tempMeta.icon} size={11} aria-hidden />
                  {tempMeta.label}
                </span>
              )}
              {originMeta && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    originMeta.tone,
                  )}
                >
                  <Icon icon={originMeta.icon} size={11} aria-hidden />
                  {originMeta.label}
                </span>
              )}
              {converted && (
                <span className="inline-flex items-center gap-1 rounded bg-severity-success/15 px-1.5 py-0.5 text-[10px] font-medium text-severity-success">
                  <Icon icon="mdi:check-decagram" size={11} aria-hidden />
                  {COPY.stateConverted}
                </span>
              )}
              {lost && (
                <span className="inline-flex items-center gap-1 rounded bg-severity-critical/15 px-1.5 py-0.5 text-[10px] font-medium text-severity-critical">
                  <Icon icon="mdi:close-octagon-outline" size={11} aria-hidden />
                  {COPY.stateLost}
                </span>
              )}
            </div>

            {/* The funnels this lead is in, and the stage in each. It sits
                above the data because it is the first actionable thing for
                somebody answering a message (spec 8). */}
            <FicheFunnelsBlock
              leadId={lead.id}
              conversationId={conversation.id}
              storeId={lead.storeId}
              canEdit={canEditFunnels}
            />

            {/* Data rows. Collapsed by default: whoever is attending needs
                funnel, stage and status; "criado em" is an occasional lookup,
                and the block above costs ~35px per participation that has to
                come from somewhere. */}
            <Collapsible open={dataOpen} onOpenChange={setDataOpen}>
              <CollapsibleTrigger className="mb-1.5 inline-flex items-center gap-1 rounded text-[10px] font-semibold uppercase tracking-wide text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Icon
                  icon="mdi:chevron-right"
                  size={12}
                  aria-hidden
                  className={cn("transition-transform", dataOpen && "rotate-90")}
                />
                {COPY.sectionData}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <dl className="space-y-2 text-xs">
                  <FicheRow label={COPY.owner}>
                    {ownerId ? (
                      (ownerQuery.data?.fullName ?? "—")
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        <Icon icon="mdi:account-clock-outline" size={11} aria-hidden />
                        {COPY.ownerQueue}
                      </span>
                    )}
                  </FicheRow>
                  <FicheRow label={COPY.createdAt}>{formatDateBR(lead.createdAt)}</FicheRow>
                  {lead.estimatedValue !== undefined && (
                    <FicheRow label={COPY.estimatedValue}>
                      {formatBRL(lead.estimatedValue)}
                    </FicheRow>
                  )}
                  {nextAction && (
                    <FicheRow label={COPY.nextAction}>
                      <span
                        className={cn(
                          "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                          nextAction.tone,
                        )}
                      >
                        {nextAction.label}
                      </span>
                    </FicheRow>
                  )}
                  {lead.tags.length > 0 && (
                    <FicheRow label={COPY.tags}>
                      <span className="flex flex-wrap gap-1">
                        {lead.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </span>
                    </FicheRow>
                  )}
                </dl>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}

        {/* Conversation-management panel — same controls as the customer fiche's
            "Atendimento" tab, so a lead-anchored conversation is managed the
            same way. Conversation-scoped, so it renders even when `lead` is
            null (pool/degraded). */}
        <div className={cn(lead && "mt-4 border-t border-border pt-4")}>
          <ConversationManagementCard
            conversation={conversation}
            assignedSeller={assignedSeller}
            whatsappAccount={whatsappAccount}
            collaborators={collaborators}
            onConversationChanged={onConversationChanged}
          />
        </div>
      </div>

      {/* Actions */}
      {lead && (canOpenLeadPage || (canConvert && !converted)) && (
        <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
          {canOpenLeadPage && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => void navigate({ to: "/app/leads/$id", params: { id: lead.id } })}
            >
              <Icon icon="mdi:open-in-new" size={14} aria-hidden />
              {COPY.viewLead}
            </Button>
          )}
          {canConvert && !converted && (
            <div className="flex w-full">
              <Button
                size="sm"
                className="flex-1 justify-start gap-1.5 rounded-r-none"
                onClick={() => {
                  setConvertInitialMode("new");
                  setConvertOpen(true);
                }}
              >
                <Icon icon="mdi:account-convert" size={14} aria-hidden />
                {COPY.convert}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    className="w-8 rounded-l-none border-l border-primary-foreground/20 px-0"
                    aria-label={LEADS_STRINGS.convertModal.modeLabel}
                  >
                    <Icon icon="mdi:chevron-down" size={14} aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setConvertInitialMode("new");
                      setConvertOpen(true);
                    }}
                  >
                    <Icon icon="mdi:account-convert" size={14} aria-hidden className="mr-2" />
                    {LEADS_STRINGS.convertModal.modeNew}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setConvertInitialMode("link");
                      setConvertOpen(true);
                    }}
                  >
                    <Icon icon="mdi:link-variant" size={14} aria-hidden className="mr-2" />
                    {LEADS_STRINGS.convertModal.modeLink}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      )}

      {lead && (
        <ConvertLeadModal
          lead={convertOpen ? lead : null}
          initialMode={convertInitialMode}
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

function FicheRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-foreground">{children}</dd>
    </div>
  );
}
