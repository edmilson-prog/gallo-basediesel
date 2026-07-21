import { useCallback, useRef, useState } from "react";
import { onlyDigits } from "../utils/cnpjCpf";
import {
  mapMinhaReceitaResponse,
  type ICnpjCompany,
  type IMinhaReceitaRawResponse,
} from "../utils/minhaReceitaMapper";

/**
 * CNPJ lookup against the public Minha Receita service (https://minhareceita.org).
 *
 * The service mirrors the Receita Federal open dataset and requires no API key.
 * A 200 means the CNPJ exists (and we get the company data for autofill); a 404
 * means it is unknown/invalid. Because the API is community-run, network/CORS
 * failures are treated as a soft "could not verify" state — the caller is
 * expected to let the form proceed (the local checksum already passed).
 */

const MINHA_RECEITA_BASE = "https://minhareceita.org";
const TIMEOUT_MS = 8000;

/** idle → loading → (success | invalid | error). */
export type CnpjLookupStatus = "idle" | "loading" | "success" | "invalid" | "error";

export type { ICnpjCompany };

export interface IUseMinhaReceitaResult {
  lookup: (rawCnpj: string) => Promise<ICnpjCompany | null>;
  status: CnpjLookupStatus;
  loading: boolean;
  error: string | null;
  data: ICnpjCompany | null;
  reset: () => void;
}

export function useMinhaReceita(): IUseMinhaReceitaResult {
  const [status, setStatus] = useState<CnpjLookupStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ICnpjCompany | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setError(null);
    setData(null);
  }, []);

  const lookup = useCallback(async (rawCnpj: string): Promise<ICnpjCompany | null> => {
    const digits = onlyDigits(rawCnpj);
    if (digits.length !== 14) {
      setStatus("invalid");
      setError("CNPJ inválido.");
      setData(null);
      return null;
    }

    // Cancel any in-flight request so a stale response can't overwrite this one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

    setStatus("loading");
    setError(null);
    setData(null);

    try {
      const res = await fetch(`${MINHA_RECEITA_BASE}/${digits}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      if (res.status === 404) {
        setStatus("invalid");
        setError("CNPJ não encontrado na Receita.");
        return null;
      }
      if (!res.ok) {
        setStatus("error");
        setError("Não foi possível validar o CNPJ agora.");
        return null;
      }

      const body = (await res.json()) as IMinhaReceitaRawResponse;
      const out = mapMinhaReceitaResponse(digits, body);
      setData(out);
      setStatus("success");
      return out;
    } catch {
      // Aborts (timeout/superseded), CORS and offline all land here.
      if (controller.signal.aborted && abortRef.current !== controller) {
        // Superseded by a newer lookup — keep that one's state.
        return null;
      }
      setStatus("error");
      setError("Não foi possível validar o CNPJ agora.");
      return null;
    } finally {
      window.clearTimeout(timeout);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  return { lookup, status, loading: status === "loading", error, data, reset };
}
