import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ISdrQuoteTemplates,
  ISdrShippingPlaceholderSettings,
  SdrOtherStatesAction,
} from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { SectionHeader } from "@/features/admin-settings/components/SectionHeader";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { UnsavedChangesDialog } from "@/features/admin-settings/components/UnsavedChangesDialog";
import { useUnsavedChanges } from "@/features/admin-settings/hooks/useUnsavedChanges";
import { DEFAULT_SDR_QUOTE_TEMPLATES } from "../templates/defaults";
import { useSdrQuoteMetrics } from "../hooks/useSdrQuoteMetrics";

const TEMPLATE_LABELS: Record<keyof ISdrQuoteTemplates, string> = {
  generation: "Geração — orçamento enviado",
  accept: "Aceite — pergunta pagamento/entrega",
  reject: "Recusa — oferece alternativas",
  escalate: "Escalação — passa para vendedor",
};

const TEMPLATE_DESCRIPTIONS: Record<keyof ISdrQuoteTemplates, string> = {
  generation:
    "Mensagem rica enviada ao cliente quando o SDR gera o orçamento. Variáveis: peca_nome, peca_codigo, peca_tipo, quantidade, valor_unitario, subtotal, frete_formatado, total, validade, cliente_nome.",
  accept:
    "Resposta quando o cliente aceita o orçamento. Pede método de pagamento e prazo. Variável: cliente_nome.",
  reject: "Resposta quando o cliente recusa. Oferece alternativas. Variável: cliente_nome.",
  escalate: "Resposta quando o cliente pede vendedor ou desconto. Variável: cliente_nome.",
};

const TEMPLATE_KEYS: Array<keyof ISdrQuoteTemplates> = [
  "generation",
  "accept",
  "reject",
  "escalate",
];

function formatBrl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function SdrQuoteSettingsPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "store-matriz";
  const { settings, loading, saving, update } = usePlatformSettings(storeId);
  const { data: metrics } = useSdrQuoteMetrics({ storeId });

  const [validityDays, setValidityDays] = useState(7);
  const [autoDiscountPct, setAutoDiscountPct] = useState(0);
  const [shipping, setShipping] = useState<ISdrShippingPlaceholderSettings | null>(null);
  const [templates, setTemplates] = useState<ISdrQuoteTemplates | null>(null);

  useEffect(() => {
    if (!settings) return;
    setValidityDays(settings.sdrQuoteValidityDays);
    setAutoDiscountPct(settings.sdrAutoDiscountPct);
    setShipping(settings.sdrShippingPlaceholder);
    setTemplates(settings.sdrQuoteTemplates);
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings || !shipping || !templates) return false;
    if (validityDays !== settings.sdrQuoteValidityDays) return true;
    if (autoDiscountPct !== settings.sdrAutoDiscountPct) return true;
    if (JSON.stringify(shipping) !== JSON.stringify(settings.sdrShippingPlaceholder)) return true;
    if (JSON.stringify(templates) !== JSON.stringify(settings.sdrQuoteTemplates)) return true;
    return false;
  }, [settings, validityDays, autoDiscountPct, shipping, templates]);

  const unsaved = useUnsavedChanges(dirty);

  const handleSave = async () => {
    if (!settings || !shipping || !templates) return;
    if (validityDays < 1 || validityDays > 60) {
      toast.error("A validade precisa ficar entre 1 e 60 dias.");
      return;
    }
    if (autoDiscountPct < 0 || autoDiscountPct > 0.1) {
      toast.error("O desconto automático precisa ficar entre 0 e 10%.");
      return;
    }
    try {
      await update(
        {
          sdrQuoteValidityDays: validityDays,
          sdrAutoDiscountPct: autoDiscountPct,
          sdrShippingPlaceholder: shipping,
          sdrQuoteTemplates: templates,
        },
        "settings.sdr-quote.update",
      );
      toast.success("Configurações salvas.");
    } catch {
      toast.error("Não foi possível salvar.");
    }
  };

  const handleReset = () => {
    if (!settings) return;
    setValidityDays(settings.sdrQuoteValidityDays);
    setAutoDiscountPct(settings.sdrAutoDiscountPct);
    setShipping(settings.sdrShippingPlaceholder);
    setTemplates(settings.sdrQuoteTemplates);
  };

  const handleResetTemplate = (key: keyof ISdrQuoteTemplates) => {
    if (!templates) return;
    setTemplates({ ...templates, [key]: DEFAULT_SDR_QUOTE_TEMPLATES[key] });
    toast.info("Template restaurado para o padrão.");
  };

  if (loading || !settings || !shipping || !templates) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Orçamento do SDR"
          description="Regras de desconto, validade, frete placeholder e templates da mensagem enviada quando o SDR gera um orçamento automático."
        />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Orçamento do SDR"
        description="Regras de desconto, validade, frete placeholder e templates da mensagem enviada quando o SDR gera um orçamento automático. Refletem em todos os orçamentos com origin='sdr'."
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <MetricCard
          icon="mdi:file-document-multiple-outline"
          label="Orçamentos SDR"
          value={metrics ? String(metrics.totalQuotes) : "—"}
        />
        <MetricCard
          icon="mdi:check-circle-outline"
          label="Aceite"
          value={metrics ? formatPct(metrics.acceptedRate) : "—"}
        />
        <MetricCard
          icon="mdi:close-circle-outline"
          label="Recusa"
          value={metrics ? formatPct(metrics.rejectedRate) : "—"}
        />
        <MetricCard
          icon="mdi:currency-usd"
          label="Valor movido"
          value={metrics ? formatBrl(metrics.movedRevenue) : "—"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon icon="mdi:cash-multiple" className="size-5 text-primary" />
            Regras gerais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm">Validade do orçamento (dias)</Label>
              <span className="font-mono text-sm tabular-nums">{validityDays} dias</span>
            </div>
            <Slider
              value={[validityDays]}
              min={1}
              max={30}
              step={1}
              onValueChange={(v) => setValidityDays(v[0] ?? validityDays)}
              aria-label="Validade do orçamento em dias"
            />
            <p className="text-xs text-muted-foreground">
              Atual em produção: <strong>{settings.sdrQuoteValidityDays} dias</strong>. Default
              recomendado: 7 dias.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm">Desconto automático SDR</Label>
              <span className="font-mono text-sm tabular-nums">
                {(autoDiscountPct * 100).toFixed(1)}%
              </span>
            </div>
            <Slider
              value={[Math.round(autoDiscountPct * 1000)]}
              min={0}
              max={100}
              step={5}
              onValueChange={(v) => setAutoDiscountPct((v[0] ?? 0) / 1000)}
              aria-label="Desconto automático do SDR em percentual"
            />
            <p className="text-xs text-muted-foreground">
              0% (padrão) significa que o SDR nunca dá desconto sozinho. Valores acima de 5%
              raramente são recomendados — toda negociação maior deve passar por humano.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon icon="mdi:truck-fast-outline" className="size-5 text-primary" />
            Frete placeholder
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldNumber
              label={`Mesma cidade (${shipping.homeCity})`}
              value={shipping.sameCityValue}
              onChange={(v) => setShipping({ ...shipping, sameCityValue: v })}
              suffix="R$"
            />
            <FieldNumber
              label={`Mesmo estado (${shipping.homeState})`}
              value={shipping.sameStateValue}
              onChange={(v) => setShipping({ ...shipping, sameStateValue: v })}
              suffix="R$"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Cidade da loja</Label>
              <Input
                value={shipping.homeCity}
                onChange={(e) => setShipping({ ...shipping, homeCity: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">UF da loja</Label>
              <Input
                value={shipping.homeState}
                maxLength={2}
                onChange={(e) =>
                  setShipping({ ...shipping, homeState: e.target.value.toUpperCase() })
                }
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Outros estados</Label>
              <Select
                value={shipping.otherStatesAction}
                onValueChange={(v) =>
                  setShipping({ ...shipping, otherStatesAction: v as SdrOtherStatesAction })
                }
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
            {shipping.otherStatesAction === "fixed_value" && (
              <FieldNumber
                label="Valor fixo para outros estados"
                value={shipping.otherStatesValue ?? 0}
                onChange={(v) => setShipping({ ...shipping, otherStatesValue: v })}
                suffix="R$"
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Cálculo placeholder até PRD-033 entregar o cálculo real via integração com a
            transportadora. Quando "a combinar" estiver ativo, a mensagem ao cliente substitui o
            valor por "a combinar".
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon icon="mdi:message-text-outline" className="size-5 text-primary" />
            Templates de mensagem
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {TEMPLATE_KEYS.map((key) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label className="text-sm font-medium">{TEMPLATE_LABELS[key]}</Label>
                  <p className="text-xs text-muted-foreground">{TEMPLATE_DESCRIPTIONS[key]}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleResetTemplate(key)}
                >
                  <Icon icon="mdi:restore" className="size-4" />
                  Restaurar padrão
                </Button>
              </div>
              <Textarea
                rows={key === "generation" ? 12 : 5}
                value={templates[key]}
                onChange={(e) => setTemplates({ ...templates, [key]: e.target.value })}
                className="font-mono text-xs"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
        <Button variant="outline" onClick={handleReset} disabled={!dirty || saving}>
          Descartar
        </Button>
        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>

      <UnsavedChangesDialog
        open={unsaved.promptOpen}
        onConfirmDiscard={unsaved.confirmDiscard}
        onCancel={unsaved.cancel}
      />
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon icon={icon} className="size-4" />
        {label}
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

interface IFieldNumberProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  suffix?: string;
}

function FieldNumber({ label, value, onChange, suffix }: IFieldNumberProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={suffix ? "pr-12" : undefined}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
