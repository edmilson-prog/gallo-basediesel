import { useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IQuoteItem } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/Icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL } from "@/shared/utils/format";
import { usePartsProvider, useQuotesProvider } from "@/providers/data";
import { generateQuoteNumber } from "@/features/quotes/utils/quoteNumber";
import { usePwaAuth } from "../hooks/usePwaAuth";
import { usePwaPortfolio } from "../hooks/usePwaPortfolio";
import { customerLabel } from "../utils/customerLabel";
import { PWABanner } from "../components/PWABanner";
import { PWA_STRINGS as S } from "../i18n/pt-BR";

const VALIDITY_DAYS = 7;

export interface IPwaQuickQuoteSearch {
  customerId?: string;
}

export function PWAQuickQuotePage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/pwa/orcamento-rapido" }) as IPwaQuickQuoteSearch;
  const { session } = usePwaAuth();
  const partsProvider = usePartsProvider();
  const quotesProvider = useQuotesProvider();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [customerId, setCustomerId] = useState<ID | undefined>(search.customerId);
  const [items, setItems] = useState<IQuoteItem[]>([]);
  const [partSearch, setPartSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: customers = [] } = usePwaPortfolio(session?.sellerId);

  const partsQuery = useQuery({
    queryKey: ["pwa", "parts", partSearch] as const,
    enabled: step === 2 && partSearch.trim().length >= 2,
    queryFn: async () => (await partsProvider.list({ search: partSearch, pageSize: 20 })).data,
  });

  const subtotal = useMemo(() => items.reduce((acc, it) => acc + it.total, 0), [items]);
  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;

  const addPart = (partId: ID, sku: string, name: string, unitPrice: number) => {
    setItems((prev) => {
      const existing = prev.find((it) => it.partId === partId);
      if (existing) {
        return prev.map((it) =>
          it.partId === partId
            ? { ...it, quantity: it.quantity + 1, total: (it.quantity + 1) * it.unitPrice }
            : it,
        );
      }
      const item: IQuoteItem = {
        // Plain uuid: `quote_items.id` is a uuid column.
        id: crypto.randomUUID(),
        partId,
        partSku: sku,
        partName: name,
        quantity: 1,
        unitPrice,
        discount: 0,
        total: unitPrice,
      };
      return [...prev, item];
    });
  };

  const changeQty = (itemId: ID, delta: number) => {
    setItems((prev) =>
      prev
        .map((it) =>
          it.id === itemId
            ? {
                ...it,
                quantity: Math.max(0, it.quantity + delta),
                total: Math.max(0, it.quantity + delta) * it.unitPrice,
              }
            : it,
        )
        .filter((it) => it.quantity > 0),
    );
  };

  const handleConfirm = async () => {
    if (!customerId || !session || items.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const existing = await quotesProvider.list({ storeId: session.storeId, pageSize: 1000 });
      const number = generateQuoteNumber(existing.data, session.storeId);
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + VALIDITY_DAYS);

      await quotesProvider.create({
        storeId: session.storeId,
        number,
        customerId,
        sellerId: session.sellerId,
        items,
        subtotal,
        discount: 0,
        shipping: 0,
        total: subtotal,
        paymentCondition: "à combinar",
        validUntil: validUntil.toISOString(),
        status: "rascunho",
        origin: "vendedor",
        division: "parts",
      });
      toast.success(S.quoteCreated);
      void navigate({ to: "/pwa/carteira/$id", params: { id: customerId } });
    } catch (err) {
      console.error("[PWAQuickQuotePage] quote creation failed", err);
      toast.error(S.quoteCreateFailed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-semibold text-foreground">{S.quoteTitle}</h1>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                step >= n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {n}
            </span>
            {n < 3 && <span className="h-0.5 flex-1 bg-border" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">{S.quoteStepCustomer}</p>
          <Select value={customerId ?? ""} onValueChange={(v) => setCustomerId(v)}>
            <SelectTrigger className="h-12 text-base">
              <SelectValue placeholder={S.quoteSelectCustomer} />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {customerLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="h-12 w-full" disabled={!customerId} onClick={() => setStep(2)}>
            {S.quoteNext}
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">{S.quoteStepItems}</p>
          <div className="relative">
            <Icon
              icon="mdi:magnify"
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={partSearch}
              onChange={(e) => setPartSearch(e.target.value)}
              placeholder={S.quoteSearchParts}
              className="h-12 pl-9 text-base"
            />
          </div>

          {(partsQuery.data ?? []).length > 0 && (
            <div className="space-y-2">
              {(partsQuery.data ?? []).map((p) => (
                <Card key={p.id} className="flex items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.sku} · {formatBRL(p.unitPrice)}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => addPart(p.id, p.sku, p.name, p.unitPrice)}>
                    {S.quoteAddItem}
                  </Button>
                </Card>
              ))}
            </div>
          )}

          <div className="space-y-2 border-t border-border pt-3">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">{S.quoteEmptyItems}</p>
            ) : (
              items.map((it) => (
                <Card key={it.id} className="flex items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{it.partName}</p>
                    <p className="text-xs text-muted-foreground">{formatBRL(it.total)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      onClick={() => changeQty(it.id, -1)}
                    >
                      <Icon icon="mdi:minus" size={16} aria-hidden />
                    </Button>
                    <span className="w-6 text-center text-sm tabular-nums">{it.quantity}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      onClick={() => changeQty(it.id, 1)}
                    >
                      <Icon icon="mdi:plus" size={16} aria-hidden />
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>

          <div className="flex items-center justify-between text-sm font-semibold">
            <span>{S.quoteSubtotal}</span>
            <span className="tabular-nums">{formatBRL(subtotal)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-12" onClick={() => setStep(1)}>
              {S.quoteBack}
            </Button>
            <Button className="h-12" disabled={items.length === 0} onClick={() => setStep(3)}>
              {S.quoteNext}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">{S.quoteStepReview}</p>
          <PWABanner />
          <Card className="space-y-2 p-4">
            <p className="text-sm">
              <span className="text-muted-foreground">Cliente: </span>
              <span className="font-medium text-foreground">{customerLabel(selectedCustomer)}</span>
            </p>
            <div className="space-y-1 border-t border-border pt-2">
              {items.map((it) => (
                <div key={it.id} className="flex justify-between text-sm">
                  <span className="truncate text-foreground">
                    {it.quantity}× {it.partName}
                  </span>
                  <span className="shrink-0 tabular-nums">{formatBRL(it.total)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <span>{S.quoteSubtotal}</span>
              <span className="tabular-nums">{formatBRL(subtotal)}</span>
            </div>
          </Card>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-12" onClick={() => setStep(2)}>
              {S.quoteBack}
            </Button>
            <Button className="h-12" disabled={submitting} onClick={() => void handleConfirm()}>
              {submitting ? "Criando…" : S.quoteConfirm}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
