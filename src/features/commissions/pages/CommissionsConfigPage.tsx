import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  CommissionGoalBonusType,
  CommissionSplitPolicy,
  ICommissionRuleConfig,
  ICommissionSettings,
  ID,
  ISeller,
} from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionHeader } from "@/features/admin-settings/components/SectionHeader";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { useSellersProvider } from "@/providers/data";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/useAuth";
import { COMMISSIONS_STRINGS as S } from "../i18n/pt-BR";

type Draft = ICommissionSettings;

function pickDraft(s: ICommissionSettings): Draft {
  return {
    active: s.active,
    defaultRate: s.defaultRate,
    splitPolicy: s.splitPolicy,
    goalBonusEnabled: s.goalBonusEnabled,
    rules: s.rules.map((r) => ({ ...r, goalBonus: r.goalBonus ? { ...r.goalBonus } : undefined })),
    closedPeriods: s.closedPeriods ?? [],
  };
}

function makeRuleId(): ID {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Owner-only configuration page for the commission engine (PRD-047).
 *
 * Edits `IPlatformSettings.commissionSettings`. Every save writes an audit log
 * entry via `usePlatformSettings.update("settings.commissions.update")`.
 */
export function CommissionsConfigPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "store-matriz";
  const { settings, loading, saving, update } = usePlatformSettings(storeId);
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const sellersProvider = useSellersProvider();

  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (!settings) return;
    setDraft(pickDraft(settings.commissionSettings));
  }, [settings]);

  const sellersQuery = useQuery({
    queryKey: ["commissions", "config", "sellers", storeId],
    queryFn: () => sellersProvider.list({ storeId, active: true }),
    staleTime: 60_000,
  });

  const sellersById = useMemo<Map<ID, ISeller>>(() => {
    const map = new Map<ID, ISeller>();
    for (const s of sellersQuery.data ?? []) map.set(s.id, s);
    return map;
  }, [sellersQuery.data]);

  const dirty = useMemo(() => {
    if (!settings || !draft) return false;
    return JSON.stringify(pickDraft(settings.commissionSettings)) !== JSON.stringify(draft);
  }, [settings, draft]);

  if (loading || !settings || !draft) {
    return (
      <div className="space-y-6">
        <SectionHeader title={S.configTitle} description={S.configSubtitle} />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const handleSave = async () => {
    try {
      await update({ commissionSettings: draft }, "settings.commissions.update");
      void queryClient.invalidateQueries({ queryKey: ["commissions"] });
      toast.success("Configurações salvas.", {
        icon: <Icon icon="mdi:check" size={16} />,
      });
    } catch {
      toast.error("Não foi possível salvar.");
    }
  };

  const handleReset = () => setDraft(pickDraft(settings.commissionSettings));

  const handleAddRule = () => {
    if (!currentUser) return;
    const now = new Date().toISOString();
    const newRule: ICommissionRuleConfig = {
      id: makeRuleId(),
      storeId,
      name: "Nova regra",
      baseRate: settings.commissionSettings.defaultRate,
      validFrom: now,
      isActive: true,
      createdBy: currentUser.id,
      createdAt: now,
    };
    setDraft({ ...draft, rules: [...draft.rules, newRule] });
  };

  const handleRemoveRule = (id: ID) => {
    setDraft({ ...draft, rules: draft.rules.filter((r) => r.id !== id) });
  };

  const handleUpdateRule = (id: ID, patch: Partial<ICommissionRuleConfig>) => {
    setDraft({
      ...draft,
      rules: draft.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  };

  return (
    <div className="space-y-6">
      <SectionHeader title={S.configTitle} description={S.configSubtitle} />

      <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
        <Icon icon="mdi:information-outline" size={14} className="mr-1 inline align-text-bottom" />
        {S.configDemoBanner}
      </div>

      <Card className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-semibold text-foreground">{S.configActiveLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">{S.configActiveDescription}</p>
        </div>
        <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
      </Card>

      <Card className="p-5">
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-foreground">{S.configDefaultRate}</label>
            <div className="mt-2 flex items-center gap-2">
              <Input
                type="number"
                step={0.1}
                min={0}
                max={100}
                value={(draft.defaultRate * 100).toFixed(2)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    defaultRate: Math.max(0, Number(e.target.value) / 100),
                  })
                }
                className="h-9 w-28 text-right tabular-nums"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">{S.configSplitPolicy}</label>
            <Select
              value={draft.splitPolicy}
              onValueChange={(v) => setDraft({ ...draft, splitPolicy: v as CommissionSplitPolicy })}
            >
              <SelectTrigger className="mt-2 h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="coverage_full">{S.configSplitFull}</SelectItem>
                <SelectItem value="split_50_50">{S.configSplitHalf}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-foreground">
              {S.configGoalBonusEnabled}
            </label>
            <p className="mt-1 text-xs text-muted-foreground">{S.configGoalBonusDescription}</p>
            <div className="mt-2">
              <Switch
                checked={draft.goalBonusEnabled}
                onCheckedChange={(v) => setDraft({ ...draft, goalBonusEnabled: v })}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{S.configRulesTitle}</h2>
          <Button size="sm" variant="outline" onClick={handleAddRule}>
            <Icon icon="mdi:plus" size={14} />
            <span className="ml-1.5">{S.configRuleAddCta}</span>
          </Button>
        </div>
        {draft.rules.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{S.configRulesEmpty}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {draft.rules.map((r) => (
              <RuleRow
                key={r.id}
                rule={r}
                sellersById={sellersById}
                onChange={(patch) => handleUpdateRule(r.id, patch)}
                onRemove={() => handleRemoveRule(r.id)}
              />
            ))}
          </div>
        )}
      </Card>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={handleReset} disabled={!dirty || saving}>
          Descartar
        </Button>
        <Button type="button" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? "Salvando…" : S.configSaveButton}
        </Button>
      </div>
    </div>
  );
}

interface IRuleRowProps {
  rule: ICommissionRuleConfig;
  sellersById: Map<ID, ISeller>;
  onChange: (patch: Partial<ICommissionRuleConfig>) => void;
  onRemove: () => void;
}

function RuleRow({ rule, sellersById, onChange, onRemove }: IRuleRowProps) {
  const sellerOptions = useMemo(() => Array.from(sellersById.values()), [sellersById]);
  return (
    <div className="rounded-md border border-border bg-muted/20 p-4">
      <div className="grid gap-3 md:grid-cols-[1.5fr_1.2fr_0.8fr_auto]">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Nome</label>
          <Input
            value={rule.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="mt-1 h-9"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Vendedor</label>
          <Select
            value={rule.sellerId ?? "all"}
            onValueChange={(v) => onChange({ sellerId: v === "all" ? undefined : (v as ID) })}
          >
            <SelectTrigger className="mt-1 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Padrão da loja</SelectItem>
              {sellerOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Taxa base</label>
          <div className="mt-1 flex items-center gap-1">
            <Input
              type="number"
              step={0.1}
              min={0}
              value={(rule.baseRate * 100).toFixed(2)}
              onChange={(e) => onChange({ baseRate: Math.max(0, Number(e.target.value) / 100) })}
              className="h-9 w-24 text-right tabular-nums"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col items-center">
            <label className="text-xs font-medium text-muted-foreground">Ativa</label>
            <Switch checked={rule.isActive} onCheckedChange={(v) => onChange({ isActive: v })} />
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            aria-label="Remover regra"
            className="text-destructive"
          >
            <Icon icon="mdi:trash-can-outline" size={16} />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 border-t border-border/50 pt-3 md:grid-cols-[1fr_1fr_1fr_1fr]">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Tipo de meta</label>
          <Input
            placeholder="ex: revenue"
            value={rule.goalBonus?.goalType ?? ""}
            onChange={(e) =>
              onChange({
                goalBonus: e.target.value
                  ? {
                      goalType: e.target.value,
                      threshold: rule.goalBonus?.threshold ?? 100,
                      bonusType: rule.goalBonus?.bonusType ?? "fixed",
                      bonusValue: rule.goalBonus?.bonusValue ?? 0,
                    }
                  : undefined,
              })
            }
            className="mt-1 h-9"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Threshold (%)</label>
          <Input
            type="number"
            step={1}
            min={0}
            max={300}
            value={rule.goalBonus?.threshold ?? 100}
            onChange={(e) =>
              rule.goalBonus &&
              onChange({
                goalBonus: { ...rule.goalBonus, threshold: Number(e.target.value) },
              })
            }
            disabled={!rule.goalBonus}
            className="mt-1 h-9 tabular-nums"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Tipo de bônus</label>
          <Select
            disabled={!rule.goalBonus}
            value={rule.goalBonus?.bonusType ?? "fixed"}
            onValueChange={(v) =>
              rule.goalBonus &&
              onChange({
                goalBonus: { ...rule.goalBonus, bonusType: v as CommissionGoalBonusType },
              })
            }
          >
            <SelectTrigger className="mt-1 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">R$ fixo</SelectItem>
              <SelectItem value="percentage_points">+ pontos percentuais</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Valor do bônus</label>
          <Input
            type="number"
            step={rule.goalBonus?.bonusType === "fixed" ? 50 : 0.1}
            value={rule.goalBonus?.bonusValue ?? 0}
            disabled={!rule.goalBonus}
            onChange={(e) =>
              rule.goalBonus &&
              onChange({
                goalBonus: { ...rule.goalBonus, bonusValue: Number(e.target.value) },
              })
            }
            className="mt-1 h-9 tabular-nums"
          />
        </div>
      </div>
    </div>
  );
}
