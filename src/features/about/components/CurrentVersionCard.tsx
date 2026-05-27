import type { IRelease, ReleaseKind } from "@/shared/types/about";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { ABOUT_I18N, RELEASE_KIND_LABEL } from "../i18n/pt-BR";

interface IProps {
  release: IRelease;
}

export function CurrentVersionCard({ release }: IProps) {
  const dateLabel = formatDateBr(release.date);
  const badge = KIND_BADGE[release.kind];

  const handleWhatsNew = () => {
    const target = document.getElementById(`release-${release.version}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <section className="relative mb-4 overflow-hidden rounded-xl border border-border bg-card p-6">
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-success to-success/40" />

      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-2xl font-bold tracking-tight text-success">
          v{release.version}
        </span>
        <span
          className={cn(
            "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            badge,
          )}
        >
          {RELEASE_KIND_LABEL[release.kind]}
        </span>
        {release.codename && (
          <span className="text-sm text-muted-foreground">
            {ABOUT_I18N.currentVersion.codenamePrefix}{" "}
            <strong className="font-semibold text-foreground">{release.codename}</strong>
          </span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
        <Meta label={ABOUT_I18N.currentVersion.metaDate} value={dateLabel} strong />
        <Meta
          label={ABOUT_I18N.currentVersion.metaKind}
          value={RELEASE_KIND_LABEL[release.kind]}
        />
        {release.block && (
          <Meta label={ABOUT_I18N.currentVersion.metaBlock} value={release.block} />
        )}
        <Meta
          label={ABOUT_I18N.currentVersion.metaDeliveries}
          value={
            <>
              <strong className="font-semibold">{release.totalItems}</strong>{" "}
              {ABOUT_I18N.currentVersion.deliveriesSuffix}
            </>
          }
        />
      </dl>

      <button
        type="button"
        onClick={handleWhatsNew}
        className="mt-4 flex w-full items-center justify-between gap-2 border-t border-border pt-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>{ABOUT_I18N.currentVersion.whatsNew}</span>
        <Icon icon="mdi:arrow-down" size={16} />
      </button>
    </section>
  );
}

interface IMetaProps {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}

function Meta({ label, value, strong }: IMetaProps) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("mt-1 text-sm text-foreground", strong && "font-semibold")}>
        {value}
      </dd>
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
