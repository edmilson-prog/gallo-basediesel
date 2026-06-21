import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { IRelease } from "@/shared/types/about";
import { renderInlineMarkdown } from "@/features/about/parser/renderInlineMarkdown";
import { WHATS_NEW_I18N } from "../i18n/pt-BR";

interface IProps {
  release: IRelease;
  /** The current release renders highlighted with full bullets. */
  highlighted?: boolean;
}

/** Max "Added" bullets shown in the highlighted card. */
const HIGHLIGHT_BULLETS = 5;

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** First paragraph of a (possibly multi-paragraph) summary. */
function firstParagraph(summary: string): string {
  return summary.split(/\n{2,}/)[0]?.trim() ?? "";
}

export function WhatsNewReleaseCard({ release, highlighted = false }: IProps) {
  const isMajor = release.kind === "major";
  const badgeLabel = isMajor ? WHATS_NEW_I18N.badge.major : WHATS_NEW_I18N.badge.minor;
  const summary = firstParagraph(release.summary);
  const added = release.categories.find((c) => c.category === "added")?.items ?? [];
  const bullets = highlighted ? added.slice(0, HIGHLIGHT_BULLETS) : [];

  return (
    <div
      className={cn(
        "rounded-lg p-4",
        highlighted
          ? isMajor
            ? "border-2 border-primary"
            : "border-2 border-info"
          : "border border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded px-2 py-0.5 text-[11px] font-semibold",
            isMajor ? "bg-primary/10 text-primary" : "bg-info/10 text-info",
          )}
        >
          {badgeLabel}
        </span>
        <span className="font-mono text-sm font-semibold text-foreground">v{release.version}</span>
        {release.codename && (
          <span className="text-sm font-semibold text-success">{release.codename}</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{formatDateBr(release.date)}</span>
      </div>

      {summary && (
        <p
          className={cn(
            "mt-2.5 text-sm leading-relaxed text-muted-foreground",
            highlighted ? "line-clamp-4" : "line-clamp-2",
          )}
        >
          {renderInlineMarkdown(summary)}
        </p>
      )}

      {bullets.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {bullets.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground">
              <Icon
                icon="mdi:plus-circle"
                size={15}
                className="mt-0.5 shrink-0 text-success"
              />
              <span className="leading-snug line-clamp-2">{renderInlineMarkdown(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
