import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { PwaAvatar } from "./ui/PwaAvatar";
import { PwaStatusDot } from "./ui/PwaStatusPill";
import { PwaWaitChip } from "./ui/PwaWaitChip";
import { PWA_CHANNEL_META, PWA_STATUS_META } from "./ui/statusMeta";
import { PWA_ATENDIMENTO_STRINGS as S } from "../i18n/pt-BR";
import type { IPwaConversationVM } from "../hooks/usePwaConversations";

interface IPwaConversationRowProps {
  item: IPwaConversationVM;
  /** Assignee label resolved by the page (seller name, when known). */
  assigneeLabel: string | null;
  /** Wait counter, shown on the queue screen only. */
  waitMs?: number;
  onOpen: (id: string) => void;
}

/** One line of the conversation list: status rail, monogram, preview, meta. */
export function PwaConversationRow({
  item,
  assigneeLabel,
  waitMs,
  onOpen,
}: IPwaConversationRowProps) {
  const channel = PWA_CHANNEL_META[item.channel];
  const status = PWA_STATUS_META[item.status];
  const unread = item.unread > 0;

  return (
    <Link
      to="/atendimento/conversa/$id"
      params={{ id: item.id }}
      onClick={() => onOpen(item.id)}
      className="flex w-full border-b border-border text-left active:bg-foreground/[0.04]"
    >
      <span className={cn("w-[3px] shrink-0", status.railClass)} aria-hidden />
      <span className="flex min-w-0 flex-1 gap-3 py-3 pl-[11px] pr-3.5">
        <PwaAvatar initials={item.initials} size={44} highlighted={unread} />
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[14.5px] text-foreground",
                unread ? "font-extrabold" : "font-bold",
              )}
            >
              {item.short}
            </span>
            <span
              className={cn(
                "shrink-0 text-[11.5px] font-semibold tabular-nums",
                unread ? "text-primary" : "text-muted-foreground",
              )}
            >
              {item.when}
            </span>
          </span>

          <span className="flex items-center gap-2">
            {item.previewIcon && (
              <Icon icon={item.previewIcon} size={12} className="shrink-0 text-muted-foreground" />
            )}
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[13px]",
                unread ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {item.previewText}
            </span>
            {unread && (
              <span className="flex h-[19px] min-w-[19px] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-extrabold text-primary-foreground">
                {item.unread > 9 ? "9+" : item.unread}
              </span>
            )}
          </span>

          <span className="mt-px flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px] font-bold",
                channel.toneClass,
              )}
            >
              <Icon icon={channel.icon} size={12} />
              {channel.label}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px] font-bold",
                assigneeLabel ? "text-muted-foreground" : "text-primary",
              )}
            >
              <PwaStatusDot status={item.status} size={6} />
              {assigneeLabel ?? S.list.inQueue}
            </span>
            {waitMs !== undefined && waitMs > 0 && <PwaWaitChip ms={waitMs} />}
          </span>
        </span>
      </span>
    </Link>
  );
}
