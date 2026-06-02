import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/features/shell/components/EmptyState";
import type { ID } from "@/shared/types";
import { useStoreIndicators } from "../hooks/useIndicators";
import { useIndicatorMilestoneToast } from "../hooks/useIndicatorMilestoneToast";
import { indicatorsPtBR as S } from "../i18n/pt-BR";
import { IndicatorCard } from "./IndicatorCard";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VendedorIndicatorsDashboard({
  sellerId,
  storeId,
}: {
  sellerId: ID | undefined;
  storeId: ID;
}) {
  const { items, isLoading, hasError } = useStoreIndicators(storeId);

  useIndicatorMilestoneToast(items);

  const visibleItems = useMemo(() => {
    return items.filter(({ indicator }) => {
      if (indicator.status !== "ativo") return false;
      if (indicator.scopeLevel === "store" || indicator.scopeLevel === "global") return true;
      if (indicator.scopeLevel === "individual" && indicator.sellerId === sellerId) return true;
      return false;
    });
  }, [items, sellerId]);

  if (hasError) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
        <Icon icon="mdi:alert-circle-outline" size={40} />
        <p className="text-sm">Erro ao carregar indicadores.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <Icon icon="mdi:chart-line" size={26} className="text-primary" />
          {S.title}
        </h1>
        <p className="text-sm text-muted-foreground">{S.subtitle}</p>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-lg" />
          ))}
        </div>
      ) : visibleItems.length === 0 ? (
        <EmptyState
          icon="mdi:chart-line"
          title={S.emptySeller}
          description="Os indicadores que sua equipe criar aparecerão aqui."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((item) => (
            <IndicatorCard key={item.indicator.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
