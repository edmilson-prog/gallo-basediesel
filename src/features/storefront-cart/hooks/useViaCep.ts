import { useCallback, useState } from "react";

export interface IViaCepAddress {
  zipCode: string;
  street: string;
  district: string;
  city: string;
  state: string;
}

export interface IUseViaCepResult {
  lookup: (rawZip: string) => Promise<IViaCepAddress | null>;
  loading: boolean;
  error: string | null;
  data: IViaCepAddress | null;
  reset: () => void;
}

const VIACEP_BASE = "https://viacep.com.br/ws";
const ZIP_REGEX = /^\d{5}-?\d{3}$/;

interface IViaCepResponse {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

export function formatZip(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function isValidZip(raw: string): boolean {
  return ZIP_REGEX.test(raw.trim());
}

/**
 * Thin wrapper around the public ViaCEP service (PRD-064 RF-023).
 *
 * MVP — uses the production endpoint over HTTPS without an API key. When the
 * request fails (offline, CORS, unknown CEP), the form falls back to manual
 * fill so the checkout never gets stuck.
 */
export function useViaCep(): IUseViaCepResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<IViaCepAddress | null>(null);

  const lookup = useCallback(async (rawZip: string): Promise<IViaCepAddress | null> => {
    const digits = rawZip.replace(/\D/g, "");
    if (digits.length !== 8) {
      setError("CEP inválido.");
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${VIACEP_BASE}/${digits}/json/`, { method: "GET" });
      if (!res.ok) {
        setError("Falha ao consultar o CEP.");
        return null;
      }
      const body = (await res.json()) as IViaCepResponse;
      if (body.erro) {
        setError("CEP não encontrado.");
        return null;
      }
      const out: IViaCepAddress = {
        zipCode: formatZip(digits),
        street: body.logradouro ?? "",
        district: body.bairro ?? "",
        city: body.localidade ?? "",
        state: (body.uf ?? "").toUpperCase(),
      };
      setData(out);
      return out;
    } catch {
      setError("Falha ao consultar o CEP. Preencha manualmente.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { lookup, loading, error, data, reset };
}
