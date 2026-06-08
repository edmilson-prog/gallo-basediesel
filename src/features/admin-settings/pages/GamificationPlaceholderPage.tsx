import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import type { IPlatformSettings } from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { useSettingsProvider } from "@/providers/data";
import { PlaceholderSection } from "../components/PlaceholderSection";

export function GamificationPlaceholderPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const provider = useSettingsProvider();
  const [settings, setSettings] = useState<IPlatformSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    provider.get(storeId).then((s) => {
      if (!cancelled) setSettings(s);
    });
    return () => {
      cancelled = true;
    };
  }, [provider, storeId]);

  return (
    <PlaceholderSection
      title="Gamificação"
      description="Configure regras de pontuação, badges e ranking dos vendedores."
      icon="mdi:trophy-outline"
      prdCodes="042 + 043"
      whatComes={[
        "Pontuação configurável por venda fechada, cliente recuperado e positivação",
        "Catálogo de badges e conquistas",
        "Critérios de ranking semanal/mensal",
        "Multiplicadores em campanhas temporárias",
        "Configurar visibilidade pública vs. interna do ranking",
      ]}
      statusNote="Defaults atuais estão em vigor — mostrados abaixo apenas para referência."
    >
      <div className="rounded-md border border-border bg-card p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Regras vigentes (somente leitura)
        </p>
        {!settings ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <dl className="grid gap-3 sm:grid-cols-3">
            <PointStat
              icon="mdi:cart-check"
              label="Por pedido fechado"
              value={settings.gamificationRules.pointsPerOrder}
            />
            <PointStat
              icon="mdi:account-reactivate-outline"
              label="Por cliente recuperado"
              value={settings.gamificationRules.pointsPerRecovery}
            />
            <PointStat
              icon="mdi:account-plus-outline"
              label="Por positivação"
              value={settings.gamificationRules.pointsPerPositivation}
            />
          </dl>
        )}
      </div>
    </PlaceholderSection>
  );
}

function PointStat({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon icon={icon} size={14} />
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {value}
        <span className="ml-1 text-xs font-normal text-muted-foreground">pts</span>
      </p>
    </div>
  );
}
