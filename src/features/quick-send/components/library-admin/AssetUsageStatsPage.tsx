import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssetUsageStats } from "@/features/quick-send";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

export interface IAssetUsageStatsPageProps {}

/**
 * Asset usage statistics (D-13, RF-025): most-sent assets and per-seller
 * ranking. RBAC is enforced at the route (Owner/Gestor); this page only reads.
 */
export function AssetUsageStatsPage(_: IAssetUsageStatsPageProps) {
  const s = QUICK_SEND_STRINGS.stats;
  const { topAssets, bySeller, isLoading, isError } = useAssetUsageStats();
  const maxAsset = topAssets.reduce((m, a) => Math.max(m, a.count), 0) || 1;
  const maxSeller = bySeller.reduce((m, a) => Math.max(m, a.count), 0) || 1;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">{s.title}</h1>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">{s.title}</h1>
        <p className="px-4 py-6 text-center text-sm text-destructive">
          {QUICK_SEND_STRINGS.errors.loadAssetFailed}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{s.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{s.subtitle}</p>
      </div>

      {/* Most-sent assets */}
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Icon icon="mdi:trophy-outline" size={16} className="text-primary" />
            {s.topAssets}
          </p>
        </div>
        {topAssets.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{s.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {topAssets.map((a, idx) => (
              <li key={a.assetId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{a.title}</p>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(a.count / maxAsset) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                  {s.sendCount(a.count)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Per-seller ranking */}
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Icon icon="mdi:account-group-outline" size={16} className="text-primary" />
            {s.perSeller}
          </p>
        </div>
        {bySeller.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{s.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {bySeller.map((row, idx) => (
              <li key={row.sellerId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{row.sellerId}</p>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${(row.count / maxSeller) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                  {s.sendCount(row.count)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
