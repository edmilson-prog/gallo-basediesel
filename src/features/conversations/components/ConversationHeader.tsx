import { useNavigate } from "@tanstack/react-router";
import type {
  IConversation,
  IConversationContact,
  ICustomer,
  ILead,
  ISdrEscalation,
  ISeller,
} from "@/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { AvatarLightbox } from "@/components/AvatarLightbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCustomersProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import {
  CHANNEL_META,
  displayFromContact,
  getConversationDisplay,
} from "../utils/conversationDisplay";
import { ContactAvatar } from "./ContactAvatar";
import { AssigneeChip } from "./AssigneeChip";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
import { StatusControl } from "./status/StatusControl";
import type { StatusControlMode } from "../engine/statusControlMode";
import { EscalationBadge } from "@/features/sdr-escalation/components/EscalationBadge";
import { TemperatureChip } from "@/features/quick-send/components/TemperatureChip";
import { useConversationScheduled } from "@/features/quick-send/hooks/useConversationScheduled";
import { QUICK_SEND_STRINGS } from "@/features/quick-send/i18n/pt-BR";
import { PART_LOOKUP_STRINGS } from "@/features/part-lookup";
import { ConversationHeaderTags } from "./tags/ConversationHeaderTags";

export interface IConversationHeaderProps {
  conversation: IConversation;
  customer: ICustomer | null;
  lead: ILead | null;
  /**
   * Pool-safe display contact (name/phone/avatar). Preferred for the title so a
   * seller handling an unassigned conversation sees the real name even when
   * `customer`/`lead` are RLS-hidden. Rich actions still use `customer`/`lead`.
   */
  contact?: IConversationContact | null;
  /** Seller the conversation is assigned to (for the responsible chip). */
  assignedSeller?: ISeller | null;
  /** Whether to surface the assignee chip (staff/manager oversight). */
  showAssignee?: boolean;
  ficheOpen: boolean;
  /** No contact anchor at all (neither customer nor lead) — spec §5: disabled with tooltip. */
  ficheDisabled?: boolean;
  onToggleFiche: () => void;
  /** Whether the media gallery sheet is open. */
  mediaOpen?: boolean;
  /** Toggles the media gallery sheet. */
  onToggleMedia?: () => void;
  /** Whether the part-lookup consultor panel is open. */
  consultorOpen?: boolean;
  /** Toggles the part-lookup consultor panel. */
  onToggleConsultor?: () => void;
  /** Whether the attendance history panel is open. */
  historyOpen?: boolean;
  /** Attendance history is per-CUSTOMER: disabled (with tooltip) on lead-anchored conversations. */
  historyDisabled?: boolean;
  /** Toggles the attendance history panel. */
  onToggleHistory?: () => void;
  /** Action menu rendered as a popover trigger (kebab). */
  menuSlot?: React.ReactNode;
  /** SDR escalation record bound to this conversation (PRD-023), when any. */
  escalation?: ISdrEscalation | null;
  /** Called after a customer mutation done from the header (PRD-118). */
  onCustomerUpdated?: () => void;
  /** Called after the conversation status changes from the header control. */
  onConversationUpdated?: () => void;
  /** Status-control display mode (lifted to the page; shared with the kebab). */
  statusControlMode: StatusControlMode;
}

export function ConversationHeader({
  conversation,
  customer,
  lead,
  contact,
  assignedSeller,
  showAssignee,
  ficheOpen,
  ficheDisabled,
  onToggleFiche,
  mediaOpen,
  onToggleMedia,
  consultorOpen,
  onToggleConsultor,
  historyOpen,
  historyDisabled,
  onToggleHistory,
  menuSlot,
  escalation,
  onCustomerUpdated,
  onConversationUpdated,
  statusControlMode,
}: IConversationHeaderProps) {
  // Prefer the pool-safe contact for the title; fall back to the rich
  // customer/lead objects (e.g. mock, or before the contact resolves).
  const display = contact
    ? displayFromContact(conversation, contact)
    : getConversationDisplay(conversation, customer, lead);
  const channel = CHANNEL_META[conversation.channel];
  const navigate = useNavigate();
  const customersProvider = useCustomersProvider();
  const { hasRole } = useAuth();

  // PRD-118 RF-052: back to 'valid' is a MANUAL staff action — never automatic.
  const handleMarkWhatsappValid = async () => {
    if (!customer) return;
    try {
      await customersProvider.update(customer.id, { whatsappStatus: "valid" });
      toast.success(CONVERSATION_STRINGS.markedWhatsappValid);
      onCustomerUpdated?.();
    } catch {
      toast.error(CONVERSATION_STRINGS.actionFailed);
    }
  };
  const scheduled = useConversationScheduled(conversation.id);
  const pendingScheduled = scheduled.items.filter((i) => i.status === "pending").length;

  // Subtitle shows ONLY the contact's own phone — never our own GALLO line,
  // which would mislabel our number as the contact's (e.g. when RLS hides the
  // customer for a seller handling a transferred conversation).
  const channelSubtitle = display.phone ? `${channel.label} • ${display.phone}` : channel.label;

  return (
    <header data-tour="conversation-header" className="shrink-0 border-b border-border bg-card">
      <div className="flex h-16 items-center gap-3 px-4">
        <AvatarLightbox src={display.avatarUrl} name={display.name}>
          <ContactAvatar display={display} />
        </AvatarLightbox>

        {/* `overflow-hidden` keeps this block from contributing its chips'
            intrinsic width to the header's min-content: `min-w-0` alone lets it
            shrink, but the header would still *ask* for ~160px extra and push
            the fiche off-screen. */}
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold uppercase text-foreground">{display.name}</h2>
            {conversation.isSdrActive && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  >
                    {CONVERSATION_STRINGS.sdrActiveTag}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{CONVERSATION_STRINGS.sdrActiveTooltip}</TooltipContent>
              </Tooltip>
            )}
            {/* Use the resolved display temperature so a pool seller (whose rich
                `lead` is RLS-hidden) still sees the chip, matching the list row. */}
            {display.temperature && <TemperatureChip temperature={display.temperature} />}
            <ConversationHeaderTags
              conversation={conversation}
              area="title"
              onChanged={onConversationUpdated}
            />
            {customer?.whatsappStatus === "invalid" && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="border-destructive/40 bg-destructive/10 text-destructive"
                    >
                      <Icon icon="mdi:cellphone-off" size={11} className="mr-1" />
                      {CONVERSATION_STRINGS.invalidNumberBadge}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>{CONVERSATION_STRINGS.invalidNumberBadgeTooltip}</TooltipContent>
                </Tooltip>
                {hasRole(["Owner", "Gestor"]) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-muted-foreground"
                    onClick={() => void handleMarkWhatsappValid()}
                  >
                    {CONVERSATION_STRINGS.markWhatsappValid}
                  </Button>
                )}
              </>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                channel.tone,
              )}
            >
              <Icon icon={channel.icon} size={12} />
              <span className="truncate">{channelSubtitle}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {showAssignee && assignedSeller && (
            <AssigneeChip
              seller={assignedSeller}
              variant="full"
              className="mr-1 hidden @min-[46rem]:inline-flex"
            />
          )}
          <StatusControl
            conversation={conversation}
            mode={statusControlMode}
            onChanged={onConversationUpdated}
          />
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          {!ficheDisabled ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={ficheOpen ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-1.5"
                  onClick={onToggleFiche}
                  aria-pressed={ficheOpen}
                >
                  <Icon icon="mdi:account-details" size={14} />
                  <span className="hidden @min-[52rem]:inline">
                    {CONVERSATION_STRINGS.toggleFiche}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{CONVERSATION_STRINGS.toggleFiche}</TooltipContent>
            </Tooltip>
          ) : (
            // aria-disabled (not `disabled`) keeps the button focusable so the
            // tooltip is reachable by keyboard/screen readers; no onClick = no-op.
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="cursor-not-allowed gap-1.5 opacity-50"
                  aria-disabled="true"
                  aria-label={CONVERSATION_STRINGS.ficheUnavailableTooltip}
                >
                  <Icon icon="mdi:account-details" size={14} />
                  <span className="hidden @min-[52rem]:inline">
                    {CONVERSATION_STRINGS.toggleFiche}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{CONVERSATION_STRINGS.ficheUnavailableTooltip}</TooltipContent>
            </Tooltip>
          )}
          {onToggleMedia && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={mediaOpen ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-1.5"
                  onClick={onToggleMedia}
                  aria-pressed={mediaOpen}
                >
                  <Icon icon="mdi:image-multiple-outline" size={14} />
                  <span className="hidden @min-[52rem]:inline">
                    {CONVERSATION_STRINGS.toggleMedia}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{CONVERSATION_STRINGS.toggleMedia}</TooltipContent>
            </Tooltip>
          )}
          {onToggleConsultor && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={consultorOpen ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-1.5"
                  onClick={onToggleConsultor}
                  aria-pressed={consultorOpen}
                >
                  <Icon icon="mdi:magnify-scan" size={14} />
                  <span className="hidden @min-[52rem]:inline">{PART_LOOKUP_STRINGS.toggle}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{PART_LOOKUP_STRINGS.panelTitle}</TooltipContent>
            </Tooltip>
          )}
          {onToggleHistory && !historyDisabled && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={historyOpen ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-1.5"
                  onClick={onToggleHistory}
                  aria-pressed={historyOpen}
                >
                  <Icon icon="mdi:history" size={14} />
                  <span className="hidden @min-[52rem]:inline">
                    {CONVERSATION_STRINGS.toggleHistory}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{CONVERSATION_STRINGS.toggleHistory}</TooltipContent>
            </Tooltip>
          )}
          {onToggleHistory && historyDisabled && (
            // aria-disabled (not `disabled`) keeps the button focusable so the
            // tooltip is reachable by keyboard/screen readers; no onClick = no-op.
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="cursor-not-allowed gap-1.5 opacity-50"
                  aria-disabled="true"
                  aria-label={CONVERSATION_STRINGS.historyUnavailableTooltip}
                >
                  <Icon icon="mdi:history" size={14} />
                  <span className="hidden @min-[52rem]:inline">
                    {CONVERSATION_STRINGS.toggleHistory}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{CONVERSATION_STRINGS.historyUnavailableTooltip}</TooltipContent>
            </Tooltip>
          )}
          {pendingScheduled > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              title={QUICK_SEND_STRINGS.schedule.listTitle}
            >
              <Icon icon="mdi:calendar-clock" size={12} aria-hidden />
              {QUICK_SEND_STRINGS.schedule.scheduledCount(pendingScheduled)}
            </span>
          )}
          {menuSlot}
        </div>
      </div>
      {escalation && (
        <div className="border-t border-border/60 bg-muted/40 px-4 py-1.5">
          <EscalationBadge mode={escalation.mode} banner />
        </div>
      )}
      {conversation.linkedOrderId && (
        <div className="flex items-center gap-2 border-t border-primary/20 bg-primary/5 px-4 py-1.5 text-xs text-muted-foreground">
          <Icon icon="mdi:cart" size={14} className="text-primary" aria-hidden />
          <span>Conversa criada via E-commerce</span>
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() =>
              void navigate({
                to: "/app/pedidos/$id",
                params: { id: conversation.linkedOrderId! },
              })
            }
          >
            Ver pedido
          </button>
        </div>
      )}
      <ConversationHeaderTags
        conversation={conversation}
        area="band"
        onChanged={onConversationUpdated}
      />
    </header>
  );
}
