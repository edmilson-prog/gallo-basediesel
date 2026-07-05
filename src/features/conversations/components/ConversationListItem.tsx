import { memo, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type {
  IConversation,
  IMessage,
  ISdrEscalation,
  ISeller,
  IWhatsAppAccount,
} from "@/shared/types";
import { EscalationBadge } from "@/features/sdr-escalation/components/EscalationBadge";
import { EcommerceBadge } from "@/features/ecommerce-integration/components/EcommerceBadge";
import { isQueuedConversation } from "@/features/inbox-alerts";
import { Icon } from "@/components/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "./ContactAvatar";
import { AssigneeChip } from "./AssigneeChip";
import { useTimeTick } from "../hooks/useTimeTick";
import { formatRelativeTime, isFresh } from "../utils/formatRelativeTime";
import { formatWaitTime, waitSeverity, type WaitSeverity } from "../engine/waitTime";
import { accountAccent } from "../utils/instanceAccent";
import { deriveInstanceLock } from "../engine/instanceLock";
import { useLiveInstanceStatus } from "../hooks/useLiveInstanceStatus";
import {
  CHANNEL_META,
  STATUS_META,
  TEMPERATURE_META,
  displayFromContact,
  getMessagePreview,
} from "../utils/conversationDisplay";
import { statusVisual } from "../utils/messageDisplay";
import { INBOX_STRINGS, CONVERSATION_STRINGS } from "../i18n/pt-BR";
import type { IConversationContact } from "@/shared/types";
import { resolveConversationTags, splitVisibleTags } from "../engine/tagCatalog";
import { useConversationTags } from "../hooks/useConversationTags";
import { ConversationTagChip, TagOverflowChip } from "./tags/ConversationTagChip";

export interface IConversationListItemProps {
  conversation: IConversation;
  /** Display-ready contact resolved server-side (pool-safe — see useRelatedEntities). */
  contact: IConversationContact | null;
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
  /** Seller the conversation is assigned to (for the responsible chip). */
  assignedSeller?: ISeller | null;
  /** Show the assignee chip (staff/manager oversight). */
  showAssignee?: boolean;
}

const HIGHLIGHT_CLASS = "bg-amber-200/60 text-foreground dark:bg-amber-400/30";

/** Traffic-light color for the queue wait counter, using severity tokens. */
const WAIT_TONE: Record<WaitSeverity, string> = {
  neutral: "text-muted-foreground",
  warning: "text-severity-warning",
  critical: "text-severity-critical",
};

/** Chars kept on each side of the match before the row's single-line `truncate` clips it. */
const SNIPPET_RADIUS = 40;

/**
 * Extracts a window of `text` centered on `term` (with ellipses at either cut
 * edge) so a single-line `truncate` never hides the match itself — unlike
 * truncating the full text from the end, which cuts off a match that lands
 * past the visible prefix (common for a message-content search hit near the
 * end of a long message).
 */
function snippetAround(text: string, term: string | undefined, radius = SNIPPET_RADIUS): string {
  if (!term) return text;
  const needle = term.trim();
  if (!needle) return text;
  const at = text.toLowerCase().indexOf(needle.toLowerCase());
  if (at === -1) return text;
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + needle.length + radius);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

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
  contact,
  lastMessage,
  isSelected,
  isUnread,
  highlightTerm,
  trailing,
  escalation,
  onSelect,
  originAccount,
  showOrigin,
  assignedSeller,
  showAssignee,
}: IConversationListItemProps) {
  // Bump every minute so relative times stay fresh without per-item state.
  const now = useTimeTick(60_000);
  const [hover, setHover] = useState(false);

  const display = useMemo(
    () => displayFromContact(conversation, contact),
    [conversation, contact],
  );
  const liveOriginAccount = useLiveInstanceStatus(originAccount);
  const instanceLock = useMemo(() => deriveInstanceLock(liveOriginAccount), [liveOriginAccount]);
  const instanceLockLabel = instanceLock.locked
    ? instanceLock.reason === "pending"
      ? CONVERSATION_STRINGS.instanceLocked.listBadgePending
      : CONVERSATION_STRINGS.instanceLocked.listBadgeDisconnected
    : undefined;
  const instanceLockTone =
    instanceLock.reason === "pending"
      ? "bg-severity-warning/15 text-severity-warning"
      : "bg-severity-critical/15 text-severity-critical";

  const preview = getMessagePreview(lastMessage);
  const relative = formatRelativeTime(conversation.lastMessageAt, now);
  const fresh = isFresh(conversation.lastMessageAt, now);

  // Wait counter — only while the conversation sits in the manual queue.
  // Falls back to lastMessageAt for rows created before the queued_at backfill.
  const isQueued = isQueuedConversation(conversation);
  const waitBase = conversation.queuedAt ?? conversation.lastMessageAt;
  const waitMs = isQueued ? now.getTime() - Date.parse(waitBase) : 0;
  const waitTone = WAIT_TONE[waitSeverity(waitMs)];

  const channel = CHANNEL_META[conversation.channel];
  const temperature = display.temperature ? TEMPERATURE_META[display.temperature] : null;
  const statusBar = STATUS_META[conversation.status].barClass;
  const unread = conversation.unreadCount;
  const unreadBadge =
    unread > 0 ? (
      <span
        className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground"
        aria-label={`${unread} mensagens não lidas`}
      >
        {INBOX_STRINGS.unreadBadge(unread)}
      </span>
    ) : null;
  const isFreshEscalation = useMemo(() => {
    if (!escalation) return false;
    const created = new Date(escalation.createdAt).getTime();
    return now - created < 60_000;
  }, [escalation, now]);
  const { tags: tagCatalog } = useConversationTags();
  const rowTags = splitVisibleTags(resolveConversationTags(conversation.tags, tagCatalog), 2);

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
          style={{ backgroundColor: accountAccent(originAccount) }}
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
      <div className="relative shrink-0">
        <ContactAvatar display={display} className={cn(instanceLock.locked && "grayscale opacity-75")} />
        {instanceLock.locked && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background",
                  instanceLockTone,
                )}
                role="img"
                aria-label={instanceLockLabel}
              >
                <Icon icon="mdi:wifi-off" size={10} />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{instanceLockLabel}</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm uppercase",
              isUnread ? "font-semibold text-foreground" : "font-medium text-foreground",
            )}
          >
            {highlight(display.name, highlightTerm)}
          </span>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-xs text-muted-foreground">{relative}</span>
            {isQueued && waitMs >= 0 && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-semibold tabular-nums",
                  waitTone,
                )}
                aria-label={`Aguardando há ${formatWaitTime(waitMs)}`}
              >
                <Icon icon="mdi:timer-outline" size={11} />
                {formatWaitTime(waitMs)}
              </span>
            )}
          </div>
        </div>

        {conversation.matchedMessage ? (
          <div className="mt-0.5 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p
                className={cn(
                  "truncate text-xs",
                  isUnread ? "text-foreground/90" : "text-muted-foreground",
                )}
              >
                {conversation.matchedMessage.direction === "out" && (
                  <span className="text-muted-foreground">
                    {INBOX_STRINGS.messageSearch.outboundPrefix}
                  </span>
                )}
                {highlight(
                  snippetAround(conversation.matchedMessage.text, highlightTerm),
                  highlightTerm,
                )}
              </p>
              {unreadBadge}
            </div>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
              <Icon icon="mdi:text-search" size={10} className="shrink-0 text-primary" />
              <span className="truncate">
                {INBOX_STRINGS.messageSearch.provenanceLabel(
                  formatRelativeTime(conversation.matchedMessage.sentAt, now),
                )}
                {conversation.matchedMessage.extraMatchCount > 0 &&
                  ` · ${INBOX_STRINGS.messageSearch.extraMatches(conversation.matchedMessage.extraMatchCount)}`}
              </span>
            </p>
          </div>
        ) : (
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
            {unreadBadge}
          </div>
        )}

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

          {conversation.isCollaborator && (
            <span className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
              <Icon icon="mdi:account-multiple-outline" size={11} />
              {INBOX_STRINGS.collaboratingBadge}
            </span>
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

          {rowTags.visible.map((tag) => (
            <ConversationTagChip key={tag.id} tag={tag} size="xs" />
          ))}
          <TagOverflowChip tags={rowTags.overflow} size="xs" />

          {fresh && (
            <span className="inline-flex items-center rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              {INBOX_STRINGS.newBadge}
            </span>
          )}

          {isQueuedConversation(conversation) && (
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

          {showAssignee && assignedSeller && (
            <AssigneeChip seller={assignedSeller} variant="compact" className="ml-auto shrink-0" />
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
