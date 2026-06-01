import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";

const COPY = CATALOG_STRINGS.detail.fiscal;

export interface IPartFiscalCardProps {
  part: IPart;
}

export function PartFiscalCard({ part }: IPartFiscalCardProps) {
  const f = part.fiscal;
  const hasData = f && (f.ncm || f.icmsPercent != null || f.taxSubstitution != null || f.origin);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon icon="mdi:file-percent-outline" size={18} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{COPY.title}</h2>
      </div>
      {hasData ? (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Field label={COPY.ncm} value={f?.ncm} mono />
          <Field
            label={COPY.icms}
            value={f?.icmsPercent != null ? `${f.icmsPercent}%` : undefined}
          />
          <Field
            label={COPY.st}
            value={
              f?.taxSubstitution != null ? (f.taxSubstitution ? COPY.yes : COPY.no) : undefined
            }
          />
          <Field label={COPY.origin} value={f?.origin} />
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{COPY.empty}</p>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-foreground" : "text-foreground"}>{value ?? "—"}</dd>
    </div>
  );
}
