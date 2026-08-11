import type {
  IConversation,
  IConversationTag,
  IMessage,
  ISeller,
  IWhatsAppAccount,
} from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "./ContactAvatar";
import { ConversationTagChip } from "./tags/ConversationTagChip";
import type { IConversationDisplay } from "../utils/conversationDisplay";
import {
  CHANNEL_META,
  STATUS_META,
  TEMPERATURE_META,
  getMessagePreview,
} from "../utils/conversationDisplay";
import { formatRelativeTime } from "../utils/formatRelativeTime";
import { accountAccent } from "../utils/instanceAccent";
import { buildSummaryFooter } from "../engine/summaryFooter";
import { INBOX_STRINGS, CONVERSATION_STRINGS } from "../i18n/pt-BR";

const COPY = INBOX_STRINGS.summaryCard;

export interface IConversationSummaryCardProps {
  conversation: IConversation;
  /** Already resolved by the row via `displayFromContact` — never recompute. */
  display: IConversationDisplay;
  lastMessage: IMessage | null;
  originAccount?: IWhatsAppAccount | null;
  assignedSeller?: ISeller | null;
  /** Already resolved against the catalog by the row. ALL of them, not just the visible two. */
  tags: IConversationTag[];
  /** Shared minute tick from the row, so both stay in step. */
  now: Date;
}

/**
 * Read-only contact summary shown when the pointer rests on an inbox row.
 *
 * Its entire job is to un-truncate: the row uppercases and clips the name, gives
 * the preview one line, shows two of the tags, and never shows the phone at all.
 * Everything here arrives as a prop the row already had in hand to draw itself —
 * no provider, no query, no request. That is what makes hovering free.
 */
export function ConversationSummaryCard({
  conversation,
  display,
  lastMessage,
  originAccount,
  assignedSeller,
  tags,
  now,
}: IConversationSummaryCardProps) {
  const accent = originAccount ? accountAccent(originAccount) : null;
  const status = STATUS_META[conversation.status];
  const temperature = display.temperature ? TEMPERATURE_META[display.temperature] : null;
  const channelLabel = CHANNEL_META[conversation.channel].label;

  // "Cliente" / "Lead". The list-level contact carries no B2B/B2C split — that
  // would need a request, which this card is explicitly free of.
  const qualifier = display.isLead ? COPY.qualifierLead : COPY.qualifierCustomer;

  // When the name IS the phone number, don't print it twice: the identity line
  // falls back to the channel it came in through.
  const secondaryLine = display.isPhoneName ? channelLabel : display.phone;

  const footer = buildSummaryFooter({
    statusLabel: CONVERSATION_STRINGS.statusLabel[conversation.status],
    sellerName: assignedSeller?.fullName,
    instanceLabel: originAccount?.label,
  });

  const preview = getMessagePreview(lastMessage);
  const authorPrefix =
    lastMessage?.direction === "out" && assignedSeller?.fullName
      ? `${assignedSeller.fullName}: `
      : "";
  const showPreviewBlock = Boolean(preview) || conversation.isAccessible === false;

  return (
    <div className="overflow-hidden">
      {/* Ties the card back to the row's left-hand instance bar. */}
      <div
        aria-hidden
        className="h-0.5 w-full"
        style={{ backgroundColor: accent ?? "transparent" }}
      />

      <div className="flex gap-3 p-3.5">
        <ContactAvatar display={display} className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1">
          {/* Natural case, up to two lines — the row forces uppercase and clips at one. */}
          <p className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
            {display.name}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <span>{qualifier}</span>
            {temperature && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                  temperature.tone,
                )}
              >
                <Icon icon={temperature.icon} size={10} />
                {temperature.label}
              </span>
            )}
          </p>
          {secondaryLine && (
            <p className="mt-1 text-[13.5px] font-medium tabular-nums text-foreground">
              {secondaryLine}
            </p>
          )}
        </div>
      </div>

      {showPreviewBlock && (
        <>
          <div className="h-px bg-border" />
          <div className="p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {COPY.lastMessageLabel}
              {lastMessage && ` · ${formatRelativeTime(lastMessage.sentAt, now)}`}
            </p>
            {preview ? (
              <p className="mt-1.5 line-clamp-4 border-l-2 border-primary/55 pl-2.5 text-xs text-foreground/85">
                {authorPrefix && <span className="text-muted-foreground">{authorPrefix}</span>}
                {preview}
              </p>
            ) : (
              <p className="mt-1.5 text-xs italic text-muted-foreground">
                {COPY.previewUnavailable}
              </p>
            )}
          </div>
        </>
      )}

      <div className="h-px bg-border" />
      <div className="p-3.5">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-muted-foreground">
          {footer.map((part, i) => (
            <span key={part.kind} className="inline-flex items-center">
              {i > 0 && <span className="mr-1.5 opacity-40">·</span>}
              {part.kind === "status" && (
                <span
                  aria-hidden
                  className={cn("mr-1.5 h-1.5 w-1.5 rounded-full", status.dotClass)}
                />
              )}
              {part.kind === "instance" && accent && (
                <span
                  aria-hidden
                  className="mr-1.5 h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: accent }}
                />
              )}
              {part.text}
            </span>
          ))}
        </p>

        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <ConversationTagChip key={tag.id} tag={tag} size="xs" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
