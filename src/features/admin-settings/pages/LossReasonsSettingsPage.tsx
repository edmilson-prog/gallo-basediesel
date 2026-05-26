import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type { ILossReason } from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { SectionHeader } from "../components/SectionHeader";
import { usePlatformSettings } from "../hooks/usePlatformSettings";

function makeReasonId(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  return `loss-${slug || Date.now().toString(36)}`;
}

export function LossReasonsSettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "store-matriz";
  const { settings, loading, saving, update } = usePlatformSettings(storeId);
  const [newLabel, setNewLabel] = useState("");

  const persist = async (next: ILossReason[], action: string) => {
    try {
      await update({ lossReasons: next }, action);
      toast.success("Configuração salva", { icon: <Icon icon="mdi:check" size={16} /> });
    } catch {
      toast.error("Não foi possível salvar.");
    }
  };

  const handleAdd = async () => {
    const trimmed = newLabel.trim();
    if (!trimmed) {
      toast.error("Informe o nome do motivo.");
      return;
    }
    if (!settings) return;
    const exists = settings.lossReasons.some(
      (r) => r.name.toLocaleLowerCase("pt-BR") === trimmed.toLocaleLowerCase("pt-BR"),
    );
    if (exists) {
      toast.error("Este motivo já existe.");
      return;
    }
    const next: ILossReason[] = [
      ...settings.lossReasons,
      { id: makeReasonId(trimmed), name: trimmed, active: true },
    ];
    setNewLabel("");
    await persist(next, "settings.loss_reasons.add");
  };

  const handleRemove = async (id: string) => {
    if (!settings) return;
    const next = settings.lossReasons.filter((r) => r.id !== id);
    await persist(next, "settings.loss_reasons.remove");
  };

  const handleToggleActive = async (id: string) => {
    if (!settings) return;
    const next = settings.lossReasons.map((r) => (r.id === id ? { ...r, active: !r.active } : r));
    await persist(next, "settings.loss_reasons.toggle");
  };

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Motivos de perda"
          description="Configure a taxonomia usada ao marcar um lead como perdido."
        />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Motivos de perda"
        description="Configure a taxonomia usada ao marcar um lead como perdido (PRD-017). Motivos inativos não aparecem no seletor, mas leads históricos preservam a referência."
      />

      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="new-loss-reason" className="text-sm font-medium">
              Adicionar novo motivo
            </label>
            <Input
              id="new-loss-reason"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAdd();
                }
              }}
              placeholder="Ex.: Cliente preferiu marca alternativa"
              disabled={saving}
            />
          </div>
          <Button onClick={handleAdd} disabled={saving || !newLabel.trim()}>
            <Icon icon="mdi:plus" size={16} />
            Adicionar
          </Button>
        </div>

        <ul className="divide-y divide-border">
          {settings.lossReasons.map((reason) => (
            <li key={reason.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <Icon
                  icon={reason.active ? "mdi:close-circle-outline" : "mdi:close-circle-off-outline"}
                  size={18}
                  className={reason.active ? "text-foreground" : "text-muted-foreground"}
                />
                <div>
                  <p
                    className={
                      reason.active
                        ? "text-sm font-medium"
                        : "text-sm font-medium text-muted-foreground line-through"
                    }
                  >
                    {reason.name}
                  </p>
                  {!reason.active && (
                    <Badge variant="outline" className="mt-1">
                      Inativo
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={reason.active}
                  onCheckedChange={() => handleToggleActive(reason.id)}
                  disabled={saving}
                  aria-label={`Ativar/desativar ${reason.name}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(reason.id)}
                  disabled={saving}
                  aria-label={`Remover ${reason.name}`}
                >
                  <Icon icon="mdi:trash-can-outline" size={16} />
                </Button>
              </div>
            </li>
          ))}
          {settings.lossReasons.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhum motivo cadastrado. Adicione o primeiro acima.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
