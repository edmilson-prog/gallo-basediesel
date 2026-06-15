import { memo, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { IConversation, IMessage, ISdrEscalation, IWhatsAppAccount } from "@/shared/types";
import { EscalationBadge } from "@/features/sdr-escalation/components/EscalationBadge";
import { EcommerceBadge } from "@/features/ecommerce-integration/components/EcommerceBadge";
import { Icon } from "@/components/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "./ContactAvatar";
import { useTimeTick } from "../hooks/useTimeTick";
import { formatRelativeTime, isFresh } from "../utils/formatRelativeTime";
import { instanceAccent } from "../utils/instanceAccent";
import {
  CHANNEL_META,
  STATUS_META,
  TEMPERATURE_META,
  getConversationDisplay,
  getMessagePreview,
} from "../utils/conversationDisplay";
import { statusVisual } from "../utils/messageDisplay";
import { INBOX_STRINGS, CONVERSATION_STRINGS } from "../i18n/pt-BR";
import type { ICustomer, ILead } from "@/shared/types";

export interface IConversationListItemProps {
  conversation: IConversation;
  customer: ICustomer | null;
  lead: ILead | null;
  lastMessage: IMessage | null;
  isSelected: boolean;
  isUnread: boolean;
  highlightTerm?: string;
  /** Render extra trailing actions inside the item (hover/focus). */
  trailing?: React.ReactNode;
  /** SDR escalation record bound to this conversation, when present. */
  escalation?: ISdrEscalation | null;
  onSelect?: () => void;
  /** Origin instance of the conversation (multi-instância) — drives the color bar. */
  originAccount?: IWhatsAppAccount | null;
  /** Show the origin color bar (only when the store has 2+ instances). */
  showOrigin?: boolean;
}

const HIGHLIGHT_CLASS = "bg-amber-200/60 text-foreground dark:bg-amber-400/30";

function highlight(text: string, term?: string): React.ReactNode {
  if (!term) return text;
  const needle = term.trim();
  if (!needle) return text;
  const lower = text.toLowerCase();
  const at = lower.indexOf(needle.toLowerCase());
  if (at === -1) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className={HIGHLIGHT_CLASS}>{text.slice(at, at + needle.length)}</mark>
      {text.slice(at + needle.length)}
    </>
  );
}

function ConversationListItemInner({
  conversation,
  customer,
  lead,
  lastMessage,
  isSelected,
  isUnread,
  highlightTerm,
  trailing,
  escalation,
  onSelect,
  originAccount,
  showOrigin,
}: IConversationListItemProps) {
  // Bump every minute so relative times stay fresh without per-item state.
  const now = useTimeTick(60_000);
  const [hover, setHover] = useState(false);

  const display = useMemo(
    () => getConversationDisplay(conversation, customer, lead),
    [conversation, customer, lead],
  );

  const preview = getMessagePreview(lastMessage);
  const relative = formatRelativeTime(conversation.lastMessageAt, now);
  const fresh = isFresh(conversation.lastMessageAt, now);
  const channel = CHANNEL_META[conversation.channel];
  const temperature = display.temperature ? TEMPERATURE_META[display.temperature] : null;
  const statusBar = STATUS_META[conversation.status].barClass;
  const unread = conversation.unreadCount;
  const isFreshEscalation = useMemo(() => {
    if (!escalation) return false;
    const created = new Date(escalation.createdAt).getTime();
    return now - created < 60_000;
  }, [escalation, now]);

  return (
    <Link
      to="/app/atendimento/$id"
      params={{ id: conversation.id }}
      // Preserve current search so inbox filters survive the navigation.
      search={(prev) => prev}
      onClick={() => onSelect?.()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      role="button"
      aria-label={INBOX_STRINGS.ariaListItem({
        name: display.name,
        when: relative,
        unread,
        status: CONVERSATION_STRINGS.statusAriaLabel[conversation.status],
      })}
      aria-current={isSelected ? "true" : undefined}
      data-conversation-id={conversation.id}
      className={cn(
        "relative flex w-full items-start gap-3 border-b border-border/60 px-3 py-3 text-left transition-colors",
        "hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        isSelected && "bg-accent/60 hover:bg-accent/60",
      )}
    >
      {showOrigin && originAccount && (
        <span
          aria-hidden
          className="absolute left-0 top-0 h-full w-[3px]"
          style={{ backgroundColor: instanceAccent(originAccount.id) }}
          title={`Origem: ${originAccount.label}`}
        />
      )}
      <span
        className={cn(
          "absolute top-0 h-full w-[3px]",
          showOrigin && originAccount ? "left-[3px]" : "left-0",
          isFreshEscalation ? "bg-[var(--brand-parts,theme(colors.emerald.500))]" : statusBar,
        )}
        aria-hidden
      />
      <ContactAvatar display={display} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm",
              isUnread ? "font-semibold text-foreground" : "font-medium text-foreground",
            )}
          >
            {highlight(display.name, highlightTerm)}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{relative}</span>
        </div>

        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p
            className={cn(
              "truncate text-xs",
              isUnread ? "text-foreground/90" : "text-muted-foreground",
            )}
          >
            {/* PRD-118 RF-030: mini delivery badge when WE sent the last message. */}
            {lastMessage?.direction === "out" && (
              <span
                className={cn(
                  "mr-1 inline-flex align-middle",
                  statusVisual(lastMessage.status).className,
                )}
                aria-label={statusVisual(lastMessage.status).label}
              >
                <Icon icon={statusVisual(lastMessage.status).icon} size={12} />
              </span>
            )}
            {highlight(preview, highlightTerm)}
          </p>
          {unread > 0 && (
            <span
              className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground"
              aria-label={`${unread} mensagens não lidas`}
            >
              {INBOX_STRINGS.unreadBadge(unread)}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
              channel.tone,
            )}
          >
            <Icon icon={channel.icon} size={11} />
            <span className="hidden sm:inline">{channel.label}</span>
          </span>

          {conversation.linkedOrderId && <EcommerceBadge compact />}

          {conversation.isSdrActive && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                  <Icon icon="mdi:robot" size={11} />
                  {INBOX_STRINGS.sdrBadge}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">{INBOX_STRINGS.sdrBadgeTooltip}</TooltipContent>
            </Tooltip>
          )}

          {escalation && !conversation.isSdrActive && (
            <EscalationBadge mode={escalation.mode} compact />
          )}

          {temperature && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                temperature.tone,
              )}
            >
              <Icon icon={temperature.icon} size={11} />
              {temperature.label}
            </span>
          )}

          {fresh && (
            <span className="inline-flex items-center rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              {INBOX_STRINGS.newBadge}
            </span>
          )}

          {!conversation.assignedSellerId &&
            !conversation.isSdrActive &&
            conversation.status === "aguardando" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    <Icon icon="mdi:timer-sand" size={11} />
                    Em fila
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">Conversa aguardando distribuição manual</TooltipContent>
              </Tooltip>
            )}
        </div>
      </div>

      {trailing && (
        <div
          className={cn(
            "absolute right-2 top-2 transition-opacity",
            hover || isSelected ? "opacity-100" : "opacity-0",
          )}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {trailing}
        </div>
      )}
    </Link>
  );
}

export const ConversationListItem = memo(ConversationListItemInner);
