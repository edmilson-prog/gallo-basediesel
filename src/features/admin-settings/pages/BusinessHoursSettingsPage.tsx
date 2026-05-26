import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentStore } from "@/features/multistore";
import { useDistributionSettings } from "@/features/distribution/hooks/useDistributionSettings";
import { BusinessHoursSection } from "@/features/distribution/components/BusinessHoursSection";
import { SectionHeader } from "../components/SectionHeader";

export function BusinessHoursSettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "store-matriz";
  const { settings, loading, saving, update, error } = useDistributionSettings(storeId);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Horário comercial"
        description="Defina quando a loja está disponível para atendimento. Fora do horário comercial, a distribuição usa a política de fila configurada em Distribuição."
      />

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading || !settings ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <BusinessHoursSection settings={settings} saving={saving} onChange={update} />
      )}
    </div>
  );
}
