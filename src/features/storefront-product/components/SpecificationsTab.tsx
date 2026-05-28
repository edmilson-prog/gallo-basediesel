import type { IPart } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { getCategoryLabel } from "@/features/catalog";
import { STOREFRONT_PRODUCT_STRINGS as S } from "../i18n/pt-BR";

export interface ISpecificationsTabProps {
  part: IPart;
}

/**
 * Specifications tab — exposes the catalog metadata that doesn't fit the
 * header (alternative OEM codes, supplier, full description) and a static
 * warranty disclaimer (PRD-063 RF-015 + FAQ placeholder).
 */
export function SpecificationsTab({ part }: ISpecificationsTabProps) {
  const altCodes = (part.oemCodes ?? []).slice(1);
  const rows: Array<{ label: string; value: string }> = [
    { label: S.specsCategory, value: getCategoryLabel(part.category) },
    {
      label: S.specsSubcategory,
      value: part.subcategory ? capitalize(part.subcategory) : S.specsValueMissing,
    },
    { label: S.infoBrandLabel, value: part.brand },
    { label: S.specsSupplier, value: part.supplier ?? S.specsValueMissing },
    { label: S.infoSkuLabel, value: part.sku },
    { label: S.specsDivision, value: divisionLabel(part.division) },
  ];

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <h3 className="text-base font-semibold text-foreground">{S.specsTitle}</h3>
        <dl className="grid gap-3 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.label}>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {r.label}
              </dt>
              <dd className="mt-0.5 text-sm text-foreground">{r.value}</dd>
            </div>
          ))}
        </dl>

        {altCodes.length > 0 && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {S.specsAlternativeCodes}
            </dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {altCodes.map((code) => (
                <span
                  key={code}
                  className="rounded-sm bg-muted px-2 py-0.5 font-mono text-xs text-foreground"
                >
                  {code}
                </span>
              ))}
            </dd>
          </div>
        )}

        {part.description && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {S.specsDescription}
            </dt>
            <dd className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground">
              {part.description}
            </dd>
          </div>
        )}
      </Card>

      <Card className="space-y-2 p-5">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Icon icon="mdi:shield-check-outline" size={18} className="text-primary" aria-hidden />
          {S.specsWarrantyTitle}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{S.specsWarrantyBody}</p>
      </Card>

      <Card className="space-y-2 border-dashed border-border bg-muted/30 p-5">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Icon
            icon="mdi:comment-question-outline"
            size={18}
            className="text-primary"
            aria-hidden
          />
          {S.faqTitle}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{S.faqPlaceholder}</p>
      </Card>
    </div>
  );
}

function capitalize(value: string): string {
  if (value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function divisionLabel(division: IPart["division"]): string {
  switch (division) {
    case "parts":
      return "PARTS — Peças";
    case "service":
      return "SERVICE — Oficina";
    case "industrial":
      return "INDUSTRIAL — Industrial";
    default:
      return division;
  }
}
