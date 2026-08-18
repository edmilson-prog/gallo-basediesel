import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/Icon";
import { DashboardLayout } from "@/features/shell/layouts";
import { useAuth } from "@/features/auth/useAuth";
import { useAccessibleStores, useCurrentStore } from "@/features/multistore";
import { recordAuditLogSync, useGoalsProvider, useSellersProvider } from "@/providers/data";
import type { GoalLevel, GoalMetric, GoalPeriodType, ID, ISeller, IStore } from "@/shared/types";
import { formatBRL } from "@/shared/utils/format";
import { GOALS_STRINGS as S } from "../i18n/pt-BR";
import {
  GOAL_METRIC_DESCRIPTION,
  GOAL_METRIC_FORMAT,
  GOAL_METRIC_LABEL,
  PRIMARY_GOAL_METRICS,
  SECONDARY_GOAL_METRICS,
} from "../utils/labels";
import { defaultPeriodRange, validateGoalDraft } from "../utils/validation";
import { suggestTarget } from "../engine/suggestion";
import { useGoalsWithProgress } from "../hooks/useGoalsWithProgress";

const PERIOD_OPTIONS: { value: GoalPeriodType; label: string }[] = [
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "daily", label: "Diário" },
];

function generateName(metric: GoalMetric, periodType: GoalPeriodType, start: string): string {
  const date = new Date(start);
  const month = date.toLocaleDateString("pt-BR", { month: "long" });
  const capitalized = month.charAt(0).toUpperCase() + month.slice(1);
  const periodLabel =
    periodType === "monthly" ? "mensal" : periodType === "quarterly" ? "trimestral" : "diária";
  return `${GOAL_METRIC_LABEL[metric]} ${periodLabel} — ${capitalized} ${date.getFullYear()}`;
}

export function NewGoalPage() {
  const navigate = useNavigate();
  const { userRole, currentUser } = useAuth();
  const { currentStore } = useCurrentStore();
  const accessibleStores = useAccessibleStores();
  const isOwner = userRole === "Owner";
  const storeLocked = userRole === "Gestor";
  const defaultStoreId = currentStore?.id ?? "00000000-0000-0000-0000-000000000001";

  const goalsProvider = useGoalsProvider();
  const sellersProvider = useSellersProvider();
  const allGoals = useGoalsWithProgress({});

  const [metric, setMetric] = useState<GoalMetric>("revenue");
  const [periodType, setPeriodType] = useState<GoalPeriodType>("monthly");
  const initial = useMemo(() => defaultPeriodRange("monthly"), []);
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [name, setName] = useState(generateName("revenue", "monthly", initial.start));
  const [nameTouched, setNameTouched] = useState(false);

  const [level, setLevel] = useState<GoalLevel>("individual");
  const [sellerId, setSellerId] = useState<ID | undefined>(undefined);
  const [storeId, setStoreId] = useState<ID>(defaultStoreId);

  const [targetValue, setTargetValue] = useState(0);
  const [rewardDescription, setRewardDescription] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [sellers, setSellers] = useState<ISeller[]>([]);
  useEffect(() => {
    let cancelled = false;
    void sellersProvider.list({ storeId, active: true }).then((list) => {
      if (!cancelled) setSellers(list);
    });
    return () => {
      cancelled = true;
    };
  }, [sellersProvider, storeId]);

  useEffect(() => {
    if (level !== "individual") {
      setSellerId(undefined);
      return;
    }
    if (sellers.length > 0 && !sellerId) {
      const candidate = sellers.find((s) => s.id !== "seller-joao-gallo") ?? sellers[0];
      setSellerId(candidate.id);
    }
  }, [level, sellers, sellerId]);

  useEffect(() => {
    if (!nameTouched) {
      setName(generateName(metric, periodType, startDate));
    }
  }, [metric, periodType, startDate, nameTouched]);

  const suggestion = useMemo(() => {
    if (allGoals.isLoading) return undefined;
    return suggestTarget({
      metric,
      level,
      storeId,
      sellerId,
      allGoals: allGoals.items.map((i) => i.goal),
    });
  }, [allGoals.isLoading, allGoals.items, metric, level, storeId, sellerId]);

  const sellersById = useMemo(() => {
    const map = new Map<ID, string>();
    for (const s of sellers) map.set(s.id, s.fullName);
    return map;
  }, [sellers]);

  const handlePeriodChange = (next: GoalPeriodType) => {
    setPeriodType(next);
    const range = defaultPeriodRange(next);
    setStartDate(range.start);
    setEndDate(range.end);
  };

  const handleSubmit = async (status: "ativa" | "arquivada") => {
    const draft = {
      metric,
      level,
      periodType,
      startDate,
      endDate,
      storeId,
      sellerId,
      targetValue,
      name,
      rewardDescription: rewardDescription.trim() || undefined,
    };
    const validationErrors = validateGoalDraft(draft, {
      existingGoals: allGoals.items.map((i) => i.goal),
      sellersById,
    });
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;

    setIsSubmitting(true);
    try {
      const id = `goal-${Date.now()}`;
      const nowISO = new Date().toISOString();
      const created = await goalsProvider.upsert({
        id,
        storeId,
        level,
        targetId: level === "individual" ? (sellerId as ID) : storeId,
        sellerId: level === "individual" ? sellerId : undefined,
        period: {
          type: periodType,
          start: new Date(startDate).toISOString(),
          end: new Date(endDate).toISOString(),
        },
        metric,
        targetValue,
        currentValue: 0,
        progressPercent: 0,
        division: "parts",
        name,
        status,
        rewardDescription: draft.rewardDescription,
        createdBy: currentUser?.sellerId ?? currentUser?.id ?? "system",
        createdAt: nowISO,
        updatedAt: nowISO,
      });
      recordAuditLogSync({
        actorId: currentUser?.sellerId ?? currentUser?.id ?? "system",
        action: "goal_create",
        resource: "goal",
        resourceId: created.id,
        storeId,
      });
      toast.success(S.createSuccess);
      void navigate({ to: "/app/gestao/metas/$id", params: { id: created.id } });
    } catch {
      toast.error(S.saveError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const ALL_METRICS = useMemo<GoalMetric[]>(
    () => [...PRIMARY_GOAL_METRICS, ...SECONDARY_GOAL_METRICS],
    [],
  );

  const formatHint = GOAL_METRIC_FORMAT[metric];
  const targetInputSuffix =
    formatHint === "currency"
      ? S.formTargetCurrencyUnit
      : formatHint === "percent"
        ? S.formTargetPercentUnit
        : S.formTargetCountUnit;

  return (
    <DashboardLayout>
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <Icon icon="mdi:plus-circle-outline" size={26} className="text-primary" />
          {S.createCta}
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure tipo, escopo, valor e recompensa. As datas são preenchidas automaticamente.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit("ativa");
        }}
        className="flex flex-col gap-6"
      >
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            1. {S.formConfigTitle}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="metric">{S.formConfigTypeLabel}</Label>
              <Select value={metric} onValueChange={(v) => setMetric(v as GoalMetric)}>
                <SelectTrigger id="metric">
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
              <p className="text-[11px] text-muted-foreground">{GOAL_METRIC_DESCRIPTION[metric]}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="period">{S.formConfigPeriodLabel}</Label>
              <Select
                value={periodType}
                onValueChange={(v) => handlePeriodChange(v as GoalPeriodType)}
              >
                <SelectTrigger id="period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="start">{S.formConfigStartLabel}</Label>
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="end">{S.formConfigEndLabel}</Label>
              <Input
                id="end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="md:col-span-2 flex flex-col gap-2">
              <Label htmlFor="name">{S.formConfigNameLabel}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameTouched(true);
                }}
              />
              <p className="text-[11px] text-muted-foreground">{S.formConfigNameHelp}</p>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            2. {S.formScopeTitle}
          </h2>
          <RadioGroup
            value={level}
            onValueChange={(v) => setLevel(v as GoalLevel)}
            className="grid gap-2 md:grid-cols-3"
          >
            <Label
              htmlFor="scope-individual"
              className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 hover:border-primary"
            >
              <RadioGroupItem value="individual" id="scope-individual" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{S.formScopeIndividual}</span>
                <span className="text-xs text-muted-foreground">Meta de um vendedor.</span>
              </div>
            </Label>
            <Label
              htmlFor="scope-store"
              className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 hover:border-primary"
            >
              <RadioGroupItem value="store" id="scope-store" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{S.formScopeStore}</span>
                <span className="text-xs text-muted-foreground">Soma de toda a loja.</span>
              </div>
            </Label>
            {isOwner && (
              <Label
                htmlFor="scope-team"
                className="flex cursor-not-allowed items-center gap-3 rounded-md border border-border bg-muted/30 p-3 opacity-60"
                title="Equipes dormentes no MVP"
              >
                <RadioGroupItem value="team" id="scope-team" disabled />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Equipe (dormente)</span>
                  <span className="text-xs text-muted-foreground">Disponível na Fase 2.</span>
                </div>
              </Label>
            )}
          </RadioGroup>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {!storeLocked && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="store">{S.formScopeStoreLabel}</Label>
                <Select value={storeId} onValueChange={(v) => setStoreId(v as ID)}>
                  <SelectTrigger id="store">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accessibleStores.map((store: IStore) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {storeLocked && (
              <div className="flex flex-col gap-2">
                <Label>{S.formScopeStoreLabel}</Label>
                <p className="text-xs text-muted-foreground">{S.formScopeStoreLocked}</p>
              </div>
            )}
            {level === "individual" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="seller">{S.formScopeSellerLabel}</Label>
                <Select value={sellerId ?? ""} onValueChange={(v) => setSellerId(v as ID)}>
                  <SelectTrigger id="seller">
                    <SelectValue placeholder="Selecione" />
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
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            3. {S.formTargetTitle}
          </h2>
          <div className="flex flex-col gap-2">
            <Label htmlFor="target">
              {S.formTargetLabel} ({targetInputSuffix})
            </Label>
            <Input
              id="target"
              type="number"
              min={0}
              step={formatHint === "currency" ? 100 : 1}
              value={targetValue || ""}
              onChange={(e) => setTargetValue(Number(e.target.value))}
            />
          </div>

          {suggestion && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
              <p className="mb-2 text-xs font-semibold text-foreground">
                {S.formTargetSuggestionTitle}
              </p>
              {!suggestion.hasPrevious ? (
                <p className="text-xs text-muted-foreground">{S.formTargetSuggestionEmpty}</p>
              ) : (
                <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                  <p>
                    {S.formTargetPreviousLabel}:{" "}
                    <span className="font-medium text-foreground">
                      {formatHint === "currency"
                        ? formatBRL(suggestion.previousValue)
                        : suggestion.previousValue.toLocaleString("pt-BR")}
                    </span>{" "}
                    · {S.formTargetAchievedLabel}{" "}
                    <span className="font-medium text-foreground">
                      {Math.round(suggestion.previousAchievement * 100)}%
                    </span>
                  </p>
                  {targetValue > 0 && suggestion.previousValue > 0 && (
                    <p>
                      {targetValue > suggestion.previousValue
                        ? S.formTargetCompareHigher(
                            Math.round(
                              ((targetValue - suggestion.previousValue) /
                                suggestion.previousValue) *
                                100,
                            ),
                          )
                        : targetValue < suggestion.previousValue
                          ? S.formTargetCompareLower(
                              Math.round(
                                ((suggestion.previousValue - targetValue) /
                                  suggestion.previousValue) *
                                  100,
                              ),
                            )
                          : S.formTargetCompareSame}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start gap-1"
                    onClick={() => setTargetValue(suggestion.suggestedTarget)}
                  >
                    <Icon icon="mdi:auto-fix" size={14} />
                    {S.acceptSuggestionCta} (
                    {formatHint === "currency"
                      ? formatBRL(suggestion.suggestedTarget)
                      : suggestion.suggestedTarget.toLocaleString("pt-BR")}
                    )
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            4. {S.formRewardTitle}
          </h2>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reward">{S.formRewardLabel}</Label>
            <Textarea
              id="reward"
              rows={3}
              placeholder={S.formRewardPlaceholder}
              value={rewardDescription}
              onChange={(e) => setRewardDescription(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">{S.formRewardHint}</p>
          </div>
        </Card>

        {errors.length > 0 && (
          <Card className="border-severity-critical/40 bg-severity-critical/5 p-4">
            <ul className="flex flex-col gap-1 text-sm text-severity-critical">
              {errors.map((err) => (
                <li key={err} className="flex items-start gap-1">
                  <Icon icon="mdi:alert-circle-outline" size={16} className="mt-0.5 shrink-0" />
                  {err}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void navigate({ to: "/app/gestao/metas" })}
          >
            {S.formCancelCta}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => void handleSubmit("arquivada")}
          >
            {S.formSaveDraftCta}
          </Button>
          <Button type="submit" disabled={isSubmitting} className="gap-1">
            <Icon icon="mdi:check" size={16} />
            {S.formCreateActiveCta}
          </Button>
        </div>
      </form>
    </DashboardLayout>
  );
}
