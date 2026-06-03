import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  ICustomer,
  ID,
  IOrder,
  IQuote,
  IQuoteItem,
  IPart,
  IServiceKit,
  IVehicle,
  QuotePaymentMethod,
} from "@/shared/types";
import { Icon } from "@/components/Icon";
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
import { useOrdersProvider } from "@/providers/data/hooks/useOrdersProvider";
import { useSettingsProvider } from "@/providers/data/hooks/useSettingsProvider";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { calculateShipping } from "@/features/shipping/api/calculate";
import { recalculateQuote, requiresDiscountApproval, round2 } from "../../utils/quoteTotals";
import { composePaymentCondition, generateQuoteNumber } from "../../utils/quoteNumber";
import { addOrIncrementItem, swapItemPart } from "../../utils/quoteItemOps";
import { quoteAggregates } from "../../utils/quoteItemDisplay";
import { useServiceKitsProvider } from "@/providers/data/hooks/useServiceKitsProvider";
import { expandKitToItems } from "../../utils/kitExpansion";
import { usePartsIndex } from "../../hooks/usePartsIndex";
import { quoteLayoutClasses } from "../../utils/layoutClasses";
import { useQuoteEditorPrefs } from "../../hooks/useQuoteEditorPrefs";
import { QuoteActionBar } from "./layout/QuoteActionBar";
import { CustomerChip } from "./customer/CustomerChip";
import { ItemAdder } from "./items/ItemAdder";
import { KitPicker } from "./items/KitPicker";
import { QuoteItemsTable } from "./items/QuoteItemsTable";
import { FreeItemDialog } from "./items/FreeItemDialog";
import { QuoteSummaryPanel } from "./summary/QuoteSummaryPanel";

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function QuoteEditor() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const role = useCurrentRole();
  const provider = useQuotesProvider();
  const vehiclesProvider = useVehiclesProvider();
  const ordersProvider = useOrdersProvider();
  const settingsProvider = useSettingsProvider();
  const storeId: ID = currentStoreId ?? "store-matriz";
  const isManagerOrOwner = role === "Owner" || role === "Gestor";

  const prefs = useQuoteEditorPrefs();
  const classes = quoteLayoutClasses(prefs.layout);
  const { partsById, allParts } = usePartsIndex();

  const serviceKitsProvider = useServiceKitsProvider();
  const kitsQuery = useQuery({
    queryKey: ["service-kits", storeId] as const,
    queryFn: () => serviceKitsProvider.list({ storeId }),
    staleTime: 60_000,
  });
  const kits = kitsQuery.data ?? [];

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
  const [freeOpen, setFreeOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<ID | null>(null);
  const [discountInput, setDiscountInput] = useState<string>("0");
  const [discountReason, setDiscountReason] = useState("");
  const [shipping, setShipping] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<QuotePaymentMethod>("pix");
  const [paymentTerms, setPaymentTerms] = useState("à vista");
  const [validUntil, setValidUntil] = useState(() =>
    isoDate(addDays(new Date(), validityDaysDefault)),
  );
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
  const aggregates = useMemo(
    () => quoteAggregates(items, partsById, totals.subtotal),
    [items, partsById, totals.subtotal],
  );
  const needsJustification = requiresDiscountApproval(
    totals.subtotal,
    totals.discount,
    thresholdPct,
  );
  const justificationMissing = needsJustification && discountReason.trim().length === 0;

  // --- Vehicles (all of them) for item search hints ---
  const vehiclesQuery = useQuery({
    queryKey: ["vehicles-for-customer", customer?.id] as const,
    queryFn: () =>
      customer ? vehiclesProvider.listByCustomer(customer.id) : Promise.resolve([] as IVehicle[]),
    enabled: Boolean(customer),
    staleTime: 60_000,
  });
  const vehicles = vehiclesQuery.data ?? [];

  // --- Customer orders (for repurchase suggestions) ---
  const ordersQuery = useQuery({
    queryKey: ["orders-by-customer", customer?.id] as const,
    queryFn: () =>
      customer ? ordersProvider.listByCustomer(customer.id) : Promise.resolve([] as IOrder[]),
    enabled: Boolean(customer),
    staleTime: 60_000,
  });
  const orders = ordersQuery.data ?? [];

  // --- Item operations ---
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
  const handleAddPart = (part: IPart) => {
    const result = addOrIncrementItem(items, part);
    setItems(result.items);
    setHighlightId(result.affectedId);
  };
  const handleAddFreeItem = (item: IQuoteItem) => {
    setItems((prev) => [...prev, item]);
    setHighlightId(item.id);
  };
  const handleSwapEquivalent = (itemId: ID, equivalent: IPart) => {
    const result = swapItemPart(items, itemId, equivalent);
    setItems(result.items);
    setHighlightId(result.affectedId);
  };
  const handleAddKit = (kit: IServiceKit) => {
    const { resolved, missing } = expandKitToItems(kit, partsById);
    if (resolved.length === 0) {
      toast.error(`Nenhuma peça do kit "${kit.name}" está disponível no catálogo.`);
      return;
    }
    let next = items;
    let lastId: ID | null = null;
    for (const { part, quantity } of resolved) {
      const result = addOrIncrementItem(next, part, quantity);
      next = result.items;
      lastId = result.affectedId;
    }
    setItems(next);
    setHighlightId(lastId);
    toast.success(
      missing > 0
        ? `Kit "${kit.name}" inserido (${resolved.length} peças; ${missing} indisponível${missing > 1 ? "is" : ""}).`
        : `Kit "${kit.name}" inserido (${resolved.length} peças).`,
    );
  };

  // Quantity already in the quote, summed per partId (for adder badges).
  const inQuoteQtyByPart = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      map.set(it.partId, (map.get(it.partId) ?? 0) + it.quantity);
    }
    return map;
  }, [items]);

  // --- Validation ---
  const canSubmit = customer !== null && items.length > 0 && !justificationMissing;

  // --- Shipping ---
  const handleCalcShipping = () => {
    if (!customer?.address) {
      toast.error("Selecione um cliente com endereço para calcular o frete.");
      return;
    }
    if (!settings) {
      toast.error("Configurações de frete ainda não carregaram.");
      return;
    }
    const result = calculateShipping({
      address: customer.address,
      config: settings.shipping,
    });
    if (result.isToNegotiate) {
      setShipping(0);
      toast.info(result.notes ?? "Frete a combinar com o cliente.");
      return;
    }
    const value = result.value ?? 0;
    setShipping(value);
    toast.success(
      result.appliedRate
        ? `Frete R$ ${value.toFixed(2)} — regra "${result.appliedRate.name}".`
        : `Frete R$ ${value.toFixed(2)} aplicado.`,
    );
  };

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
    <div className={classes.root}>
      <QuoteActionBar
        layout={prefs.layout}
        onLayoutChange={prefs.setLayout}
        onBack={() => void navigate({ to: "/app/orcamentos" })}
        canSubmit={canSubmit}
        submitting={submitting}
        needsApproval={needsJustification}
        onSaveDraft={() => void handleSave(false)}
        onSaveSend={() => void handleSave(true)}
      />

      <div className={classes.grid}>
        <div className={classes.body}>
          {/* Cliente */}
          <Card className="p-4">
            <SectionTitle icon="mdi:account-outline" title="Cliente" />
            <CustomerChip
              customer={customer}
              onChange={setCustomer}
              sellerIdFilter={isManagerOrOwner ? null : (currentUser?.sellerId ?? null)}
              vehicles={vehicles}
            />
          </Card>

          {/* Items */}
          <Card className="p-4">
            <SectionTitle icon="mdi:format-list-bulleted" title="Itens" />
            <div className="mb-2 flex items-center justify-end">
              <KitPicker kits={kits} onAddKit={handleAddKit} />
            </div>
            <ItemAdder
              key={customer?.id ?? "none"}
              mode={prefs.addMode}
              onModeChange={prefs.setAddMode}
              vehicles={vehicles}
              orders={orders}
              inQuoteQtyByPart={inQuoteQtyByPart}
              onAddPart={handleAddPart}
              onAddFreeItemClick={() => setFreeOpen(true)}
            />
            <div className="mt-3">
              <QuoteItemsTable
                items={items}
                subtotal={totals.subtotal}
                onPatch={handleItemPatch}
                onRemove={handleRemoveItem}
                highlightId={highlightId}
                partsById={partsById}
                allParts={allParts}
                showMargin={isManagerOrOwner}
                onSwapEquivalent={handleSwapEquivalent}
              />
            </div>
          </Card>

          {/* Condições de pagamento */}
          <Card className="p-4">
            <SectionTitle icon="mdi:credit-card-outline" title="Condições de pagamento" />
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Forma de pagamento</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as QuotePaymentMethod)}
                >
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
          </Card>

          {/* Notas internas */}
          <Card className="p-4">
            <SectionTitle icon="mdi:note-text-outline" title="Notas internas" />
            <Textarea
              rows={3}
              placeholder="Observações internas (não enviadas ao cliente)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Card>
        </div>

        {/* Resumo */}
        <div className={classes.summary}>
          <QuoteSummaryPanel
            itemCount={items.length}
            unitCount={items.reduce((sum, it) => sum + it.quantity, 0)}
            subtotal={totals.subtotal}
            discountInput={discountInput}
            onDiscountInput={setDiscountInput}
            discountPct={discountPct}
            thresholdPct={thresholdPct}
            shipping={shipping}
            onShipping={setShipping}
            onCalcShipping={handleCalcShipping}
            discountTotal={totals.discount}
            shippingTotal={totals.shipping}
            total={totals.total}
            needsJustification={needsJustification}
            discountReason={discountReason}
            onDiscountReason={setDiscountReason}
            compact={classes.summaryAsFooterBar}
            totalWeightKg={aggregates.totalWeightKg}
            totalMargin={aggregates.totalMargin}
            marginPct={aggregates.marginPct}
            showMargin={isManagerOrOwner}
          />
        </div>
      </div>

      <FreeItemDialog
        open={freeOpen}
        onClose={() => setFreeOpen(false)}
        onAdd={handleAddFreeItem}
      />
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon icon={icon} size={16} className="text-muted-foreground" />
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
    </div>
  );
}
