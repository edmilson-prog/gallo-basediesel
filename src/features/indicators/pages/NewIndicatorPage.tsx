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
import { recordAuditLogSync, useIndicatorsProvider, useSellersProvider } from "@/providers/data";
import type {
  ID,
  IndicatorMetric,
  IndicatorPeriodType,
  IndicatorScopeLevel,
  IProductIndicator,
  ISeller,
  IStore,
  PartCategory,
  ProductSelector,
} from "@/shared/types";
import { formatBRL } from "@/shared/utils/format";
import { indicatorsPtBR as S } from "../i18n/pt-BR";
import { ProductSelectorField } from "../components/ProductSelectorField";
import { computePeriodDates } from "../utils/period";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const METRIC_OPTIONS: IndicatorMetric[] = ["faturamento", "quantidade", "margem", "pedidos"];

const PERIOD_OPTIONS: { value: IndicatorPeriodType; label: string }[] = [
  { value: "diario", label: S.period.diario },
  { value: "semanal", label: S.period.semanal },
  { value: "mensal", label: S.period.mensal },
  { value: "trimestral", label: S.period.trimestral },
  { value: "anual", label: S.period.anual },
];

const SCOPE_OPTIONS: { value: IndicatorScopeLevel; label: string; description: string }[] = [
  { value: "store", label: S.scope.store, description: S.scopeDescription.store },
  { value: "individual", label: S.scope.individual, description: S.scopeDescription.individual },
  { value: "global", label: S.scope.global, description: S.scopeDescription.global },
];

/** Minimal label map for category chips — kept in sync with ProductSelectorField. */
const CATEGORY_LABELS: Record<PartCategory, string> = {
  filtro: S.productSelector.partCategories.filtro,
  freio: S.productSelector.partCategories.freio,
  correia: S.productSelector.partCategories.correia,
  motor: S.productSelector.partCategories.motor,
  embreagem: S.productSelector.partCategories.embreagem,
  eletrica: S.productSelector.partCategories.eletrica,
  transmissao: S.productSelector.partCategories.transmissao,
  suspensao: S.productSelector.partCategories.suspensao,
  arrefecimento: S.productSelector.partCategories.arrefecimento,
  lubrificante: S.productSelector.partCategories.lubrificante,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Describe the product selector in one short string for name generation. */
function selectorLabel(selector: ProductSelector): string {
  switch (selector.kind) {
    case "category": {
      if (selector.categories.length === 0) return S.form.nameFallbackProduct;
      return selector.categories.map((c) => CATEGORY_LABELS[c]).join(", ");
    }
    case "sku": {
      const n = selector.partIds.length;
      if (n === 0) return S.form.nameFallbackProduct;
      return `${n} produto${n > 1 ? "s" : ""}`;
    }
    case "group": {
      return selector.label.trim() || S.form.nameFallbackGroup;
    }
  }
}

function generateIndicatorName(
  metric: IndicatorMetric,
  selector: ProductSelector,
  periodType: IndicatorPeriodType,
  start: string,
): string {
  const metricLabel = S.metric[metric];
  const recorteLabel = selectorLabel(selector);
  const date = new Date(`${start}T12:00:00`); // noon to avoid DST edge cases
  const month = date.toLocaleDateString("pt-BR", { month: "long" });
  const capitalized = month.charAt(0).toUpperCase() + month.slice(1);
  const yearStr = String(date.getFullYear());
  if (periodType === "anual") return `${metricLabel} — ${recorteLabel} — ${yearStr}`;
  return `${metricLabel} — ${recorteLabel} — ${capitalized} ${yearStr}`;
}

/** Map metric to display format. */
function metricFormat(metric: IndicatorMetric): "currency" | "number" {
  return metric === "faturamento" || metric === "margem" ? "currency" : "number";
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateIndicatorDraft(draft: {
  selector: ProductSelector;
  metric: IndicatorMetric;
  scopeLevel: IndicatorScopeLevel;
  periodType: IndicatorPeriodType;
  startDate: string;
  endDate: string;
  sellerId?: ID;
  targetValue: number;
  name: string;
}): string[] {
  const errors: string[] = [];

  // Selector
  switch (draft.selector.kind) {
    case "category":
      if (draft.selector.categories.length === 0) errors.push(S.form.validationSelectorEmpty);
      break;
    case "sku":
      if (draft.selector.partIds.length === 0) errors.push(S.form.validationSelectorEmpty);
      break;
    case "group": {
      const hasLabel = draft.selector.label.trim().length > 0;
      const hasItems =
        (draft.selector.categories ?? []).length > 0 || (draft.selector.partIds ?? []).length > 0;
      if (!hasLabel || !hasItems) errors.push(S.form.validationSelectorGroupEmpty);
      break;
    }
  }

  // Dates
  if (!draft.startDate || !draft.endDate) {
    errors.push(S.form.validationPeriodRequired);
  } else if (new Date(draft.endDate) <= new Date(draft.startDate)) {
    errors.push(S.form.validationEndBeforeStart);
  }

  // Scope
  if (draft.scopeLevel === "individual" && !draft.sellerId) {
    errors.push(S.form.validationSellerRequired);
  }

  // Target
  if (!Number.isFinite(draft.targetValue) || draft.targetValue <= 0) {
    errors.push(S.form.validationTargetPositive);
  }

  // Name
  if (!draft.name.trim()) {
    errors.push(S.form.validationNameRequired);
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewIndicatorPage() {
  const navigate = useNavigate();
  const { userRole, currentUser } = useAuth();
  const { currentStore } = useCurrentStore();
  const accessibleStores = useAccessibleStores();
  const storeLocked = userRole === "Gestor";
  const defaultStoreId = currentStore?.id ?? "00000000-0000-0000-0000-000000000001";

  const indicatorsProvider = useIndicatorsProvider();
  const sellersProvider = useSellersProvider();

  // -- Selector
  const [selector, setSelector] = useState<ProductSelector>({
    kind: "category",
    categories: [],
  });

  // -- Metric
  const [metric, setMetric] = useState<IndicatorMetric>("faturamento");

  // -- Scope + period
  const [scopeLevel, setScopeLevel] = useState<IndicatorScopeLevel>("store");
  const [sellerId, setSellerId] = useState<ID | undefined>(undefined);
  const [storeId, setStoreId] = useState<ID>(defaultStoreId);
  const [periodType, setPeriodType] = useState<IndicatorPeriodType>("mensal");
  const initial = useMemo(() => computePeriodDates("mensal"), []);
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);

  // -- Target + reward
  const [targetValue, setTargetValue] = useState(0);
  const [rewardDescription, setRewardDescription] = useState("");

  // -- Name (auto-generated until touched)
  const [name, setName] = useState(() =>
    generateIndicatorName(
      "faturamento",
      { kind: "category", categories: [] },
      "mensal",
      initial.start,
    ),
  );
  const [nameTouched, setNameTouched] = useState(false);

  // -- UI state
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // -- Sellers list
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

  // Auto-pick first seller when switching to individual scope
  useEffect(() => {
    if (scopeLevel !== "individual") {
      setSellerId(undefined);
      return;
    }
    if (sellers.length > 0 && !sellerId) {
      const candidate = sellers.find((s) => s.id !== "seller-joao-gallo") ?? sellers[0];
      setSellerId(candidate.id);
    }
  }, [scopeLevel, sellers, sellerId]);

  // Auto-update period dates when period type changes
  const handlePeriodChange = (next: IndicatorPeriodType) => {
    setPeriodType(next);
    const range = computePeriodDates(next);
    setStartDate(range.start);
    setEndDate(range.end);
  };

  // Auto-regenerate name unless user has customised it
  useEffect(() => {
    if (!nameTouched) {
      setName(generateIndicatorName(metric, selector, periodType, startDate));
    }
  }, [metric, selector, periodType, startDate, nameTouched]);

  // -- Submit
  const handleSubmit = async (status: IProductIndicator["status"]) => {
    const draft = {
      selector,
      metric,
      scopeLevel,
      periodType,
      startDate,
      endDate,
      storeId,
      sellerId,
      targetValue,
      name,
    };
    const validationErrors = validateIndicatorDraft(draft);
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;

    setIsSubmitting(true);
    try {
      const id = `indicator-${Date.now()}`;
      const nowISO = new Date().toISOString();
      const indicator: IProductIndicator = {
        id,
        storeId,
        name: name.trim(),
        selector,
        metric,
        scopeLevel,
        sellerId: scopeLevel === "individual" ? sellerId : undefined,
        period: {
          type: periodType,
          start: new Date(startDate).toISOString(),
          end: new Date(endDate).toISOString(),
        },
        targetValue,
        status,
        division: "parts",
        rewardDescription: rewardDescription.trim() || undefined,
        createdBy: currentUser?.sellerId ?? currentUser?.id ?? "system",
        createdAt: nowISO,
        updatedAt: nowISO,
      };

      const created = await indicatorsProvider.upsert(indicator);

      recordAuditLogSync({
        actorId: currentUser?.sellerId ?? currentUser?.id ?? "system",
        action: "indicator_create",
        resource: "indicator",
        resourceId: created.id,
        storeId,
      });

      toast.success(S.form.createSuccess);
      void navigate({
        to: "/app/gestao/indicadores/$id",
        params: { id: created.id },
      });
    } catch {
      toast.error(S.form.saveError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const fmt = metricFormat(metric);
  const targetUnit = fmt === "currency" ? S.form.targetUnitBRL : S.form.targetUnitCount;

  return (
    <DashboardLayout>
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <Icon icon="mdi:plus-circle-outline" size={26} className="text-primary" />
          {S.form.pageTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{S.form.pageSubtitle}</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit("ativo");
        }}
        className="flex flex-col gap-6"
      >
        {/* ---------------------------------------------------------------- */}
        {/* 1. Recorte de produto                                             */}
        {/* ---------------------------------------------------------------- */}
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.form.sectionSelector}
          </h2>
          <ProductSelectorField value={selector} onChange={setSelector} />
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* 2. Métrica                                                        */}
        {/* ---------------------------------------------------------------- */}
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.form.sectionMetric}
          </h2>
          <RadioGroup
            value={metric}
            onValueChange={(v) => setMetric(v as IndicatorMetric)}
            className="grid gap-2 md:grid-cols-2"
          >
            {METRIC_OPTIONS.map((m) => (
              <Label
                key={m}
                htmlFor={`metric-${m}`}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:border-primary"
              >
                <RadioGroupItem value={m} id={`metric-${m}`} className="mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{S.metric[m]}</span>
                  <span className="text-xs text-muted-foreground">{S.metricDescription[m]}</span>
                </div>
              </Label>
            ))}
          </RadioGroup>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* 3. Escopo e período                                               */}
        {/* ---------------------------------------------------------------- */}
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.form.sectionScopePeriod}
          </h2>

          {/* Scope radio */}
          <RadioGroup
            value={scopeLevel}
            onValueChange={(v) => setScopeLevel(v as IndicatorScopeLevel)}
            className="grid gap-2 md:grid-cols-3"
          >
            {SCOPE_OPTIONS.map((opt) => (
              <Label
                key={opt.value}
                htmlFor={`scope-${opt.value}`}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:border-primary"
              >
                <RadioGroupItem value={opt.value} id={`scope-${opt.value}`} className="mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-xs text-muted-foreground">{opt.description}</span>
                </div>
              </Label>
            ))}
          </RadioGroup>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Store selector (Owner only; Gestors see their fixed store) */}
            {!storeLocked ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="store">{S.form.storeLabel}</Label>
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
            ) : (
              <div className="flex flex-col gap-2">
                <Label>{S.form.storeLabel}</Label>
                <p className="text-xs text-muted-foreground">{currentStore?.name ?? storeId}</p>
              </div>
            )}

            {/* Seller dropdown (individual scope only) */}
            {scopeLevel === "individual" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="seller">{S.form.sellerLabel}</Label>
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

            {/* Period type */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="period">{S.form.periodTypeLabel}</Label>
              <Select
                value={periodType}
                onValueChange={(v) => handlePeriodChange(v as IndicatorPeriodType)}
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

            {/* Start date */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="start">{S.form.startLabel}</Label>
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            {/* End date */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="end">{S.form.endLabel}</Label>
              <Input
                id="end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* 4. Valor-alvo                                                     */}
        {/* ---------------------------------------------------------------- */}
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.form.sectionTarget}
          </h2>
          <div className="flex flex-col gap-2">
            <Label htmlFor="target">
              {S.form.targetLabel} ({targetUnit})
            </Label>
            <Input
              id="target"
              type="number"
              min={0}
              step={fmt === "currency" ? 100 : 1}
              value={targetValue || ""}
              onChange={(e) => setTargetValue(Number(e.target.value))}
              placeholder={fmt === "currency" ? "Ex.: 15000" : "Ex.: 50"}
            />
            {fmt === "currency" && targetValue > 0 && (
              <p className="text-xs text-muted-foreground">{formatBRL(targetValue)}</p>
            )}
          </div>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* 5. Recompensa                                                     */}
        {/* ---------------------------------------------------------------- */}
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.form.sectionReward}
          </h2>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reward">{S.form.rewardLabel}</Label>
            <Textarea
              id="reward"
              rows={3}
              placeholder={S.form.rewardPlaceholder}
              value={rewardDescription}
              onChange={(e) => setRewardDescription(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">{S.form.rewardHint}</p>
          </div>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Name (auto-generated, editable)                                  */}
        {/* ---------------------------------------------------------------- */}
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.form.sectionName}
          </h2>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">{S.form.nameLabel}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameTouched(true);
              }}
            />
            <p className="text-[11px] text-muted-foreground">{S.form.nameHelp}</p>
          </div>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Errors                                                            */}
        {/* ---------------------------------------------------------------- */}
        {errors.length > 0 && (
          <Card className="border-red-500/40 bg-red-500/5 p-4">
            <ul className="flex flex-col gap-1 text-sm text-red-700 dark:text-red-300">
              {errors.map((err) => (
                <li key={err} className="flex items-start gap-1">
                  <Icon icon="mdi:alert-circle-outline" size={16} className="mt-0.5 shrink-0" />
                  {err}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Actions                                                           */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void navigate({ to: "/app/gestao/indicadores" })}
          >
            {S.form.cancelCta}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => void handleSubmit("arquivado")}
          >
            {S.form.saveDraftCta}
          </Button>
          <Button type="submit" disabled={isSubmitting} className="gap-1">
            <Icon icon="mdi:check" size={16} />
            {S.form.createActiveCta}
          </Button>
        </div>
      </form>
    </DashboardLayout>
  );
}
