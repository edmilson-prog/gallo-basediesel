import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { IPart } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { PartImage } from "@/features/catalog";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";
import { formatBRL } from "@/shared/utils/format";
import { STOREFRONT_PRODUCT_STRINGS as S } from "../i18n/pt-BR";

export interface IEquivalentsTabProps {
  part: IPart;
}

const STALE_MS = 5 * 60 * 1000;

/**
 * Equivalents tab — fetches `listEquivalents(partId)` from the parts
 * provider and renders each with a savings/markup indicator relative to the
 * current part price (PRD-063 RF-014).
 */
export function EquivalentsTab({ part }: IEquivalentsTabProps) {
  const partsProvider = usePartsProvider();
  const equivalentsQuery = useQuery({
    queryKey: ["storefront-product", "equivalents", part.id] as const,
    queryFn: () => partsProvider.listEquivalents(part.id),
    staleTime: STALE_MS,
  });

  if (equivalentsQuery.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const equivalents = equivalentsQuery.data ?? [];

  if (equivalents.length === 0) {
    return (
      <Card className="border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        <Icon
          icon="mdi:swap-horizontal-bold"
          size={28}
          className="mx-auto mb-2 text-muted-foreground"
          aria-hidden
        />
        {S.equivEmpty}
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {equivalents.map((equiv) => (
        <EquivalentRow key={equiv.id} source={part} equiv={equiv} />
      ))}
    </ul>
  );
}

function EquivalentRow({ source, equiv }: { source: IPart; equiv: IPart }) {
  const diff = source.unitPrice - equiv.unitPrice;
  const pct = source.unitPrice > 0 ? Math.round((diff / source.unitPrice) * 100) : 0;
  const oem = equiv.oemCodes?.[0];

  let pricePill: { tone: string; label: string } | null = null;
  if (pct > 0) {
    pricePill = {
      tone: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      label: S.equivSavingsLabel(pct),
    };
  } else if (pct < 0) {
    pricePill = {
      tone: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
      label: S.equivMoreExpensive(Math.abs(pct)),
    };
  } else if (diff === 0) {
    pricePill = { tone: "border-border bg-card text-muted-foreground", label: S.equivSamePrice };
  }

  return (
    <li>
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <PartImage part={equiv} size="md" className="!h-20 !w-20 !rounded-lg" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={
                equiv.isOriginal
                  ? "border-primary/30 bg-primary/15 text-primary"
                  : "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300"
              }
            >
              {equiv.isOriginal ? S.badgeOriginal : S.badgeEquivalent}
            </Badge>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {equiv.brand}
            </span>
          </div>
          <Link
            to="/loja/produto/$slug"
            params={{ slug: equiv.id }}
            className="block text-sm font-semibold text-foreground hover:text-primary"
          >
            {equiv.name}
          </Link>
          {oem && (
            <p className="text-xs text-muted-foreground">
              {S.infoOemLabel}: <span className="font-mono">{oem}</span>
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <p className="text-lg font-semibold text-primary">{formatBRL(equiv.unitPrice)}</p>
          {pricePill && (
            <Badge variant="outline" className={pricePill.tone}>
              {pricePill.label}
            </Badge>
          )}
          <Button asChild variant="outline" size="sm">
            <Link to="/loja/produto/$slug" params={{ slug: equiv.id }}>
              {S.equivSeeDetails}
              <Icon icon="mdi:arrow-right" size={14} className="ml-1" aria-hidden />
            </Link>
          </Button>
        </div>
      </Card>
    </li>
  );
}
