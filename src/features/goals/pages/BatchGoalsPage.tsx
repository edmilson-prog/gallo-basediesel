import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/features/shell/layouts";
import { useAuth } from "@/features/auth/useAuth";
import { useAccessibleStores, useCurrentStore } from "@/features/multistore";
import { recordAuditLogSync, useGoalsProvider } from "@/providers/data";
import type { GoalMetric, ID } from "@/shared/types";
import { formatBRL } from "@/shared/utils/format";
import { GOALS_STRINGS as S } from "../i18n/pt-BR";
import { GOAL_METRIC_LABEL, PRIMARY_GOAL_METRICS, SECONDARY_GOAL_METRICS } from "../utils/labels";
import { MONTH_LABELS } from "../utils/batchGoals";
import { useBatchGoals } from "../hooks/useBatchGoals";
import { BatchGoalsTable } from "../components/BatchGoalsTable";

const ALL_METRICS: GoalMetric[] = [...PRIMARY_GOAL_METRICS, ...SECONDARY_GOAL_METRICS];

function parseBRL(input: string): number {
  const digits = String(input).replace(/[^\d]/g, "");
  return digits === "" ? 0 : Number(digits) / 100;
}

export function BatchGoalsPage() {
  const navigate = useNavigate();
  const { userRole, currentUser } = useAuth();
  const { currentStore } = useCurrentStore();
  const accessibleStores = useAccessibleStores();
  const goalsProvider = useGoalsProvider();

  const isOwner = userRole === "Owner";
  const defaultStoreId = currentStore?.id ?? "00000000-0000-0000-0000-000000000001";

  const [storeId, setStoreId] = useState<ID>(defaultStoreId);
  const [metric, setMetric] = useState<GoalMetric>("revenue");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [reward, setReward] = useState("");
  const [scope, setScope] = useState<"month" | "year">("month");
  const [baseValue, setBaseValue] = useState("R$ 150.000,00");
  const [monthIdx, setMonthIdx] = useState<number>(new Date().getMonth());
  const [submitting, setSubmitting] = useState(false);

  const ctl = useBatchGoals({ storeId, metric, year });

  const filledMonthsCount = useMemo(
    () => MONTH_LABELS.filter((_, i) => ctl.monthHasValue(i)).length,
    [ctl],
  );

  const targetMonths = () =>
    scope === "year" ? Array.from({ length: 12 }, (_, i) => i) : [monthIdx];

  const handleSubmit = async (status: "ativa" | "arquivada") => {
    const goals = ctl.buildGoalsToCreate({
      status,
      rewardDescription: reward.trim() || undefined,
      createdBy: currentUser?.sellerId ?? currentUser?.id ?? "system",
    });
    if (goals.length === 0) {
      toast.error(S.batchEmptyState);
      return;
    }
    setSubmitting(true);
    let created = 0;
    let failed = 0;
    for (const goal of goals) {
      try {
        await goalsProvider.upsert(goal);
        recordAuditLogSync({
          actorId: currentUser?.sellerId ?? currentUser?.id ?? "system",
          action: "goal_create",
          resource: "goal",
          resourceId: goal.id,
          storeId,
        });
        created += 1;
      } catch {
        failed += 1;
      }
    }
    setSubmitting(false);
    if (failed > 0) toast.warning(S.batchCreatePartial(created, failed));
    else toast.success(S.batchCreateSuccess(created, ctl.skippedCount));
    void navigate({ to: "/app/gestao/metas" });
  };

  const yearOptions = [new Date().getFullYear(), new Date().getFullYear() + 1];

  return (
    <DashboardLayout>
      <div className="mb-2 text-xs text-muted-foreground">Gestão / Metas / Meta em lote</div>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
        <Icon icon="mdi:target" size={26} className="text-primary" />
        {S.batchTitle}
      </h1>
      <p className="mb-5 text-sm text-muted-foreground">{S.batchSubtitle}</p>

      <Card className="mb-4 p-5">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {S.batchSharedParams}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label>{S.batchStore}</Label>
            <Select value={storeId} onValueChange={(v) => setStoreId(v)} disabled={!isOwner}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(isOwner
                  ? accessibleStores
                  : accessibleStores.filter((s) => s.id === storeId)
                ).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{S.batchMetric}</Label>
            <Select value={metric} onValueChange={(v) => setMetric(v as GoalMetric)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_METRICS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {GOAL_METRIC_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{S.batchYear}</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{S.batchReward}</Label>
            <Input
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              placeholder={S.batchRewardPlaceholder}
            />
          </div>
        </div>
      </Card>

      <Card className="mb-4 p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {S.batchMonth}{" "}
          <span className="text-primary">
            {MONTH_LABELS[monthIdx] ?? ""}/{year}
          </span>
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {MONTH_LABELS.map((m, i) => {
            const filled = ctl.monthHasValue(i);
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMonthIdx(i)}
                className={cn(
                  "relative w-[72px] rounded-md border px-0 py-2 text-xs font-semibold transition-colors",
                  i === monthIdx
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                {m}
                <span
                  className={cn(
                    "absolute right-1.5 top-1.5 size-1.5 rounded-full",
                    filled ? "bg-primary" : "bg-muted",
                  )}
                />
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{S.batchMonthHint(filledMonthsCount)}</p>

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-dashed border-border pt-4">
          <div className="flex flex-col gap-1.5">
            <Label>{S.batchScopeLabel}</Label>
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              <button
                type="button"
                onClick={() => setScope("month")}
                className={cn(
                  "px-3.5 py-2 text-xs font-semibold",
                  scope === "month"
                    ? "bg-primary/10 text-foreground"
                    : "bg-background text-muted-foreground",
                )}
              >
                {S.batchScopeMonth}
              </button>
              <button
                type="button"
                onClick={() => setScope("year")}
                className={cn(
                  "px-3.5 py-2 text-xs font-semibold",
                  scope === "year"
                    ? "bg-primary/10 text-foreground"
                    : "bg-background text-muted-foreground",
                )}
              >
                {S.batchScopeYear}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{S.batchBaseValue}</Label>
            <Input
              className="w-40 text-right tabular-nums"
              value={baseValue}
              onChange={(e) => setBaseValue(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => ctl.applyValue(parseBRL(baseValue), targetMonths())}
          >
            {S.batchApplyBase}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-sky-500"
            onClick={() => ctl.applySuggestion(targetMonths())}
          >
            <Icon icon="mdi:auto-fix" size={15} />
            {S.batchSuggest}
          </Button>
        </div>

        <div className="mt-4">
          <BatchGoalsTable key={monthIdx} ctl={ctl} monthIdx={monthIdx} />
        </div>
      </Card>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-t from-background to-transparent pt-3">
        <p className="text-sm text-muted-foreground">
          {S.batchSummary(ctl.createCount, ctl.skippedCount, formatBRL(ctl.annualGrandTotal))}
        </p>
        <div className="flex gap-2.5">
          <Button
            variant="outline"
            size="sm"
            disabled={submitting}
            onClick={() => void handleSubmit("arquivada")}
          >
            {S.batchSaveDraft}
          </Button>
          <Button
            size="sm"
            disabled={submitting || ctl.createCount === 0}
            onClick={() => void handleSubmit("ativa")}
          >
            {S.batchCreate(ctl.createCount)}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
