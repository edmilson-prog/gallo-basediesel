import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { PartImage } from "../PartImage";
import { Section } from "./ApplicationsSection";
import { EquivalentsEditor } from "../form/EquivalentsEditor";
import type { IPartDraft } from "../../utils/draft";

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export interface IEquivalentsSectionProps {
  part: IPart;
  editing?: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
}

export function EquivalentsSection({
  part,
  editing = false,
  draft,
  onDraftChange,
}: IEquivalentsSectionProps) {
  const navigate = useNavigate();
  const provider = usePartsProvider();
  const query = useQuery({
    queryKey: ["part-equivalents", part.id] as const,
    queryFn: () => provider.listEquivalents(part.id),
    enabled: part.equivalentPartIds.length > 0,
    staleTime: 60_000,
  });

  if (editing && draft && onDraftChange) {
    return (
      <Section title={CATALOG_STRINGS.detail.sections.equivalents} icon="mdi:swap-horizontal">
        <EquivalentsEditor
          selectedIds={draft.equivalentPartIds}
          excludeId={part.id}
          onChange={(ids) => onDraftChange({ equivalentPartIds: ids })}
        />
      </Section>
    );
  }

  if (part.equivalentPartIds.length === 0) {
    return (
      <Section title={CATALOG_STRINGS.detail.sections.equivalents} icon="mdi:swap-horizontal">
        <p className="text-sm text-muted-foreground">{CATALOG_STRINGS.detail.equivalents.empty}</p>
      </Section>
    );
  }

  if (query.isLoading) {
    return (
      <Section title={CATALOG_STRINGS.detail.sections.equivalents} icon="mdi:swap-horizontal">
        <Skeleton className="h-16 w-full" />
      </Section>
    );
  }

  const equivalents = query.data ?? [];

  return (
    <Section title={CATALOG_STRINGS.detail.sections.equivalents} icon="mdi:swap-horizontal">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {equivalents.map((equiv) => {
          const diff = ((equiv.unitPrice - part.unitPrice) / part.unitPrice) * 100;
          const savings = diff < 0;
          return (
            <button
              key={equiv.id}
              type="button"
              onClick={() => void navigate({ to: "/app/catalogo/$id", params: { id: equiv.id } })}
              className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <PartImage part={equiv} size="sm" />
              <div className="flex-1 overflow-hidden">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-foreground">{equiv.name}</p>
                  {equiv.isOriginal && (
                    <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                      OEM
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{equiv.brand}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">
                  {formatPrice(equiv.unitPrice)}
                </p>
                <p
                  className={
                    savings
                      ? "text-[10px] font-semibold text-severity-success"
                      : "text-[10px] font-medium text-muted-foreground"
                  }
                >
                  {CATALOG_STRINGS.detail.equivalents.savings(diff)}
                </p>
              </div>
              <Icon icon="mdi:arrow-right" size={14} className="text-muted-foreground" />
            </button>
          );
        })}
      </div>
    </Section>
  );
}
