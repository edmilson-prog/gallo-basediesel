import { useCurrentStore } from "@/features/multistore";
import { IdleAlertsSettingsSection } from "@/features/idle-alerts";
import { SectionHeader } from "../components/SectionHeader";

export function IdleAlertsSettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Alertas de ociosidade"
        description="Cobra o atendente quando o cliente aguarda resposta, escalando por horas úteis da agenda de cada um."
      />
      <IdleAlertsSettingsSection storeId={storeId} />
    </div>
  );
}
