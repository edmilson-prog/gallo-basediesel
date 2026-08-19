import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  ICustomer,
  ID,
  IOrder,
  IQuote,
  IQuoteItem,
  IPart,
  IShippingQuoteSnapshot,
  IVehicle,
  IVehicleModelKit,
  QuotePaymentMethod,
} from "@/shared/types";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { useQuotesProvider } from "@/providers/data/hooks/useQuotesProvider";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { useOrdersProvider } from "@/providers/data/hooks/useOrdersProvider";
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
import { useSettingsProvider } from "@/providers/data/hooks/useSettingsProvider";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { calculateShipping } from "@/features/shipping/api/calculate";
import { recalculateQuote, requiresDiscountApproval, round2 } from "../../utils/quoteTotals";
import { composePaymentCondition, generateQuoteNumber } from "../../utils/quoteNumber";
import { addOrIncrementItem, buildFreeItem, swapItemPart } from "../../utils/quoteItemOps";
import { quoteAggregates } from "../../utils/quoteItemDisplay";
import { useModelKits } from "@/features/model-kits/hooks/useModelKits";
import { KitSuggestionBanner } from "@/features/model-kits";
import { recordAuditLogSync } from "@/providers/data";
import { readCurrentUserSync } from "@/features/auth/guards";
import { usePartsIndex } from "../../hooks/usePartsIndex";
import { useQuoteDraft } from "../../hooks/useQuoteDraft";
import { useShippingQuote } from "../../hooks/useShippingQuote";
import { quoteLayoutClasses } from "../../utils/layoutClasses";
import { useQuoteEditorPrefs } from "../../hooks/useQuoteEditorPrefs";
import { pickSuggestedKit, rankKitsByFleet } from "../../utils/kitRanking";
import { QuoteActionBar } from "./layout/QuoteActionBar";
import { QuoteDraftBanner } from "./layout/QuoteDraftBanner";
import { CustomerChip } from "./customer/CustomerChip";
import { LeadRecipientChip } from "./customer/LeadRecipientChip";
import { QuoteItemsPanel } from "./items/QuoteItemsPanel";
import { QuoteSummaryPanel } from "./summary/QuoteSummaryPanel";
import { QuoteConditions } from "./summary/QuoteConditions";
import { QuoteNotes } from "./summary/QuoteNotes";
import { QuoteSendBar } from "./summary/QuoteSendBar";

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
  const { applyKitId, leadId } = useSearch({ from: "/app/orcamentos/novo" }) as {
    applyKitId?: string;
    leadId?: string;
  };
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const role = useCurrentRole();
  const provider = useQuotesProvider();
  const vehiclesProvider = useVehiclesProvider();
  const ordersProvider = useOrdersProvider();
  const settingsProvider = useSettingsProvider();
  const storeId: ID = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const isManagerOrOwner = role === "Owner" || role === "Gestor";

  const prefs = useQuoteEditorPrefs();
  const classes = quoteLayoutClasses(prefs.layout);
  const { partsById, allParts } = usePartsIndex();

  const modelKitsQuery = useModelKits({});
  // Manual picker lists every kit of the store; the auto-suggestion (PRD-035)
  // is what narrows to official kits matching the client's vehicle.
  const kits = modelKitsQuery.data ?? [];

  const settingsQuery = useQuery({
    queryKey: ["settings", storeId] as const,
    queryFn: () => settingsProvider.get(storeId),
    staleTime: 60_000,
  });
  const settings = settingsQuery.data;
  const thresholdPct = settings?.discountApprovalThresholdPct ?? 0.05;
  const validityDaysDefault = settings?.quoteDefaultValidityDays ?? 7;

  /**
   * Quoting a LEAD (the Atendimento panel's "Só orçamento" shortcut). The lead
   * is the recipient INSTEAD of a customer — `IQuote` states the two are
   * mutually exclusive — so the customer picker is replaced by a fixed chip and
   * everything keyed on `customer` (fleet, kit ranking, repurchase, address)
   * simply stays empty. A lead has no fleet and no purchase history; inventing
   * one here would be worse than showing none.
   *
   * The read goes through the ordinary leads RLS, not the conversation gate the
   * panel used — this screen has no conversation. `retry: false` so a lead this
   * seller cannot read resolves to the error state immediately instead of
   * retrying with backoff.
   */
  const leadsProvider = useLeadsProvider();
  const leadQuery = useQuery({
    queryKey: ["quote-recipient-lead", leadId] as const,
    queryFn: () => leadsProvider.get(leadId as ID),
    enabled: !!leadId,
    staleTime: 60_000,
    retry: false,
  });
  const leadRecipient = leadQuery.data ?? null;

  // --- State ---
  const [customer, setCustomer] = useState<ICustomer | null>(null);
  const [items, setItems] = useState<IQuoteItem[]>([]);
  const [appliedKitIds, setAppliedKitIds] = useState<ID[]>([]);
  // Lines that came from a kit, for the `kit` tag on the row. Editor state
  // only: `quote_items` has explicit columns and no place to persist it, so
  // the tag lives as long as the quote is being built.
  const [kitItemIds, setKitItemIds] = useState<Set<ID>>(() => new Set());
  // `undefined` = sheet closed; `null` = open on the first kit; an id = that kit.
  const [openKitId, setOpenKitId] = useState<ID | null | undefined>(undefined);
  const [highlightId, setHighlightId] = useState<ID | null>(null);
  const [discountInput, setDiscountInput] = useState<string>("0");
  const [discountReason, setDiscountReason] = useState("");
  const [shipping, setShipping] = useState<number>(0);
  // Shipping quote control (Melhor Envio Fase A):
  // - `shippingManual` true once the seller types a value → auto-quote stops overriding.
  // - `selectedServiceId` keeps the chosen carrier across re-quotes.
  // - `shippingSnapshot` is persisted on the quote.
  const [shippingManual, setShippingManual] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [shippingSnapshot, setShippingSnapshot] = useState<IShippingQuoteSnapshot | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<QuotePaymentMethod>("pix");
  const [paymentTerms, setPaymentTerms] = useState("à vista");
  const [validUntil, setValidUntil] = useState(() =>
    isoDate(addDays(new Date(), validityDaysDefault)),
  );
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const draftInput = useMemo(
    () => ({
      customerId: customer?.id,
      items,
      discountInput,
      shipping,
      shippingManual,
      selectedServiceId,
      paymentMethod,
      paymentTerms,
      notes,
    }),
    [
      customer?.id,
      items,
      discountInput,
      shipping,
      shippingManual,
      selectedServiceId,
      paymentMethod,
      paymentTerms,
      notes,
    ],
  );
  const draftEnabled = items.length > 0 || customer !== null;
  const { savedAt, loadDraft, clearDraft } = useQuoteDraft(draftInput, draftEnabled);
  const [draftOffer, setDraftOffer] = useState(() => loadDraft());

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

  // --- Automatic shipping quote (Melhor Envio Fase A) ---
  const meEnabled = Boolean(settings?.shipping?.melhorEnvio?.enabled);
  const autoShipping = useShippingQuote({
    customer,
    config: settings?.shipping,
    totalWeightKg: aggregates.totalWeightKg,
    subtotal: totals.subtotal,
  });
  const quoteResult = autoShipping.result;

  // Option currently applied: the seller's pick, else the cheapest.
  const effectiveOption = useMemo(() => {
    if (!quoteResult || quoteResult.source !== "melhor_envio") return undefined;
    if (selectedServiceId != null) {
      return (
        quoteResult.options.find((o) => o.serviceId === selectedServiceId) ?? quoteResult.selected
      );
    }
    return quoteResult.selected;
  }, [quoteResult, selectedServiceId]);

  // Apply the auto quote unless the seller typed a manual value.
  useEffect(() => {
    if (!quoteResult || shippingManual) return;
    let value: number;
    let snapshot: IShippingQuoteSnapshot;
    const quotedAt = quoteResult.quotedAt ?? new Date().toISOString();
    if (quoteResult.source === "melhor_envio") {
      value = quoteResult.freeShippingApplied
        ? 0
        : (effectiveOption?.finalPrice ?? quoteResult.value);
      snapshot = {
        source: quoteResult.source,
        serviceId: effectiveOption?.serviceId,
        serviceName: effectiveOption?.serviceName,
        companyName: effectiveOption?.companyName,
        price: value,
        basePrice: effectiveOption?.basePrice,
        freeShippingApplied: quoteResult.freeShippingApplied,
        deliveryDays: effectiveOption?.deliveryDays,
        quotedAt,
      };
    } else {
      value = quoteResult.value;
      snapshot = { source: quoteResult.source, price: value, quotedAt };
    }
    setShipping(value);
    setShippingSnapshot(snapshot);
  }, [quoteResult, effectiveOption, shippingManual]);

  const handleManualShipping = (value: number) => {
    setShippingManual(true);
    setSelectedServiceId(null);
    setShipping(value);
    setShippingSnapshot(null);
  };

  const handleSelectShippingOption = (serviceId: number) => {
    setShippingManual(false);
    setSelectedServiceId(serviceId);
  };

  // --- Vehicles (all of them) for item search hints ---
  const vehiclesQuery = useQuery({
    queryKey: ["vehicles-for-customer", customer?.id] as const,
    queryFn: () =>
      customer ? vehiclesProvider.listByCustomer(customer.id) : Promise.resolve([] as IVehicle[]),
    enabled: Boolean(customer),
    staleTime: 60_000,
  });
  const vehicles = vehiclesQuery.data ?? [];

  // --- Kit auto-suggestion (PRD-035) ---
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // Store kits ordered by the customer's fleet — drives both the sheet's list
  // and the unprompted suggestion.
  const rankedKits = useMemo(() => rankKitsByFleet(kits, vehicles), [kits, vehicles]);

  // --- applyKitId from URL (RF-014) ---
  // Guard ref ensures we only pre-open the sheet once even on re-renders.
  const appliedFromUrlRef = useRef(false);
  useEffect(() => {
    if (!applyKitId || appliedFromUrlRef.current || kits.length === 0) return;
    if (kits.some((k) => k.id === applyKitId)) {
      appliedFromUrlRef.current = true;
      setOpenKitId(applyKitId);
    }
  }, [applyKitId, kits]);

  // Reset dismiss state whenever customer changes.
  useEffect(() => {
    setSuggestionDismissed(false);
  }, [customer?.id]);

  const suggested = useMemo(
    () => (customer ? pickSuggestedKit(rankedKits) : null),
    [customer, rankedKits],
  );
  const suggestedKit = suggested?.kit ?? null;
  const suggestionVehicle = suggested ? (vehicles[suggested.matchedVehicleIndex] ?? null) : null;

  // True when the quote already contains at least one filter part.
  const hasFilterItem = useMemo(
    () => items.some((it) => partsById.get(it.partId)?.category === "filtro"),
    [items, partsById],
  );

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
  const handleAddPart = (part: IPart, quantity = 1) => {
    const result = addOrIncrementItem(items, part, quantity);
    setItems(result.items);
    setHighlightId(result.affectedId);
  };
  const handleAddFreeItem = (input: { name: string; unitPrice: number; quantity: number }) => {
    const item = buildFreeItem({
      name: input.name,
      unitPrice: input.unitPrice,
      quantity: input.quantity,
    });
    setItems((prev) => [...prev, item]);
    setHighlightId(item.id);
  };
  const handleSwapEquivalent = (itemId: ID, equivalent: IPart) => {
    const result = swapItemPart(items, itemId, equivalent);
    setItems(result.items);
    setHighlightId(result.affectedId);
  };
  const handleApplyKit = (
    kit: IVehicleModelKit,
    selection: { part: IPart; quantity: number }[],
  ) => {
    const prevItems = items;
    const prevAppliedKitIds = appliedKitIds;
    const prevKitItemIds = kitItemIds;

    let next = items;
    let lastId: ID | null = null;
    const touched: ID[] = [];
    for (const { part, quantity } of selection) {
      const result = addOrIncrementItem(next, part, quantity);
      next = result.items;
      lastId = result.affectedId;
      touched.push(result.affectedId);
    }
    setItems(next);
    setHighlightId(lastId);
    setKitItemIds((prev) => new Set([...prev, ...touched]));

    setAppliedKitIds((prev) => (prev.includes(kit.id) ? prev : [...prev, kit.id]));

    toast.success(
      `${selection.length} ${selection.length === 1 ? "item" : "itens"} de ${kit.name}`,
      {
        action: {
          label: "Desfazer",
          onClick: () => {
            setItems(prevItems);
            setAppliedKitIds(prevAppliedKitIds);
            setKitItemIds(prevKitItemIds);
            setSuggestionDismissed(false);
          },
        },
      },
    );

    const user = readCurrentUserSync();
    recordAuditLogSync({
      actorId: user?.id ?? "mock-user",
      action: "apply",
      resource: "modelKit",
      resourceId: kit.id,
    });

    setOpenKitId(undefined);
    setSuggestionDismissed(true);
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
  const hasRecipient = customer !== null || leadRecipient !== null;
  const canSubmit = hasRecipient && items.length > 0 && !justificationMissing;
  /** What is still missing, written out for the send bar. */
  const blocker = !hasRecipient
    ? items.length === 0
      ? "Selecione o cliente e adicione ao menos um item."
      : "Selecione o cliente para salvar."
    : items.length === 0
      ? "Adicione ao menos um item."
      : justificationMissing
        ? `Justifique o desconto acima de ${(thresholdPct * 100).toFixed(0)}% para salvar.`
        : null;

  // Margin actually earned: the line margins less the global discount, which
  // comes off the seller's own take rather than out of the lines.
  const netMargin = round2(aggregates.totalMargin - totals.discount);
  const netMarginPct = totals.subtotal > 0 ? netMargin / totals.subtotal : 0;

  // --- Shipping ---
  const handleCalcShipping = () => {
    // Melhor Envio on → re-quote (clears manual override + carrier pick).
    if (meEnabled) {
      setShippingManual(false);
      setSelectedServiceId(null);
      autoShipping.refetch();
      return;
    }
    // Otherwise keep the PRD-033 manual region calculation.
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
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const all = await provider.list({ pageSize: 1000 });
      const number = generateQuoteNumber(all.data, storeId);
      const status: IQuote["status"] = sendNow && !needsJustification ? "enviado" : "rascunho";
      const created = await provider.create({
        storeId,
        number,
        // Mutually exclusive by contract (IQuote): one of the two, never both.
        ...(customer ? { customerId: customer.id } : { leadId: leadRecipient?.id }),
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
        deliveryAddress: customer?.address ?? leadRecipient?.address,
        ...(shippingSnapshot ? { shippingQuote: shippingSnapshot } : {}),
        validUntil: new Date(`${validUntil}T23:59:59`).toISOString(),
        status,
        origin: "vendedor",
        division: "parts",
        requiresApproval: needsJustification,
        notes: notes.trim() ? notes.trim() : undefined,
        ...(appliedKitIds.length > 0 ? { appliedKitIds } : {}),
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
      clearDraft();
      void navigate({ to: "/app/orcamentos/$id", params: { id: created.id } });
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar orçamento. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const summaryProps = {
    itemCount: items.length,
    unitCount: items.reduce((sum, it) => sum + it.quantity, 0),
    subtotal: totals.subtotal,
    discountInput,
    onDiscountInput: setDiscountInput,
    discountPct,
    thresholdPct,
    shipping,
    onShipping: handleManualShipping,
    onCalcShipping: handleCalcShipping,
    discountTotal: totals.discount,
    shippingTotal: totals.shipping,
    total: totals.total,
    needsJustification,
    discountReason,
    onDiscountReason: setDiscountReason,
    totalWeightKg: aggregates.totalWeightKg,
    totalMargin: netMargin,
    marginPct: netMarginPct,
    showMargin: isManagerOrOwner,
    quote: meEnabled
      ? {
          enabled: true,
          loading: autoShipping.loading,
          source: quoteResult?.source,
          options: quoteResult?.source === "melhor_envio" ? quoteResult.options : [],
          selectedServiceId: effectiveOption?.serviceId ?? null,
          freeShippingApplied: quoteResult?.freeShippingApplied,
          onSelectOption: handleSelectShippingOption,
        }
      : undefined,
  };

  const conditions = (variant: "rail" | "card") => (
    <QuoteConditions
      variant={variant}
      paymentMethod={paymentMethod}
      onPaymentMethod={setPaymentMethod}
      paymentTerms={paymentTerms}
      onPaymentTerms={setPaymentTerms}
      validUntil={validUntil}
      onValidUntil={setValidUntil}
      defaultValidityDays={validityDaysDefault}
    />
  );

  return (
    <div className={classes.root}>
      <QuoteActionBar
        layout={prefs.layout}
        onLayoutChange={prefs.setLayout}
        density={prefs.density}
        onDensityChange={prefs.setDensity}
        onBack={() => void navigate({ to: "/app/orcamentos" })}
        canSubmit={canSubmit}
        submitting={submitting}
        needsApproval={needsJustification}
        onSaveDraft={() => void handleSave(false)}
        onSaveSend={() => void handleSave(true)}
        savedAt={savedAt}
      />

      <div className={classes.grid}>
        <main className={classes.body}>
          {draftOffer && items.length === 0 && (
            <QuoteDraftBanner
              savedAt={draftOffer.savedAt}
              onRestore={() => {
                setItems(draftOffer.items);
                setDiscountInput(draftOffer.discountInput);
                setShipping(draftOffer.shipping);
                // Restore the real freight state: only keep the auto-quote frozen
                // if the seller had manually set it (old drafts default to false,
                // so a now-enabled Melhor Envio re-quotes instead of going stale).
                setShippingManual(draftOffer.shippingManual ?? false);
                setSelectedServiceId(draftOffer.selectedServiceId ?? null);
                setPaymentMethod(draftOffer.paymentMethod as QuotePaymentMethod);
                setPaymentTerms(draftOffer.paymentTerms);
                setNotes(draftOffer.notes);
                setDraftOffer(null);
                toast.success("Rascunho restaurado.");
              }}
              onDiscard={() => {
                clearDraft();
                setDraftOffer(null);
              }}
            />
          )}

          {leadId ? (
            <LeadRecipientChip
              lead={leadRecipient}
              isLoading={leadQuery.isLoading}
              failed={leadQuery.isError}
              onClearLead={() => void navigate({ to: "/app/orcamentos/novo", search: {} })}
            />
          ) : (
            <CustomerChip
              customer={customer}
              onChange={setCustomer}
              sellerIdFilter={isManagerOrOwner ? null : (currentUser?.sellerId ?? null)}
              vehicles={vehicles}
              storeId={storeId}
              defaultSellerId={isManagerOrOwner ? null : (currentUser?.sellerId ?? null)}
              sellerLocked={!isManagerOrOwner}
            />
          )}

          <QuoteItemsPanel
            adderResetKey={customer?.id ?? leadRecipient?.id ?? "none"}
            items={items}
            subtotal={totals.subtotal}
            mode={prefs.addMode}
            onModeChange={prefs.setAddMode}
            density={prefs.density}
            grow={classes.itemsGrow}
            vehicles={vehicles}
            orders={orders}
            inQuoteQtyByPart={inQuoteQtyByPart}
            onAddPart={handleAddPart}
            onAddFreeItem={handleAddFreeItem}
            rankedKits={rankedKits}
            kitsLoading={modelKitsQuery.isLoading}
            onApplyKit={handleApplyKit}
            openKitId={openKitId}
            onOpenKitIdChange={setOpenKitId}
            kitBanner={
              suggestedKit && suggestionVehicle && !suggestionDismissed && !hasFilterItem ? (
                <KitSuggestionBanner
                  kit={suggestedKit}
                  vehicleLabel={`${suggestionVehicle.brand} ${suggestionVehicle.model}`}
                  onApply={() => setOpenKitId(suggestedKit.id)}
                  onDismiss={() => setSuggestionDismissed(true)}
                />
              ) : null
            }
            onPatch={handleItemPatch}
            onRemove={handleRemoveItem}
            onSwapEquivalent={handleSwapEquivalent}
            kitItemIds={kitItemIds}
            highlightId={highlightId}
            partsById={partsById}
            allParts={allParts}
            showMargin={isManagerOrOwner}
          />

          {!classes.summaryAsRail && (
            <>
              {conditions("card")}
              <QuoteNotes variant="card" notes={notes} onNotes={setNotes} />
              {!classes.summaryAsFooterBar && (
                <QuoteSummaryPanel {...summaryProps} variant="card" />
              )}
            </>
          )}
        </main>

        {classes.summaryAsRail && (
          <aside className={classes.summary}>
            <div className="min-h-0 flex-1 lg:overflow-y-auto">
              <QuoteSummaryPanel {...summaryProps} variant="rail" />
              {conditions("rail")}
              <QuoteNotes variant="rail" notes={notes} onNotes={setNotes} />
            </div>
            <QuoteSendBar
              canSubmit={canSubmit}
              submitting={submitting}
              needsApproval={needsJustification}
              blocker={blocker}
              onSaveSend={() => void handleSave(true)}
            />
          </aside>
        )}
      </div>

      {classes.summaryAsFooterBar && (
        <div className={classes.summary}>
          <QuoteSummaryPanel {...summaryProps} variant="bar" />
        </div>
      )}
    </div>
  );
}
