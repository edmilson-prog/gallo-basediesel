import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useCurrentStore } from "@/features/multistore";
import { ModeSection } from "../components/ModeSection";
import { CriteriaSection } from "../components/CriteriaSection";
import { BusinessHoursSection } from "../components/BusinessHoursSection";
import { OffHoursMessageSection } from "../components/OffHoursMessageSection";
import { QueuePolicySection } from "../components/QueuePolicySection";
import { DistributionSimulator } from "../components/DistributionSimulator";
import { DistributionHistory } from "../components/DistributionHistory";
import { TriggerInboundSection } from "../components/TriggerInboundSection";
import { useDistributionSettings } from "../hooks/useDistributionSettings";
import { useState } from "react";

/**
 * Owner-only admin panel that lets the operator configure the routing engine
 * (PRD-013). Each section is its own component to keep the page composable
 * and reduce re-renders on form drafts.
 */
export function DistributionRulesPanel() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "store-matriz";
  const { settings, loading, saving, update, error } = useDistributionSettings(storeId);
  const [historyKey, setHistoryKey] = useState(0);

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Distribuição e roteamento</h1>
          <p className="text-sm text-muted-foreground">
            Regras que governam quem atende cada conversa nova.
          </p>
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Distribuição e roteamento</h1>
        <p className="text-sm text-muted-foreground">
          Regras que governam quem atende cada conversa nova. Cada alteração gera registro de
          auditoria.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <ModeSection settings={settings} saving={saving} onChange={update} />
      <Separator />
      <CriteriaSection settings={settings} saving={saving} onChange={update} />
      <Separator />
      <BusinessHoursSection settings={settings} saving={saving} onChange={update} />
      <Separator />
      <OffHoursMessageSection settings={settings} saving={saving} onChange={update} />
      <Separator />
      <QueuePolicySection settings={settings} saving={saving} onChange={update} />
      <Separator />
      <DistributionSimulator storeId={storeId} settings={settings} />
      <Separator />
      <TriggerInboundSection storeId={storeId} onCreated={() => setHistoryKey((k) => k + 1)} />
      <Separator />
      <DistributionHistory key={historyKey} storeId={storeId} />
    </div>
  );
}
