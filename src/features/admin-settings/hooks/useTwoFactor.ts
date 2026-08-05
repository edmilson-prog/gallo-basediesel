import { useCallback, useEffect, useState } from "react";
import { AUTH_SOURCE } from "@/features/auth/authSource";
import { disableTotp, getVerifiedTotpFactor } from "@/features/auth/mfa";

export interface ITwoFactorState {
  /** True when a real credential backend can carry a second factor. */
  available: boolean;
  /** True while the initial status read is in flight. */
  loading: boolean;
  /** True when the account has a verified TOTP factor. */
  enabled: boolean;
  /** Id of the verified factor (needed to turn it off). */
  factorId: string | null;
  busy: boolean;
  /** Re-reads the status from Supabase (after enrolling, for instance). */
  refresh: () => Promise<void>;
  /** Removes the factor. Resolves with an error message, or null on success. */
  disable: () => Promise<string | null>;
}

/**
 * Two-factor status for the signed-in user, for Configurações → Meu perfil.
 *
 * Optional: an account with no factor simply reports `enabled: false` and the
 * rest of the app behaves exactly as before.
 */
export function useTwoFactor(): ITwoFactorState {
  const available = AUTH_SOURCE === "supabase";
  const [loading, setLoading] = useState(available);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const read = useCallback(async () => {
    if (!available) {
      setLoading(false);
      return;
    }
    const factor = await getVerifiedTotpFactor();
    setFactorId(factor?.id ?? null);
    setLoading(false);
  }, [available]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!available) {
        setLoading(false);
        return;
      }
      const factor = await getVerifiedTotpFactor();
      if (cancelled) return;
      setFactorId(factor?.id ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [available]);

  const disable = useCallback(async (): Promise<string | null> => {
    if (!factorId) return "Nenhuma verificação ativa para desativar.";
    setBusy(true);
    try {
      await disableTotp(factorId);
      setFactorId(null);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Não foi possível desativar.";
    } finally {
      setBusy(false);
    }
  }, [factorId]);

  return {
    available,
    loading,
    enabled: factorId !== null,
    factorId,
    busy,
    refresh: read,
    disable,
  };
}
