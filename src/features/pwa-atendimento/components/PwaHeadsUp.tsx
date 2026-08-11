import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import type { IHeadsUpNotice } from "../hooks/useHeadsUpNotice";
import { PWA_ATENDIMENTO_STRINGS as S } from "../i18n/pt-BR";

interface IPwaHeadsUpProps {
  notice: IHeadsUpNotice | null;
  /** Display name resolved by the screen, when it happens to know it. */
  title?: string;
  onDismiss: () => void;
}

/** Top band announcing a message from another conversation. */
export function PwaHeadsUp({ notice, title, onDismiss }: IPwaHeadsUpProps) {
  if (!notice) return null;
  return (
    <div
      role="status"
      className="absolute inset-x-2 top-2 z-[70] overflow-hidden rounded-lg bg-card shadow-lg ring-1 ring-inset ring-border"
    >
      <Link
        to="/atendimento/conversa/$id"
        params={{ id: notice.conversationId }}
        onClick={onDismiss}
        className="flex gap-3 px-3 pb-2.5 pt-3 text-left"
      >
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md bg-background">
          <Icon icon="mdi:message-badge-outline" size={18} className="text-primary" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {S.appName}
            <span className="text-muted-foreground/60">·</span>
            <span className="normal-case tracking-normal text-muted-foreground/60">
              {S.push.headsUpNow}
            </span>
          </span>
          {title && (
            <span className="mt-1 block truncate text-sm font-extrabold text-foreground">
              {title}
            </span>
          )}
          <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-muted-foreground">
            {notice.body}
          </span>
        </span>
      </Link>
      <div className="flex border-t border-border">
        <Link
          to="/atendimento/conversa/$id"
          params={{ id: notice.conversationId }}
          onClick={onDismiss}
          className="flex min-h-[44px] flex-1 items-center justify-center text-[13px] font-bold text-primary"
        >
          {S.push.headsUpOpen}
        </Link>
        <span className="w-px bg-border" aria-hidden />
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-[44px] flex-1 text-[13px] font-bold text-muted-foreground"
        >
          {S.push.headsUpDismiss}
        </button>
      </div>
    </div>
  );
}
