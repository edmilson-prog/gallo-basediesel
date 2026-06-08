import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  ICustomerAddress,
  IShippingConfig,
  IShippingRate,
  IShippingResult,
  ShippingDefaultAction,
  ShippingScope,
  ShippingStrategy,
} from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCurrentStore } from "@/features/multistore";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { Forbidden } from "@/features/rbac/components/Forbidden";
import { SectionHeader } from "@/features/admin-settings/components/SectionHeader";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { UnsavedChangesDialog } from "@/features/admin-settings/components/UnsavedChangesDialog";
import { useUnsavedChanges } from "@/features/admin-settings/hooks/useUnsavedChanges";
import { calculateShipping } from "../api/calculate";

const STRATEGY_OPTIONS: Array<{
  value: ShippingStrategy;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    value: "fixed_by_region",
    label: "Valor fixo por região (recomendado)",
    description:
      "Aplica o valor da primeira regra que casar com cidade, estado ou conjunto de estados do cliente.",
    icon: "mdi:map-marker-radius-outline",
  },
  {
    value: "to_negotiate_default",
    label: "Sempre a combinar",
    description:
      "Todas as cotações retornam 'a combinar'. Útil quando o frete é discutido caso a caso.",
    icon: "mdi:handshake-outline",
  },
  {
    value: "preliminary_by_weight",
    label: "Preliminar por peso",
    description:
      "Mesma busca por região, mas soma R$/kg quando a regra tiver sobretaxa configurada. Requer peso cadastrado no catálogo.",
    icon: "mdi:weight-kilogram",
  },
];

const SCOPE_LABEL: Record<ShippingScope, string> = {
  city: "Cidade",
  state: "Estado (UF)",
  states: "Múltiplos estados",
  nationwide: "Nacional",
};

const moneyFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

let RATE_SEQ = 0;
function nextRateId(): string {
  RATE_SEQ += 1;
  return `shipping-rate-${Date.now()}-${RATE_SEQ}`;
}

export function ShippingConfigPage() {
  const { currentStoreId } = useCurrentStore();
  const { currentUser } = useAuth();
  const role = useCurrentRole();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const canView = hasPermission(currentUser, "settings", "view");
  const canEdit = hasPermission(currentUser, "settings", "edit");
  const isVendedor = role === "Vendedor" || role === "VendedorExterno" || role === "SDR";

  const { settings, loading, saving, update } = usePlatformSettings(storeId);

  const [draft, setDraft] = useState<IShippingConfig | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<IShippingRate | null>(null);

  useEffect(() => {
    if (settings) setDraft(structuredClone(settings.shipping));
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings || !draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(settings.shipping);
  }, [settings, draft]);

  const unsaved = useUnsavedChanges(dirty && canEdit);

  if (!canView || isVendedor) {
    return (
      <Forbidden
        title="Acesso restrito"
        message="O painel de frete só está disponível para Owner e Gestor."
        actionLabel="Voltar para configurações"
        actionTo="/app/configuracoes"
      />
    );
  }

  if (loading || !settings || !draft) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Frete"
          description="Estratégia, regras por região e simulador do cálculo de frete usado por orçamentos, pedidos e pelo SDR."
        />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const activeRules = draft.rates.filter((r) => r.isActive);
  const hasActiveRules = activeRules.length > 0;
  const showRatesSection = draft.strategy !== "to_negotiate_default";

  const handleSave = async () => {
    if (!canEdit) return;
    const names = new Set<string>();
    for (const r of draft.rates) {
      const key = r.name.trim().toLowerCase();
      if (!key) {
        toast.error("Toda regra precisa ter um nome.");
        return;
      }
      if (names.has(key)) {
        toast.error(`Já existe regra com o nome "${r.name.trim()}".`);
        return;
      }
      names.add(key);
      if (r.baseValue < 0 || !Number.isFinite(r.baseValue)) {
        toast.error(`Valor inválido na regra "${r.name}".`);
        return;
      }
      if (r.scope === "city" && (!r.cities || r.cities.length === 0)) {
        toast.error(`A regra "${r.name}" precisa listar ao menos uma cidade.`);
        return;
      }
      if ((r.scope === "state" || r.scope === "states") && (!r.states || r.states.length === 0)) {
        toast.error(`A regra "${r.name}" precisa listar ao menos um estado.`);
        return;
      }
    }
    if (
      draft.defaultWhenNoMatch === "fixed_value" &&
      (draft.defaultFallbackValue == null || draft.defaultFallbackValue < 0)
    ) {
      toast.error("Defina um valor padrão válido para o fallback.");
      return;
    }
    try {
      await update({ shipping: draft }, "settings.shipping.update");
      toast.success("Configurações de frete salvas.");
    } catch {
      toast.error("Não foi possível salvar as configurações de frete.");
    }
  };

  const handleReset = () => {
    if (!settings) return;
    setDraft(structuredClone(settings.shipping));
  };

  const handleSetStrategy = (next: ShippingStrategy) => {
    setDraft({ ...draft, strategy: next });
  };

  const handleSetDefaultAction = (next: ShippingDefaultAction) => {
    setDraft({
      ...draft,
      defaultWhenNoMatch: next,
      defaultFallbackValue: next === "fixed_value" ? (draft.defaultFallbackValue ?? 0) : undefined,
    });
  };

  const handleToggleRate = (id: string, active: boolean) => {
    setDraft({
      ...draft,
      rates: draft.rates.map((r) => (r.id === id ? { ...r, isActive: active } : r)),
    });
  };

  const handleRemoveRate = (id: string) => {
    setDraft({ ...draft, rates: draft.rates.filter((r) => r.id !== id) });
  };

  const handleOpenAdd = () => {
    setEditingRate({
      id: nextRateId(),
      name: "",
      scope: "state",
      states: [],
      baseValue: 0,
      isActive: true,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (rate: IShippingRate) => {
    setEditingRate(structuredClone(rate));
    setModalOpen(true);
  };

  const handleSubmitRate = (rate: IShippingRate) => {
    const exists = draft.rates.some((r) => r.id === rate.id);
    const nextRates = exists
      ? draft.rates.map((r) => (r.id === rate.id ? rate : r))
      : [...draft.rates, rate];
    setDraft({ ...draft, rates: nextRates });
    setModalOpen(false);
    setEditingRate(null);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Frete"
        description="Estratégia, regras por região e simulador do cálculo de frete usado por orçamentos, pedidos e pelo SDR. PRD-033."
      />

      {!canEdit && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:eye-outline" className="size-4" />
            <span>
              Você está em modo de visualização. Edição requer permissão de Owner — o simulador
              continua disponível.
            </span>
          </div>
        </div>
      )}

      {!hasActiveRules && draft.strategy !== "to_negotiate_default" && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:alert-outline" className="size-4" />
            <span>
              Atenção: nenhuma regra ativa. Todas as cotações usarão o comportamento padrão (
              <strong>
                {draft.defaultWhenNoMatch === "to_negotiate"
                  ? "a combinar"
                  : `R$ ${(draft.defaultFallbackValue ?? 0).toFixed(2)}`}
              </strong>
              ).
            </span>
          </div>
        </div>
      )}

      <StrategySection
        strategy={draft.strategy}
        onChange={handleSetStrategy}
        defaultAction={draft.defaultWhenNoMatch}
        defaultValue={draft.defaultFallbackValue}
        onDefaultActionChange={handleSetDefaultAction}
        onDefaultValueChange={(v) => setDraft({ ...draft, defaultFallbackValue: v })}
        disabled={!canEdit}
      />

      {showRatesSection && (
        <RatesSection
          rates={draft.rates}
          onToggle={handleToggleRate}
          onRemove={handleRemoveRate}
          onEdit={handleOpenEdit}
          onAdd={handleOpenAdd}
          showWeight={draft.strategy === "preliminary_by_weight"}
          disabled={!canEdit}
        />
      )}

      <SimulatorSection config={draft} />

      <Phase2PlaceholderCard />

      {canEdit && (
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
          <Button variant="outline" onClick={handleReset} disabled={!dirty || saving}>
            Descartar
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      )}

      <RateModal
        open={modalOpen}
        initial={editingRate}
        showWeight={draft.strategy === "preliminary_by_weight"}
        onCancel={() => {
          setModalOpen(false);
          setEditingRate(null);
        }}
        onSubmit={handleSubmitRate}
      />

      <UnsavedChangesDialog
        open={unsaved.promptOpen}
        onConfirmDiscard={unsaved.confirmDiscard}
        onCancel={unsaved.cancel}
      />
    </div>
  );
}

interface IStrategySectionProps {
  strategy: ShippingStrategy;
  onChange: (next: ShippingStrategy) => void;
  defaultAction: ShippingDefaultAction;
  defaultValue?: number;
  onDefaultActionChange: (next: ShippingDefaultAction) => void;
  onDefaultValueChange: (next: number) => void;
  disabled?: boolean;
}

function StrategySection({
  strategy,
  onChange,
  defaultAction,
  defaultValue,
  onDefaultActionChange,
  onDefaultValueChange,
  disabled,
}: IStrategySectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon icon="mdi:strategy" className="size-5 text-primary" />
          Estratégia
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-3">
          {STRATEGY_OPTIONS.map((opt) => {
            const active = strategy === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => !disabled && onChange(opt.value)}
                disabled={disabled}
                className={`flex h-full flex-col items-start gap-2 rounded-md border p-3 text-left transition ${
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-accent/30"
                } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <Icon icon={opt.icon} className="size-4 text-primary" />
                  <span className="text-sm font-medium">{opt.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">{opt.description}</p>
                {active && (
                  <span className="mt-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                    Atual
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {strategy === "preliminary_by_weight" && (
          <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
            <Icon icon="mdi:information-outline" className="mr-1 inline size-3.5" />O cálculo por
            peso depende do campo <code className="font-mono">weightKg</code> em cada peça do
            catálogo. Itens sem peso são tratados como 0kg.
          </div>
        )}

        <div className="grid gap-3 border-t border-border pt-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm">Quando nenhuma regra casar</Label>
            <Select
              value={defaultAction}
              onValueChange={(v) => onDefaultActionChange(v as ShippingDefaultAction)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="to_negotiate">A combinar (recomendado)</SelectItem>
                <SelectItem value="fixed_value">Valor fixo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {defaultAction === "fixed_value" && (
            <div className="space-y-1.5">
              <Label className="text-sm">Valor fixo padrão (R$)</Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={defaultValue ?? 0}
                onChange={(e) => onDefaultValueChange(Math.max(0, Number(e.target.value) || 0))}
                disabled={disabled}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface IRatesSectionProps {
  rates: IShippingRate[];
  onToggle: (id: string, active: boolean) => void;
  onRemove: (id: string) => void;
  onEdit: (rate: IShippingRate) => void;
  onAdd: () => void;
  showWeight: boolean;
  disabled?: boolean;
}

function RatesSection({
  rates,
  onToggle,
  onRemove,
  onEdit,
  onAdd,
  showWeight,
  disabled,
}: IRatesSectionProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon icon="mdi:format-list-checks" className="size-5 text-primary" />
          Regras de frete
        </CardTitle>
        <Button size="sm" onClick={onAdd} disabled={disabled} className="gap-2">
          <Icon icon="mdi:plus" className="size-4" />
          Adicionar regra
        </Button>
      </CardHeader>
      <CardContent>
        {rates.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhuma regra cadastrada. Adicione ao menos uma regra ou volte à estratégia "Sempre a
            combinar".
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Escopo</TableHead>
                  <TableHead>Cobertura</TableHead>
                  <TableHead className="text-right">Valor base</TableHead>
                  {showWeight && <TableHead className="text-right">R$/kg</TableHead>}
                  <TableHead className="text-center">Ativa</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((rate) => (
                  <TableRow key={rate.id}>
                    <TableCell className="font-medium">{rate.name}</TableCell>
                    <TableCell>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {SCOPE_LABEL[rate.scope]}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {coverageLabel(rate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {moneyFmt.format(rate.baseValue)}
                    </TableCell>
                    {showWeight && (
                      <TableCell className="text-right tabular-nums">
                        {rate.weightSurcharge ? moneyFmt.format(rate.weightSurcharge) : "—"}
                      </TableCell>
                    )}
                    <TableCell className="text-center">
                      <Switch
                        checked={rate.isActive}
                        onCheckedChange={(v) => onToggle(rate.id, v)}
                        disabled={disabled}
                        aria-label={`Ativar/desativar regra ${rate.name}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onEdit(rate)}
                          disabled={disabled}
                          aria-label={`Editar ${rate.name}`}
                        >
                          <Icon icon="mdi:pencil-outline" className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onRemove(rate.id)}
                          disabled={disabled}
                          aria-label={`Remover ${rate.name}`}
                        >
                          <Icon icon="mdi:delete-outline" className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function coverageLabel(rate: IShippingRate): string {
  if (rate.scope === "city") return rate.cities?.join(", ") ?? "—";
  if (rate.scope === "state" || rate.scope === "states") return rate.states?.join(", ") ?? "—";
  return "Brasil";
}

interface IRateModalProps {
  open: boolean;
  initial: IShippingRate | null;
  showWeight: boolean;
  onCancel: () => void;
  onSubmit: (rate: IShippingRate) => void;
}

function RateModal({ open, initial, showWeight, onCancel, onSubmit }: IRateModalProps) {
  const [draft, setDraft] = useState<IShippingRate | null>(initial);
  const [citiesText, setCitiesText] = useState("");
  const [statesText, setStatesText] = useState("");

  useEffect(() => {
    setDraft(initial);
    setCitiesText(initial?.cities?.join(", ") ?? "");
    setStatesText(initial?.states?.join(", ") ?? "");
  }, [initial]);

  if (!draft) return null;

  const handleConfirm = () => {
    if (!draft.name.trim()) {
      toast.error("Informe um nome para a regra.");
      return;
    }
    const next: IShippingRate = { ...draft, name: draft.name.trim() };
    if (next.scope === "city") {
      next.cities = citiesText
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      next.states = undefined;
      if (next.cities.length === 0) {
        toast.error("Informe ao menos uma cidade.");
        return;
      }
    } else if (next.scope === "state" || next.scope === "states") {
      next.states = statesText
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length === 2);
      next.cities = undefined;
      if (next.states.length === 0) {
        toast.error("Informe ao menos uma UF (2 letras).");
        return;
      }
      if (next.scope === "state") next.states = next.states.slice(0, 1);
    } else {
      next.cities = undefined;
      next.states = undefined;
    }
    onSubmit(next);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar regra de frete</DialogTitle>
          <DialogDescription>
            Defina o escopo geográfico e o valor cobrado. A regra mais específica (cidade) ganha de
            uma mais ampla (estado/nacional).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome da regra</Label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Ex.: Frederico Westphalen / SC + PR / Bahia"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Escopo</Label>
            <Select
              value={draft.scope}
              onValueChange={(v) => setDraft({ ...draft, scope: v as ShippingScope })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="city">Cidade</SelectItem>
                <SelectItem value="state">Estado (UF única)</SelectItem>
                <SelectItem value="states">Múltiplos estados</SelectItem>
                <SelectItem value="nationwide">Nacional (qualquer endereço)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {draft.scope === "city" && (
            <div className="space-y-1.5">
              <Label>Cidades (separadas por vírgula)</Label>
              <Textarea
                value={citiesText}
                onChange={(e) => setCitiesText(e.target.value)}
                placeholder="Ex.: Frederico Westphalen, Iraí"
                rows={2}
              />
            </div>
          )}
          {(draft.scope === "state" || draft.scope === "states") && (
            <div className="space-y-1.5">
              <Label>{draft.scope === "state" ? "UF" : "UFs (separadas por vírgula)"}</Label>
              <Input
                value={statesText}
                onChange={(e) => setStatesText(e.target.value.toUpperCase())}
                placeholder={draft.scope === "state" ? "RS" : "SC, PR, SP"}
              />
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Valor base (R$)</Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={draft.baseValue}
                onChange={(e) =>
                  setDraft({ ...draft, baseValue: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </div>
            {showWeight && (
              <div className="space-y-1.5">
                <Label>Sobretaxa por kg (opcional)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={draft.weightSurcharge ?? 0}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      weightSurcharge: Math.max(0, Number(e.target.value) || 0) || undefined,
                    })
                  }
                />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">Regra ativa</p>
              <p className="text-xs text-muted-foreground">
                Desative para preservar o histórico sem aplicar nas próximas cotações.
              </p>
            </div>
            <Switch
              checked={draft.isActive}
              onCheckedChange={(v) => setDraft({ ...draft, isActive: v })}
              aria-label="Regra ativa"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>Salvar regra</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ISimulatorState {
  city: string;
  state: string;
  weightKg: string;
}

function SimulatorSection({ config }: { config: IShippingConfig }) {
  const [form, setForm] = useState<ISimulatorState>({ city: "", state: "", weightKg: "" });
  const [result, setResult] = useState<IShippingResult | null>(null);

  const handleSimulate = () => {
    const address: ICustomerAddress = {
      street: "",
      number: "",
      district: "",
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      zipCode: "",
    };
    const weight = form.weightKg ? Math.max(0, Number(form.weightKg) || 0) : undefined;
    setResult(calculateShipping({ address, config, totalWeightKg: weight }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon icon="mdi:calculator-variant-outline" className="size-5 text-primary" />
          Simulador
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Cidade</Label>
            <Input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="Ex.: Curitiba"
            />
          </div>
          <div className="space-y-1.5">
            <Label>UF</Label>
            <Input
              value={form.state}
              maxLength={2}
              onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
              placeholder="Ex.: PR"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Peso total (kg, opcional)</Label>
            <Input
              type="number"
              min={0}
              step={0.1}
              value={form.weightKg}
              onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
              placeholder="0"
            />
          </div>
        </div>
        <Button onClick={handleSimulate} className="gap-2">
          <Icon icon="mdi:play-outline" className="size-4" />
          Calcular
        </Button>

        {result && (
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <Icon
                icon={result.isToNegotiate ? "mdi:handshake-outline" : "mdi:truck-check-outline"}
                className={`mt-0.5 size-5 ${
                  result.isToNegotiate ? "text-amber-600" : "text-emerald-600"
                }`}
              />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {result.isToNegotiate
                    ? "Frete a combinar"
                    : `Valor estimado: ${moneyFmt.format(result.value ?? 0)}`}
                </p>
                {result.appliedRate && (
                  <p className="text-xs text-muted-foreground">
                    Regra aplicada: <strong>{result.appliedRate.name}</strong> (
                    {SCOPE_LABEL[result.appliedRate.scope]})
                  </p>
                )}
                {result.notes && (
                  <p className="mt-1 text-xs text-muted-foreground">{result.notes}</p>
                )}
                <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  reason: {result.reason}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Phase2PlaceholderCard() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center">
        <div className="rounded-full bg-primary/10 p-3 text-primary">
          <Icon icon="mdi:rocket-launch-outline" className="size-6" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Próxima fase — Integração com transportadoras</p>
          <p className="mt-1 text-xs text-muted-foreground">
            A integração com transportadoras (Correios, Mercúrio, JadLog) chega na Fase 2 e
            permitirá cálculo real por CEP origem/destino, dimensões, peso e múltiplas opções de
            envio (expresso vs normal). A interface de chamada permanece a mesma — apenas a fonte do
            cálculo muda.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
