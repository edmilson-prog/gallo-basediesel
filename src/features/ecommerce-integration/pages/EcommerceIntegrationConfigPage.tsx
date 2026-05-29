import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { IEcommerceIntegrationSettings } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { useCurrentStore } from "@/features/multistore";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { SectionHeader } from "@/features/admin-settings/components/SectionHeader";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { useSellersProvider } from "@/providers/data";
import { DEFAULT_ECOMMERCE_INTEGRATION_SETTINGS } from "../config/defaults";
import { ECOMMERCE_INTEGRATION_STRINGS as S } from "../i18n/pt-BR";

const ASSIGNMENT_MODES: Array<{
  value: IEcommerceIntegrationSettings["assignmentMode"];
  label: string;
  hint: string;
}> = [
  { value: "round_robin", label: S.modeRoundRobin, hint: S.modeRoundRobinHint },
  { value: "manager_distributes", label: S.modeManager, hint: S.modeManagerHint },
  { value: "specific_seller", label: S.modeSpecific, hint: S.modeSpecificHint },
];

const TEMPLATE_FIELDS: Array<{
  key: keyof IEcommerceIntegrationSettings["templates"];
  label: string;
}> = [
  { key: "whatsappConfirmation", label: S.tplWhatsapp },
  { key: "emailConfirmation", label: S.tplEmail },
  { key: "statusPaid", label: S.tplPaid },
  { key: "statusShipped", label: S.tplShipped },
  { key: "statusDelivered", label: S.tplDelivered },
  { key: "statusCanceled", label: S.tplCanceled },
];

/**
 * `/app/configuracoes/ecommerce-integracao` — Owner editor for the e-commerce
 * integration (PRD-067 RF-020/021). Notifications are placeholders on the MVP.
 */
export function EcommerceIntegrationConfigPage() {
  const role = useCurrentRole();
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "store-matriz";
  const { settings, loading, saving, update } = usePlatformSettings(storeId);
  const sellersProvider = useSellersProvider();

  const { data: sellers = [] } = useQuery({
    queryKey: ["ecommerce-integration", "sellers", storeId] as const,
    queryFn: () => sellersProvider.list({ storeId, active: true }),
  });

  const [draft, setDraft] = useState<IEcommerceIntegrationSettings>(
    DEFAULT_ECOMMERCE_INTEGRATION_SETTINGS,
  );

  useEffect(() => {
    if (settings) setDraft(settings.ecommerceIntegration ?? DEFAULT_ECOMMERCE_INTEGRATION_SETTINGS);
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings) return false;
    return JSON.stringify(draft) !== JSON.stringify(settings.ecommerceIntegration);
  }, [settings, draft]);

  if (role !== "Owner") {
    return (
      <EmptyState
        icon="mdi:shield-lock-outline"
        title="Apenas Owner"
        description="A configuração da integração com o e-commerce é restrita ao Owner."
        actionLabel="Voltar"
        actionTo="/app/configuracoes"
      />
    );
  }

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        <SectionHeader title={S.pageTitle} description="Carregando..." />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const handleSave = async () => {
    try {
      await update({ ecommerceIntegration: draft }, "ecommerce_config_update");
      toast.success(S.saved);
    } catch {
      toast.error(S.saveFailed);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader title={S.pageTitle} description={S.pageDescription} />

      <Card className="flex items-start gap-3 border-primary/30 bg-primary/5 p-4">
        <Icon icon="mdi:bell-outline" size={18} className="mt-0.5 text-primary" />
        <p className="text-xs text-muted-foreground">{S.phase2Banner}</p>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="text-base font-semibold text-foreground">{S.assignmentTitle}</h2>
        <RadioGroup
          value={draft.assignmentMode}
          onValueChange={(v) =>
            setDraft((p) => ({
              ...p,
              assignmentMode: v as IEcommerceIntegrationSettings["assignmentMode"],
            }))
          }
          className="space-y-2"
        >
          {ASSIGNMENT_MODES.map((mode) => (
            <label
              key={mode.value}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:border-primary/50"
            >
              <RadioGroupItem value={mode.value} className="mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">{mode.label}</p>
                <p className="text-xs text-muted-foreground">{mode.hint}</p>
              </div>
            </label>
          ))}
        </RadioGroup>

        {draft.assignmentMode === "specific_seller" && (
          <div className="space-y-2">
            <Label>{S.specificSellerLabel}</Label>
            <Select
              value={draft.specificSellerId ?? ""}
              onValueChange={(v) => setDraft((p) => ({ ...p, specificSellerId: v }))}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder={S.specificSellerPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="text-base font-semibold text-foreground">{S.behaviorTitle}</h2>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">{S.createConversationLabel}</p>
            <p className="text-xs text-muted-foreground">{S.createConversationHint}</p>
          </div>
          <Switch
            checked={draft.createConversationAuto}
            onCheckedChange={(v) => setDraft((p) => ({ ...p, createConversationAuto: v }))}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">{S.notifyCustomerLabel}</p>
            <p className="text-xs text-muted-foreground">{S.notifyCustomerHint}</p>
          </div>
          <Switch
            checked={draft.notifyCustomer}
            onCheckedChange={(v) => setDraft((p) => ({ ...p, notifyCustomer: v }))}
          />
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">{S.templatesTitle}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{S.templatesHint}</p>
        </div>
        <div className="space-y-3">
          {TEMPLATE_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`tpl-${field.key}`}>{field.label}</Label>
              <Textarea
                id={`tpl-${field.key}`}
                rows={
                  field.key === "whatsappConfirmation" || field.key === "emailConfirmation" ? 4 : 2
                }
                value={draft.templates[field.key]}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    templates: { ...p.templates, [field.key]: e.target.value },
                  }))
                }
              />
            </div>
          ))}
        </div>
      </Card>

      <div className="sticky bottom-4 z-10 flex flex-wrap justify-end gap-2 rounded-md border border-border bg-card/95 p-3 backdrop-blur">
        <Button
          variant="outline"
          onClick={() => setDraft(settings.ecommerceIntegration)}
          disabled={!dirty || saving}
        >
          Descartar
        </Button>
        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}
