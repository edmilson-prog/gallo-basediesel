import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { VehicleCadastroMode } from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { SectionHeader } from "../components/SectionHeader";
import { usePlatformSettings } from "../hooks/usePlatformSettings";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";

interface IModeOption {
  value: VehicleCadastroMode;
  label: string;
  description: string;
  icon: string;
}

const MODE_OPTIONS: IModeOption[] = [
  {
    value: "auto_aprovado",
    label: "Automático",
    description:
      "Vendedor cadastra o veículo direto na ficha do cliente. O veículo já entra aprovado e disponível para orçamento.",
    icon: "mdi:lightning-bolt-outline",
  },
  {
    value: "aprovacao_obrigatoria",
    label: "Aprovação obrigatória",
    description:
      "Vendedor cadastra como pendente. O gestor revisa antes do veículo ficar disponível na frota oficial do cliente.",
    icon: "mdi:check-decagram-outline",
  },
  {
    value: "manual_apenas_gestor",
    label: "Apenas gestor",
    description:
      "O botão de cadastro de veículo fica escondido para vendedores. Somente Owner e Gestor podem cadastrar.",
    icon: "mdi:account-tie-outline",
  },
];

export function VehicleCadastroModeSettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const { settings, loading, saving, update } = usePlatformSettings(storeId);
  const [draft, setDraft] = useState<VehicleCadastroMode>("aprovacao_obrigatoria");

  useEffect(() => {
    if (settings) setDraft(settings.vehicleCadastroMode);
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings) return false;
    return draft !== settings.vehicleCadastroMode;
  }, [settings, draft]);

  const unsaved = useUnsavedChanges(dirty);

  const handleSave = async () => {
    if (!settings) return;
    try {
      await update({ vehicleCadastroMode: draft }, "settings.vehicle_cadastro_mode.update");
      toast.success("Configuração salva", { icon: <Icon icon="mdi:check" size={16} /> });
    } catch {
      toast.error("Não foi possível salvar.");
    }
  };

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Cadastro de veículos"
          description="Defina como vendedores cadastram veículos na frota do cliente."
        />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Cadastro de veículos"
        description="Defina como vendedores cadastram veículos na frota do cliente (PRD-016). A escolha afeta o botão '+ Veículo' na ficha."
      />

      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        <RadioGroup
          value={draft}
          onValueChange={(v) => setDraft(v as VehicleCadastroMode)}
          className="gap-3"
        >
          {MODE_OPTIONS.map((opt) => {
            const checked = draft === opt.value;
            return (
              <Label
                key={opt.value}
                htmlFor={`mode-${opt.value}`}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors",
                  checked
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background hover:border-primary/40",
                )}
              >
                <RadioGroupItem id={`mode-${opt.value}`} value={opt.value} className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Icon
                      icon={opt.icon}
                      size={18}
                      className={checked ? "text-primary" : "text-muted-foreground"}
                    />
                    <span className="text-sm font-semibold">{opt.label}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{opt.description}</p>
                </div>
              </Label>
            );
          })}
        </RadioGroup>

        <p className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Icon
            icon="mdi:information-outline"
            size={14}
            className="mr-1 inline align-text-bottom"
          />
          Esta configuração vale por loja. Vendedores podem ter override individual em
          <span className="font-medium"> Usuários </span>
          (disponível na Fase 2).
        </p>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button
            variant="outline"
            onClick={() => settings && setDraft(settings.vehicleCadastroMode)}
            disabled={!dirty || saving}
          >
            Descartar
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      </div>

      <UnsavedChangesDialog
        open={unsaved.promptOpen}
        onConfirmDiscard={unsaved.confirmDiscard}
        onCancel={unsaved.cancel}
      />
    </div>
  );
}
