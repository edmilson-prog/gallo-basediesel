import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { getCategoryLabel } from "../../utils/categories";
import { PartImage } from "../PartImage";
import { PartSefazBadge } from "./PartSefazBadge";

const COPY = CATALOG_STRINGS.detail.identity;

export interface IPartIdentityCardProps {
  part: IPart;
  /** Compact omits the description and uses a smaller image (sheet header). */
  compact?: boolean;
}

export function PartIdentityCard({ part, compact = false }: IPartIdentityCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex gap-4">
        <PartImage part={part} size={compact ? "sm" : "lg"} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <h1 className="text-lg font-semibold uppercase leading-tight tracking-tight text-foreground">
              {part.name}
            </h1>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              SKU {part.sku} · OEM {part.oemCodes[0] ?? "—"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {part.category && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">
                {getCategoryLabel(part.category)}
              </span>
            )}
            {part.segment && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {part.segment}
              </span>
            )}
            {part.isOriginal ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                <Icon icon="mdi:check-decagram" size={11} />
                {CATALOG_STRINGS.badges.original}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {CATALOG_STRINGS.badges.equivalent}
              </span>
            )}
            {!part.active && (
              <span className="inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] text-destructive">
                {CATALOG_STRINGS.status.inactive}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* GTIN block — the official identity */}
      <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          <Icon icon="mdi:barcode" size={13} />
          {COPY.gtinLabel}
        </div>
        {part.gtin ? (
          <>
            <p className="mt-1 font-mono text-base font-semibold tracking-wide text-foreground">
              {part.gtin}
            </p>
            <div className="mt-1.5">
              <PartSefazBadge status={part.sefazStatus} checkedAt={part.sefazCheckedAt} />
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">{COPY.noGtin}</p>
        )}
        {part.supplierCode && (
          <p className="mt-2 text-xs text-muted-foreground">
            {COPY.supplierCode}: <span className="font-mono">{part.supplierCode}</span>
          </p>
        )}
      </div>

      {/* Reference / group / type chips */}
      {(part.reference || part.group || part.partType) && (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
          {part.reference && <IdentityField label={COPY.reference} value={part.reference} mono />}
          {part.group && <IdentityField label={COPY.group} value={part.group} />}
          {part.partType && <IdentityField label={COPY.type} value={part.partType} />}
        </dl>
      )}

      {!compact && part.description && (
        <p className="mt-3 text-sm text-muted-foreground">{part.description}</p>
      )}
    </div>
  );
}

function IdentityField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-foreground" : "text-foreground"}>{value}</dd>
    </div>
  );
}
