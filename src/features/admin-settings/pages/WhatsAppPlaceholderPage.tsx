import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { IPlatformSettings } from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { useSettingsProvider } from "@/providers/data";
import { PlaceholderSection } from "../components/PlaceholderSection";

export function WhatsAppPlaceholderPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "store-matriz";
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
      title="WhatsApp"
      description="Conecte contas oficiais de WhatsApp (Cloud API) e Evolution para enviar e receber mensagens diretamente da Central de Atendimento."
      icon="mdi:whatsapp"
      prdCodes="100-102"
      whatComes={[
        "Conectar conta oficial Cloud API com QR code/OTP",
        "Conectar instância Evolution para campanhas",
        "Atribuir cada conta a uma loja ou divisão (Parts/Service/Industrial)",
        "Mapear webhooks de entrada para a fila de distribuição",
        "Monitorar saúde e quota das contas em tempo real",
      ]}
      statusNote="Mensagens hoje vivem só no mock; nenhuma chamada de rede externa é feita."
    >
      <div className="rounded-md border border-border bg-card p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Contas seedadas (mock)
        </p>
        {!settings ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <ul className="space-y-2">
            {settings.whatsappAccounts.map((acc) => (
              <li
                key={acc.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <Icon icon="mdi:whatsapp" size={18} className="text-emerald-600" />
                  <p className="text-sm font-medium">{acc.label}</p>
                </div>
                <Badge variant="outline">Mock</Badge>
              </li>
            ))}
            {settings.whatsappAccounts.length === 0 && (
              <li className="text-xs text-muted-foreground">Nenhuma conta seedada.</li>
            )}
          </ul>
        )}
      </div>
    </PlaceholderSection>
  );
}
