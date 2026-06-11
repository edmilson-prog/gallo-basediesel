import { useCallback, useEffect, useRef, useState } from "react";
import { connectErrorMessage, getEvolutionState, requestEvolutionQr } from "../api/whatsappConnect";

/**
 * Drives the Evolution QR pairing lifecycle for the connect dialog:
 * QR request → 30s countdown → auto-renew (max 3) → 2s state polling
 * (paused while the tab is hidden) → connected/expired/error.
 * All timers are tied to `accountId` becoming null (dialog closed).
 */

export type PairingPhase = "loading-qr" | "qr" | "connecting" | "open" | "expired" | "error";

export interface IEvolutionPairing {
  phase: PairingPhase;
  qrBase64: string | null;
  secondsLeft: number;
  profile: { phoneNumber?: string; profileName?: string };
  errorMessage: string | null;
  /** Manual "Gerar novo código" — also resets the auto-renew budget. */
  renew: () => void;
}

const QR_TTL_SECONDS = 30;
const MAX_AUTO_RENEWALS = 3;
const POLL_INTERVAL_MS = 2000;

export function useEvolutionPairing(accountId: string | null): IEvolutionPairing {
  const [phase, setPhase] = useState<PairingPhase>("loading-qr");
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(QR_TTL_SECONDS);
  const [profile, setProfile] = useState<IEvolutionPairing["profile"]>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const autoRenewsRef = useRef(0);
  const activeRef = useRef(true);

  const requestQr = useCallback(async () => {
    if (!accountId) return;
    setPhase("loading-qr");
    setErrorMessage(null);
    try {
      const result = await requestEvolutionQr(accountId);
      if (!activeRef.current) return;
      if (result.state === "open") {
        setProfile({ phoneNumber: result.phoneNumber, profileName: result.profileName });
        setPhase("open");
        return;
      }
      setQrBase64(result.qrBase64 ?? null);
      setSecondsLeft(result.expiresInSeconds ?? QR_TTL_SECONDS);
      setPhase("qr");
    } catch (err) {
      if (!activeRef.current) return;
      setErrorMessage(connectErrorMessage(err));
      setPhase("error");
    }
  }, [accountId]);

  // Start (and restart on account change); cancel everything on close.
  useEffect(() => {
    activeRef.current = Boolean(accountId);
    autoRenewsRef.current = 0;
    if (accountId) void requestQr();
    return () => {
      activeRef.current = false;
    };
  }, [accountId, requestQr]);

  // 1s countdown while the QR is on screen; auto-renew up to the budget.
  useEffect(() => {
    if (phase !== "qr") return;
    const timer = setInterval(() => {
      setSecondsLeft((current) => {
        if (current > 1) return current - 1;
        if (autoRenewsRef.current < MAX_AUTO_RENEWALS) {
          autoRenewsRef.current += 1;
          void requestQr();
        } else {
          setPhase("expired");
        }
        return 0;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, requestQr]);

  // 2s state polling while pairing; skipped when the tab is hidden.
  useEffect(() => {
    if (!accountId || (phase !== "qr" && phase !== "connecting")) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      void getEvolutionState(accountId)
        .then((result) => {
          if (!activeRef.current) return;
          if (result.state === "open") {
            setProfile({ phoneNumber: result.phoneNumber, profileName: result.profileName });
            setPhase("open");
          } else if (result.state === "connecting") {
            setPhase((current) => (current === "qr" ? "connecting" : current));
          }
        })
        .catch(() => {
          // Transient poll failures are ignored — the countdown/renewal flow
          // and the next tick keep the UX moving (no infinite spinners:
          // expiry still fires).
        });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [accountId, phase]);

  const renew = useCallback(() => {
    autoRenewsRef.current = 0;
    void requestQr();
  }, [requestQr]);

  return { phase, qrBase64, secondsLeft, profile, errorMessage, renew };
}
