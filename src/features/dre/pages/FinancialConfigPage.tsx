import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ICashFlowSettings, IFinancialSettings } from "@/shared/types";
import { DEFAULT_CASHFLOW_SETTINGS } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { SectionHeader } from "@/features/admin-settings/components/SectionHeader";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { useCurrentStore } from "@/features/multistore";
import { formatBRL } from "@/shared/utils/format";
import { DRE_STRINGS as S } from "../i18n/pt-BR";

type Draft = IFinancialSettings;

function pickDraft(s: IFinancialSettings): Draft {
  return {
    taxOnSalesPct: s.taxOnSalesPct,
    taxOnProfitPct: s.taxOnProfitPct,
    fixedExpenses: { ...s.fixedExpenses },
  };
}

/**
 * Owner / Financeiro screen for the DRE assumptions (PRD-048 RF-017+).
 *
 * Edits `IPlatformSettings.financialSettings`. Each save triggers an audit-log
 * entry via `usePlatformSettings.update("settings.financial.update")`.
 */
export function FinancialConfigPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "store-matriz";
  const { settings, loading, saving, update } = usePlatformSettings(storeId);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [cashDraft, setCashDraft] = useState<ICashFlowSettings | null>(null);

  useEffect(() => {
    if (!settings) return;
    setDraft(pickDraft(settings.financialSettings));
    setCashDraft({ ...(settings.cashflowSettings ?? DEFAULT_CASHFLOW_SETTINGS) });
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings || !draft) return false;
    return JSON.stringify(pickDraft(settings.financialSettings)) !== JSON.stringify(draft);
  }, [settings, draft]);

  if (loading || !settings || !draft || !cashDraft) {
    return (
      <div className="space-y-6">
        <SectionHeader title={S.configTitle} description={S.configSubtitle} />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const handleSave = async () => {
    try {
      await update({ financialSettings: draft }, "settings.financial.update");
      void queryClient.invalidateQueries({ queryKey: ["dre"] });
      toast.success(S.configSaved, { icon: <Icon icon="mdi:check" size={16} /> });
    } catch {
      toast.error(S.configSaveError);
    }
  };

  const handleReset = () => setDraft(pickDraft(settings.financialSettings));

  const cashDirty =
    JSON.stringify(settings.cashflowSettings ?? DEFAULT_CASHFLOW_SETTINGS) !==
    JSON.stringify(cashDraft);

  const handleSaveCashflow = async () => {
    try {
      await update({ cashflowSettings: cashDraft }, "settings.financial.update");
      void queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      toast.success("Configuração de caixa salva.", {
        icon: <Icon icon="mdi:check" size={16} />,
      });
    } catch {
      toast.error("Não foi possível salvar a configuração de caixa.");
    }
  };

  const updateExpense = (field: keyof IFinancialSettings["fixedExpenses"], value: number) => {
    setDraft({
      ...draft,
      fixedExpenses: { ...draft.fixedExpenses, [field]: Math.max(0, value) },
    });
  };

  return (
    <div className="space-y-6">
      <SectionHeader title={S.configTitle} description={S.configSubtitle} />

      <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
        <Icon icon="mdi:information-outline" size={14} className="mr-1 inline align-text-bottom" />
        {S.configDemoBanner}
      </div>

      <Card className="space-y-6 p-5">
        <PercentRow
          label={S.configTaxOnSales}
          help={S.configTaxOnSalesHelp}
          value={draft.taxOnSalesPct}
          max={0.25}
          onChange={(v) => setDraft({ ...draft, taxOnSalesPct: v })}
        />
        <PercentRow
          label={S.configTaxOnProfit}
          help={S.configTaxOnProfitHelp}
          value={draft.taxOnProfitPct}
          max={0.3}
          onChange={(v) => setDraft({ ...draft, taxOnProfitPct: v })}
        />
      </Card>

      <Card className="space-y-5 p-5">
        <h2 className="text-base font-semibold text-foreground">{S.configFixedExpensesTitle}</h2>
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
          <Icon
            icon="mdi:information-outline"
            size={14}
            className="mr-1 inline align-text-bottom"
          />
          As despesas agora são lançadas individualmente em <strong>Gestão &rarr; Despesas</strong>,
          e a DRE passou a usar esses lançamentos reais por competência. Os valores fixos abaixo
          foram descontinuados e não influenciam mais o resultado — permanecem apenas como
          referência histórica.
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <ExpenseField
            label={S.configPayroll}
            value={draft.fixedExpenses.payroll}
            onChange={(v) => updateExpense("payroll", v)}
          />
          <ExpenseField
            label={S.configRentInfra}
            value={draft.fixedExpenses.rentInfra}
            onChange={(v) => updateExpense("rentInfra", v)}
          />
          <ExpenseField
            label={S.configOther}
            value={draft.fixedExpenses.other}
            onChange={(v) => updateExpense("other", v)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Total mensal estimado:{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {formatBRL(
              draft.fixedExpenses.payroll +
                draft.fixedExpenses.rentInfra +
                draft.fixedExpenses.other,
            )}
          </span>
        </p>
      </Card>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={handleReset} disabled={!dirty || saving}>
          {S.configDiscard}
        </Button>
        <Button type="button" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? "Salvando…" : S.configSave}
        </Button>
      </div>

      <Card className="space-y-5 p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">Fluxo de Caixa</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Saldo inicial e alerta de saldo mínimo usados pela tela de Fluxo de Caixa (PRD-055).
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ExpenseField
            label="Saldo inicial do caixa"
            value={cashDraft.openingBalance}
            onChange={(v) => setCashDraft({ ...cashDraft, openingBalance: Math.max(0, v) })}
          />
          <ExpenseField
            label="Alerta de saldo mínimo"
            value={cashDraft.minBalanceAlert}
            onChange={(v) => setCashDraft({ ...cashDraft, minBalanceAlert: Math.max(0, v) })}
          />
        </div>
        <div className="flex justify-end border-t border-border pt-4">
          <Button type="button" onClick={handleSaveCashflow} disabled={!cashDirty || saving}>
            {saving ? "Salvando…" : "Salvar caixa"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

interface IPercentRowProps {
  label: string;
  help: string;
  value: number;
  max: number;
  onChange: (next: number) => void;
}

function PercentRow({ label, help, value, max, onChange }: IPercentRowProps) {
  const pct = Math.round(value * 1000) / 10;
  const maxPct = Math.round(max * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{help}</p>
        </div>
        <div className="flex items-baseline gap-1.5">
          <Input
            type="number"
            min={0}
            max={maxPct}
            step={0.1}
            value={pct.toFixed(1)}
            onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) / 100)))}
            className="h-9 w-24 text-right tabular-nums"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </div>
      <Slider
        className="mt-3"
        value={[pct]}
        max={maxPct}
        step={0.1}
        onValueChange={(values) => onChange(Math.min(max, (values[0] ?? 0) / 100))}
      />
    </div>
  );
}

interface IExpenseFieldProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
}

function ExpenseField({ label, value, onChange }: IExpenseFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">R$</span>
        <Input
          type="number"
          min={0}
          step={100}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-9 flex-1 text-right tabular-nums"
        />
      </div>
    </div>
  );
}
