import type { ITrackableLink } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface ILinkOpenIndicatorProps {
  link: ITrackableLink;
}

/** Human "há N min/h/d" from an ISO timestamp (pt-BR, coarse). */
function relativeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMin = Math.max(0, Math.round((now.getTime() - then) / 60_000));
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h`;
  const diffD = Math.round(diffH / 24);
  return `${diffD} d`;
}

/**
 * Ambient open-tracking line under a link bubble (D-8/D-9). Renders nothing
 * until the first simulated open. Never a toast — quiet, sky-toned info.
 */
export function LinkOpenIndicator({ link }: ILinkOpenIndicatorProps) {
  const s = QUICK_SEND_STRINGS.link;
  if (link.opens <= 0 || !link.lastOpenedAt) return null;
  return (
    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-severity-info">
      <Icon icon="mdi:eye-outline" size={12} aria-hidden />
      <span>
        {s.openedAgo(relativeAgo(link.lastOpenedAt))} · {s.openCount(link.opens)}
      </span>
    </p>
  );
}
