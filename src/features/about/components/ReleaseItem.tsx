import type { IRelease, ReleaseKind } from "@/shared/types/about";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { ReleaseBody } from "./ReleaseBody";
import { ABOUT_I18N, RELEASE_KIND_LABEL } from "../i18n/pt-BR";

interface IProps {
  release: IRelease;
  open: boolean;
  onToggle: (version: string) => void;
}

export function ReleaseItem({ release, open, onToggle }: IProps) {
  const dateLabel = formatDateBr(release.date);
  const kindBadge = KIND_BADGE[release.kind];

  return (
    <div
      id={`release-${release.version}`}
      className="mb-2 overflow-hidden rounded-lg border border-border bg-card"
    >
      <button
        type="button"
        onClick={() => onToggle(release.version)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
      >
        <span className="min-w-[64px] font-mono text-sm font-semibold text-foreground">
          v{release.version}
        </span>
        <span
          className={cn(
            "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            kindBadge,
          )}
        >
          {RELEASE_KIND_LABEL[release.kind]}
        </span>
        <span className="flex-1 truncate text-sm text-muted-foreground">
          {release.codename ? (
            <>
              {ABOUT_I18N.currentVersion.codenamePrefix}{" "}
              <strong className="font-semibold text-foreground">{release.codename}</strong>
            </>
          ) : (
            <span className="text-muted-foreground/60">—</span>
          )}
        </span>
        <span className="hidden text-xs text-muted-foreground sm:inline">{dateLabel}</span>
        <span className="min-w-[60px] text-right text-xs text-muted-foreground">
          {release.totalItems} {ABOUT_I18N.history.itemsSuffix}
        </span>
        <Icon
          icon="mdi:chevron-down"
          size={18}
          className={cn("text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="border-t border-border bg-muted/20 px-5 py-4">
          <ReleaseBody release={release} />
        </div>
      )}
    </div>
  );
}

const KIND_BADGE: Record<ReleaseKind, string> = {
  major: "bg-primary/10 text-primary",
  minor: "bg-info/10 text-info",
  patch: "bg-success/10 text-success",
};

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
