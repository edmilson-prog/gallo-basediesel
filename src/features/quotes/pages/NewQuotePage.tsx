import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  ICustomer,
  ID,
  IQuote,
  IQuoteItem,
  IVehicle,
  QuotePaymentMethod,
} from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { useQuotesProvider } from "@/providers/data/hooks/useQuotesProvider";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { useSettingsProvider } from "@/providers/data/hooks/useSettingsProvider";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { AddItemModal } from "../components/new/AddItemModal";
import { CustomerAutocomplete } from "../components/new/CustomerAutocomplete";
import { recalculateQuote, requiresDiscountApproval, round2 } from "../utils/quoteTotals";
import { composePaymentCondition, generateQuoteNumber } from "../utils/quoteNumber";

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function NewQuotePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const role = useCurrentRole();
  const provider = useQuotesProvider();
  const vehiclesProvider = useVehiclesProvider();
  const settingsProvider = useSettingsProvider();
  const storeId: ID = currentStoreId ?? "store-matriz";
  const isManagerOrOwner = role === "Owner" || role === "Gestor";

  const settingsQuery = useQuery({
    queryKey: ["settings", storeId] as const,
    queryFn: () => settingsProvider.get(storeId),
    staleTime: 60_000,
  });
  const settings = settingsQuery.data;
  const thresholdPct = settings?.discountApprovalThresholdPct ?? 0.05;
  const validityDaysDefault = settings?.quoteDefaultValidityDays ?? 7;

  // --- State ---
  const [customer, setCustomer] = useState<ICustomer | null>(null);
  const [items, setItems] = useState<IQuoteItem[]>([]);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState<string>("0");
  const [discountReason, setDiscountReason] = useState("");
  const [shipping, setShipping] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<QuotePaymentMethod>("pix");
  const [paymentTerms, setPaymentTerms] = useState("à vista");
  const [validUntil, setValidUntil] = useState(() => isoDate(addDays(new Date(), validityDaysDefault)));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Update validUntil default when settings load.
  useEffect(() => {
    if (settings) {
      setValidUntil(isoDate(addDays(new Date(), settings.quoteDefaultValidityDays ?? 7)));
    }
  }, [settings]);

  // --- Derived totals ---
  const discountValue = Math.max(0, Number(discountInput) || 0);
  const totals = useMemo(
    () => recalculateQuote(items, discountValue, shipping),
    [items, discountValue, shipping],
  );
  const discountPct = totals.subtotal > 0 ? totals.discount / totals.subtotal : 0;
  const needsJustification = requiresDiscountApproval(totals.subtotal, totals.discount, thresholdPct);
  const justificationMissing = needsJustification && discountReason.trim().length === 0;

  // --- Vehicle hint for item search ---
  const vehiclesQuery = useQuery({
    queryKey: ["vehicles-for-customer", customer?.id] as const,
    queryFn: () =>
      customer ? vehiclesProvider.listByCustomer(customer.id) : Promise.resolve([] as IVehicle[]),
    enabled: Boolean(customer),
    staleTime: 60_000,
  });
  const firstVehicle = vehiclesQuery.data?.[0];

  // --- Item operations ---
  const handleAddItem = (item: IQuoteItem) => {
    setItems((prev) => [...prev, item]);
  };
  const handleRemoveItem = (id: ID) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };
  const handleItemPatch = (id: ID, patch: Partial<IQuoteItem>) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const next = { ...i, ...patch };
        next.total = round2(next.quantity * next.unitPrice - next.discount);
        return next;
      }),
    );
  };

  // --- Validation ---
  const canSubmit = customer !== null && items.length > 0 && !justificationMissing;

  // --- Save ---
  const handleSave = async (sendNow: boolean) => {
    if (!canSubmit || !customer || submitting) return;
    setSubmitting(true);
    try {
      const all = await provider.list({ pageSize: 1000 });
      const number = generateQuoteNumber(all.data, storeId);
      const status: IQuote["status"] = sendNow && !needsJustification ? "enviado" : "rascunho";
      const created = await provider.create({
        storeId,
        number,
        customerId: customer.id,
        sellerId: currentUser?.sellerId ?? "system",
        items,
        subtotal: totals.subtotal,
        discount: totals.discount,
        discountReason: needsJustification ? discountReason : undefined,
        shipping: totals.shipping,
        total: totals.total,
        paymentCondition: composePaymentCondition(paymentMethod, paymentTerms),
        paymentMethod,
        paymentTerms,
        deliveryAddress: customer.address,
        validUntil: new Date(`${validUntil}T23:59:59`).toISOString(),
        status,
        origin: "vendedor",
        division: "parts",
        requiresApproval: needsJustification,
        notes: notes.trim() ? notes.trim() : undefined,
      });
      auditLog({
        action: "quote_create",
        resource: "quote",
        resourceId: created.id,
        after: { number: created.number, total: created.total, status: created.status },
      });
      await queryClient.invalidateQueries({ queryKey: ["quotes-list"] });
      toast.success(
        sendNow && status === "enviado"
          ? `Orçamento #${number} enviado.`
          : needsJustification
            ? `Orçamento #${number} aguardando aprovação do gestor.`
            : `Rascunho #${number} salvo.`,
      );
      void navigate({ to: "/app/orcamentos/$id", params: { id: created.id } });
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar orçamento. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => void navigate({ to: "/app/orcamentos" })}
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Icon icon="mdi:chevron-left" size={14} />
            Voltar à listagem
          </button>
          <h1 className="text-2xl font-semibold text-foreground">Novo orçamento</h1>
          <p className="text-sm text-muted-foreground">
            Preencha as 5 seções abaixo para criar um orçamento manualmente.
          </p>
        </div>
      </div>

      {/* Seção 1 — Cliente */}
      <Section number={1} title="Cliente" icon="mdi:account-outline">
        <CustomerAutocomplete
          value={customer?.id ?? null}
          onChange={setCustomer}
          sellerIdFilter={isManagerOrOwner ? null : currentUser?.sellerId ?? null}
        />
        {customer?.address && (
          <p className="mt-2 text-xs text-muted-foreground">
            <Icon icon="mdi:map-marker-outline" size={12} className="mr-1 inline" />
            {customer.address.street}, {customer.address.number} — {customer.address.district},{" "}
            {customer.address.city}/{customer.address.state}
          </p>
        )}
      </Section>

      {/* Seção 2 — Items */}
      <Section number={2} title="Items" icon="mdi:format-list-bulleted">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center">
            <p className="text-xs text-muted-foreground">Nenhum item adicionado ainda.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Peça</th>
                  <th className="w-20 px-3 py-2 text-right">Qtd.</th>
                  <th className="w-28 px-3 py-2 text-right">Unit.</th>
                  <th className="w-24 px-3 py-2 text-right">Desc.</th>
                  <th className="w-28 px-3 py-2 text-right">Subtotal</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <p className="text-sm font-medium text-foreground">{it.partName}</p>
                      <p className="text-[10px] text-muted-foreground">SKU {it.partSku}</p>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min={1}
                        value={it.quantity}
                        onChange={(e) =>
                          handleItemPatch(it.id, {
                            quantity: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="h-8 text-right tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={it.unitPrice}
                        onChange={(e) =>
                          handleItemPatch(it.id, {
                            unitPrice: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="h-8 text-right tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={it.discount}
                        onChange={(e) =>
                          handleItemPatch(it.id, {
                            discount: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="h-8 text-right tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">
                      {moneyFormatter.format(it.total)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(it.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remover item"
                      >
                        <Icon icon="mdi:trash-can-outline" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 text-xs">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-right font-medium text-muted-foreground">
                    Subtotal
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">
                    {moneyFormatter.format(totals.subtotal)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={() => setAddItemOpen(true)}>
            <Icon icon="mdi:plus" size={16} />
            Adicionar item
          </Button>
        </div>
      </Section>

      {/* Seção 3 — Desconto e frete */}
      <Section number={3} title="Desconto e frete" icon="mdi:cash-multiple">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="discount">Desconto global (R$)</Label>
            <Input
              id="discount"
              type="number"
              min={0}
              step={0.01}
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Equivalente a {(discountPct * 100).toFixed(1)}% do subtotal. Limite sem aprovação:{" "}
              {(thresholdPct * 100).toFixed(0)}%.
            </p>
          </div>
          <div>
            <Label htmlFor="shipping">Frete (R$)</Label>
            <Input
              id="shipping"
              type="number"
              min={0}
              step={0.01}
              value={shipping}
              onChange={(e) => setShipping(Math.max(0, Number(e.target.value) || 0))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Cálculo automático será integrado pelo PRD-033.
            </p>
          </div>
        </div>
        {needsJustification && (
          <div className="mt-3 rounded-md border border-orange-500/30 bg-orange-500/5 p-3">
            <p className="text-xs font-medium text-orange-600 dark:text-orange-300">
              <Icon icon="mdi:shield-alert-outline" size={14} className="mr-1 inline" />
              Desconto acima do limite — requer aprovação do gestor
            </p>
            <Textarea
              className="mt-2"
              placeholder="Justifique o desconto (obrigatório)"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
            />
          </div>
        )}
      </Section>

      {/* Seção 4 — Condições */}
      <Section number={4} title="Condições de pagamento" icon="mdi:credit-card-outline">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>Forma de pagamento</Label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as QuotePaymentMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
                <SelectItem value="cartao">Cartão</SelectItem>
                <SelectItem value="prazo">Prazo</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="terms">Prazo</Label>
            <Input
              id="terms"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="ex.: 30/60/90 dias"
            />
          </div>
          <div>
            <Label htmlFor="valid">Válido até</Label>
            <Input
              id="valid"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
        </div>
      </Section>

      {/* Seção 5 — Notas */}
      <Section number={5} title="Notas internas" icon="mdi:note-text-outline">
        <Textarea
          rows={3}
          placeholder="Observações internas (não enviadas ao cliente)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Section>

      {/* Totals summary */}
      <Card className="flex flex-col gap-2 p-4">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">{moneyFormatter.format(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Desconto</span>
          <span className="tabular-nums">-{moneyFormatter.format(totals.discount)}</span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Frete</span>
          <span className="tabular-nums">+{moneyFormatter.format(totals.shipping)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
          <span>Total</span>
          <span className="tabular-nums">{moneyFormatter.format(totals.total)}</span>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex flex-col-reverse items-stretch gap-2 md:flex-row md:justify-end">
        <Button
          variant="outline"
          disabled={!canSubmit || submitting}
          onClick={() => void handleSave(false)}
        >
          <Icon icon="mdi:content-save-outline" size={16} />
          Salvar rascunho
        </Button>
        <Button disabled={!canSubmit || submitting} onClick={() => void handleSave(true)}>
          <Icon icon="mdi:send-outline" size={16} />
          {needsJustification ? "Salvar e solicitar aprovação" : "Salvar e enviar"}
        </Button>
      </div>

      <AddItemModal
        open={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        onAdd={handleAddItem}
        vehicleBrand={firstVehicle?.brand}
        vehicleModel={firstVehicle?.model}
        vehicleYear={firstVehicle?.year}
      />
    </div>
  );
}

function Section({
  number,
  title,
  icon,
  children,
}: {
  number: number;
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {number}
        </span>
        <Icon icon={icon} size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </Card>
  );
}
