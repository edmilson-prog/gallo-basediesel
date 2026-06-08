import { useCallback, useState } from "react";
import type { ICustomerAddress, IShippingResult } from "@/shared/types";
import { useSettingsProvider } from "@/providers/data";
import { calculateShipping } from "@/features/shipping";
import { useViaCep, formatZip, isValidZip } from "./useViaCep";

const STORE_ID = "00000000-0000-0000-0000-000000000001";

export interface IUseCartShippingResult {
  /** Current ViaCEP-resolved address (when the lookup succeeded). */
  resolvedAddress: ICustomerAddress | null;
  /** Active shipping result — `null` until a CEP is calculated. */
  result: IShippingResult | null;
  loading: boolean;
  error: string | null;
  /** Convenience flag — true when we have a numeric shipping value. */
  hasValue: boolean;
  /** Numeric value (0 when "a combinar" or not calculated). */
  value: number;
  zipInput: string;
  setZipInput: (value: string) => void;
  calculate: (zipOverride?: string) => Promise<void>;
  reset: () => void;
  /** Manually inject an address (used by the checkout when the user picks a saved address). */
  applyAddress: (address: ICustomerAddress) => Promise<void>;
}

/**
 * Cart-page shipping calculator (PRD-064 RF-008 + PRD-033).
 *
 * Combines `useViaCep` (resolves CEP → address) with the pure
 * `calculateShipping` engine and the platform `IShippingConfig` to expose a
 * single hook the cart summary + checkout summary can both consume.
 */
export function useCartShipping(): IUseCartShippingResult {
  const settingsProvider = useSettingsProvider();
  const viaCep = useViaCep();
  const [zipInput, setZipInput] = useState("");
  const [resolvedAddress, setResolvedAddress] = useState<ICustomerAddress | null>(null);
  const [result, setResult] = useState<IShippingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculate = useCallback(
    async (zipOverride?: string) => {
      const zip = (zipOverride ?? zipInput).trim();
      if (zip.length === 0) {
        setError("Informe o CEP.");
        return;
      }
      if (!isValidZip(zip)) {
        setError("CEP inválido.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const lookup = await viaCep.lookup(zip);
        if (!lookup) {
          setError(viaCep.error ?? "Não conseguimos resolver o CEP.");
          setLoading(false);
          return;
        }
        const address: ICustomerAddress = {
          zipCode: formatZip(zip),
          street: lookup.street,
          number: "",
          district: lookup.district,
          city: lookup.city,
          state: lookup.state,
        };
        setResolvedAddress(address);

        const settings = await settingsProvider.get(STORE_ID);
        const cfg = settings?.shipping;
        if (!cfg) {
          setResult({
            isToNegotiate: true,
            notes: "Configuração de frete indisponível.",
            reason: "no_active_rules",
          });
          return;
        }
        const shipResult = calculateShipping({ config: cfg, address });
        setResult(shipResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao calcular o frete.");
      } finally {
        setLoading(false);
      }
    },
    [zipInput, viaCep, settingsProvider],
  );

  const applyAddress = useCallback(
    async (address: ICustomerAddress) => {
      setResolvedAddress(address);
      setZipInput(address.zipCode);
      setError(null);
      try {
        const settings = await settingsProvider.get(STORE_ID);
        if (!settings?.shipping) {
          setResult({
            isToNegotiate: true,
            notes: "Configuração de frete indisponível.",
            reason: "no_active_rules",
          });
          return;
        }
        const shipResult = calculateShipping({ config: settings.shipping, address });
        setResult(shipResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao calcular o frete.");
      }
    },
    [settingsProvider],
  );

  const reset = useCallback(() => {
    setZipInput("");
    setResolvedAddress(null);
    setResult(null);
    setError(null);
  }, []);

  const value = result && !result.isToNegotiate ? (result.value ?? 0) : 0;
  const hasValue = result !== null && !result.isToNegotiate;

  return {
    resolvedAddress,
    result,
    loading,
    error,
    hasValue,
    value,
    zipInput,
    setZipInput,
    calculate,
    reset,
    applyAddress,
  };
}
