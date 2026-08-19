import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { IAdReferralView } from "../engine/adReferral";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";

const S = CONVERSATION_STRINGS.adReferralCard;

export interface IAdReferralChatItemProps {
  view: IAdReferralView;
}

/**
 * Ad origin rendered inline at the head of the thread — the full creative the
 * customer clicked (headline, copy, links, campaign id), so the attendant knows
 * which ad brought them without leaving the conversation.
 *
 * Shares the anatomy of `NoteChatItem` but wears `severity-info`, not the amber
 * of an internal note: this is provenance about the CUSTOMER, not something a
 * colleague wrote. Never leaves for the customer — it is not a message.
 */
export function AdReferralChatItem({ view }: IAdReferralChatItemProps) {
  const [expanded, setExpanded] = useState(false);

  const mediaLabel =
    view.mediaType === "video" ? S.mediaVideo : view.mediaType === "image" ? S.mediaImage : null;

  async function copyId() {
    if (!view.sourceId) return;
    try {
      await navigator.clipboard.writeText(view.sourceId);
      toast.success(S.idCopied);
    } catch {
      toast.error(S.copyFailed);
    }
  }

  return (
    <div className="my-1.5 flex justify-center">
      <div className="w-full max-w-[88%] rounded-lg border border-severity-info/40 bg-severity-info/10 px-3 py-2 shadow-sm">
        {/* Header: origin badge + media kind */}
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-severity-info">
          <Icon icon="mdi:bullhorn-outline" size={13} aria-hidden />
          <span className="uppercase tracking-wide">{S.label}</span>
          {mediaLabel && (
            <span className="ml-auto rounded-full border border-current px-1.5 text-[10px] uppercase tracking-wide opacity-80">
              {mediaLabel}
            </span>
          )}
        </div>

        {view.headline && (
          <p className="mt-1 text-sm font-semibold leading-snug text-foreground">{view.headline}</p>
        )}

        {view.body && (
          <p
            className={cn(
              "mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-muted-foreground",
              view.bodyCollapsible && !expanded && "line-clamp-3",
            )}
          >
            {view.body}
          </p>
        )}

        {view.bodyCollapsible && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="mt-0.5 text-xs font-medium text-severity-info underline underline-offset-2 hover:opacity-80"
          >
            {expanded ? S.showLess : S.showMore}
          </button>
        )}

        {(view.adUrl || view.postUrl || view.sourceId) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {view.adUrl && (
              <a
                href={view.adUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-severity-info hover:underline"
              >
                <Icon icon="mdi:open-in-new" size={13} aria-hidden />
                {S.openAd}
              </a>
            )}
            {view.postUrl && (
              <a
                href={view.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-severity-info hover:underline"
              >
                <Icon icon="mdi:play-circle-outline" size={13} aria-hidden />
                {S.openPost}
              </a>
            )}
            {view.sourceId && (
              <button
                type="button"
                onClick={() => void copyId()}
                title={S.copyId}
                aria-label={S.copyId}
                className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] tabular-nums text-muted-foreground hover:text-foreground"
              >
                {S.adIdPrefix} {view.sourceId}
                <Icon icon="mdi:content-copy" size={11} aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
