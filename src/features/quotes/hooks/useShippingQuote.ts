import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ICustomer, IShippingConfig, IShippingQuoteResult } from "@/shared/types";
import { getShippingQuoteProvider } from "@/providers/shipping";
import { buildQuoteResult, calculateShipping } from "@/features/shipping";

export interface IUseShippingQuoteParams {
  customer: ICustomer | null;
  /** `settings.shipping` of the current store. */
  config: IShippingConfig | undefined;
  /** Summed item weight (kg) — `quoteAggregates(...).totalWeightKg`. */
  totalWeightKg: number;
  /** Order subtotal (BRL) — drives insurance + free-shipping rule. */
  subtotal: number;
}

export interface IUseShippingQuoteResult {
  loading: boolean;
  /**
   * Resolved quote, or `null` when the Melhor Envio integration is disabled
   * (in that case the screen keeps the PRD-033 manual "Calcular" behaviour).
   */
  result: IShippingQuoteResult | null;
  /** Forces an immediate re-quote (manual "Calcular"/"Recotar" button). */
  refetch: () => void;
}

const DEBOUNCE_MS = 700;
const onlyDigits = (value: string | undefined): string => (value ?? "").replace(/\D/g, "");

/** Maps the PRD-033 region calculation into the quote-result shape. */
function regionResult(
  customer: ICustomer | null,
  totalWeightKg: number,
  config: IShippingConfig,
): IShippingQuoteResult {
  const calc = calculateShipping({ address: customer?.address, totalWeightKg, config });
  if (calc.isToNegotiate || calc.value == null) {
    return { source: "to_negotiate", options: [], value: 0, isToNegotiate: true, notes: calc.notes };
  }
  return {
    source: "region_rules",
    options: [],
    value: calc.value,
    isToNegotiate: false,
    notes: calc.notes,
  };
}

/** Stamps the fetch time so the snapshot's `quotedAt` is stable across carrier switches. */
function withQuotedAt(result: IShippingQuoteResult): IShippingQuoteResult {
  return { ...result, quotedAt: new Date().toISOString() };
}

/**
 * Orchestrates the automatic shipping quote on the quote editor: debounced
 * Melhor Envio call (mock or Edge) → engine markup/selection/free-shipping,
 * transparently falling back to the region rules (PRD-033) on empty/error.
 *
 * Does NOT mutate the editor — the caller decides whether to apply `value`.
 */
export function useShippingQuote(params: IUseShippingQuoteParams): IUseShippingQuoteResult {
  const { customer, config, totalWeightKg, subtotal } = params;
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IShippingQuoteResult | null>(null);
  const [nonce, setNonce] = useState(0);

  // Stable trigger keys — avoid re-running on unrelated re-renders.
  const meKey = useMemo(() => JSON.stringify(config?.melhorEnvio ?? null), [config?.melhorEnvio]);
  const addrKey = useMemo(
    () => JSON.stringify(customer?.address ?? null),
    [customer?.address],
  );

  // Latest values read inside the async effect without widening its deps.
  const configRef = useRef(config);
  configRef.current = config;
  const customerRef = useRef(customer);
  customerRef.current = customer;

  useEffect(() => {
    const cfg = configRef.current;
    const me = cfg?.melhorEnvio;

    // Integration off → inert (manual PRD-033 behaviour stays intact).
    if (!cfg || !me?.enabled) {
      setLoading(false);
      setResult(null);
      return;
    }

    const destZip = onlyDigits(customerRef.current?.address?.zipCode);
    const originZip = onlyDigits(me.originZip);

    // Enabled but cannot quote (missing CEPs) → region fallback, no network.
    if (destZip.length !== 8 || originZip.length !== 8) {
      setLoading(false);
      setResult(withQuotedAt(regionResult(customerRef.current, totalWeightKg, cfg)));
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const options = await getShippingQuoteProvider().quote({
            originZip,
            destZip,
            box: {
              heightCm: me.defaultBox.heightCm,
              widthCm: me.defaultBox.widthCm,
              lengthCm: me.defaultBox.lengthCm,
            },
            weightKg: totalWeightKg,
            declaredValue: subtotal,
            environment: me.environment,
            services: me.enabledServices,
          });
          if (cancelled) return;
          const built = buildQuoteResult(options, me, subtotal);
          setResult(withQuotedAt(built ?? regionResult(customerRef.current, totalWeightKg, cfg)));
        } catch (err) {
          if (cancelled) return;
          console.warn("[shipping] cotação falhou — usando regras por região", err);
          setResult(withQuotedAt(regionResult(customerRef.current, totalWeightKg, cfg)));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [meKey, addrKey, totalWeightKg, subtotal, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  return { loading, result, refetch };
}
