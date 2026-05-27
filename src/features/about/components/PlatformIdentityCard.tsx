import { Icon } from "@/components/Icon";
import { ABOUT_I18N } from "../i18n/pt-BR";

export function PlatformIdentityCard() {
  const i = ABOUT_I18N.identity;
  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight">
        <Icon icon="mdi:circle-medium" size={22} className="text-success" />
        {i.productName}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{i.tagline}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {i.maintainerPrefix}
        <a
          href={`mailto:${i.maintainerEmail}`}
          className="font-semibold text-foreground hover:underline"
        >
          {i.maintainerName}
        </a>
        .
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <SubmarkPill
          label={i.submarks.parts}
          className="bg-success/10 text-success"
          dot="bg-success"
        />
        <SubmarkPill
          label={i.submarks.service}
          className="bg-destructive/10 text-destructive"
          dot="bg-destructive"
        />
        <SubmarkPill
          label={i.submarks.industrial}
          className="bg-warning/10 text-warning"
          dot="bg-warning"
        />
      </div>
    </section>
  );
}

interface IPillProps {
  label: string;
  className: string;
  dot: string;
}

function SubmarkPill({ label, className, dot }: IPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium tracking-wide ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
