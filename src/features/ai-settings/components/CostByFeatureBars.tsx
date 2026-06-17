import { AI_FEATURE_LABELS, type IAiUsageSummary } from "@/shared/types";

export function CostByFeatureBars({ byFeature }: { byFeature: IAiUsageSummary["byFeature"] }) {
  const max = Math.max(1, ...byFeature.map((f) => f.costBRL));
  const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <div className="space-y-3">
      {byFeature.map((f) => (
        <div key={f.feature} className="flex items-center gap-3 text-sm">
          <span className="w-40 shrink-0 truncate text-foreground">
            {AI_FEATURE_LABELS[f.feature]}
          </span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full bg-primary"
              style={{ width: `${(f.costBRL / max) * 100}%` }}
            />
          </span>
          <span className="w-20 text-right text-muted-foreground">{fmt.format(f.costBRL)}</span>
        </div>
      ))}
    </div>
  );
}
