import { useCallback, useEffect, useRef, useState } from "react";
import { connectErrorMessage, getEvolutionState, requestEvolutionQr } from "../api/whatsappConnect";

/**
 * Drives the Evolution QR pairing lifecycle for the connect dialog:
 * QR request → countdown (server TTL, default 30s) → auto-renew (max 3) →
 * 2s state polling (paused while the tab is hidden) → connected/expired/error.
 *
 * Concurrency: every request bumps an epoch; late responses from a previous
 * epoch (renewal racing a poll, or a stale accountId) are discarded, and a QR
 * response never downgrades an already-`open` phase. State updaters stay pure
 * (StrictMode double-invokes them), so expiry side effects live in an effect.
 */

export type PairingPhase = "loading-qr" | "qr" | "connecting" | "open" | "expired" | "error";

export interface IEvolutionPairing {
  phase: PairingPhase;
  qrBase64: string | null;
  secondsLeft: number;
  /** Countdown window of the current QR (server-provided, default 30s). */
  ttlSeconds: number;
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
  const [ttlSeconds, setTtlSeconds] = useState(QR_TTL_SECONDS);
  const [profile, setProfile] = useState<IEvolutionPairing["profile"]>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const autoRenewsRef = useRef(0);
  const activeRef = useRef(true);
  /** Bumped on every request/account change — late responses are discarded. */
  const epochRef = useRef(0);
  const phaseRef = useRef<PairingPhase>("loading-qr");
  phaseRef.current = phase;

  const requestQr = useCallback(async () => {
    if (!accountId) return;
    const epoch = ++epochRef.current;
    setPhase("loading-qr");
    setErrorMessage(null);
    try {
      const result = await requestEvolutionQr(accountId);
      if (!activeRef.current || epoch !== epochRef.current) return;
      if (result.state === "open") {
        setProfile({ phoneNumber: result.phoneNumber, profileName: result.profileName });
        setPhase("open");
        return;
      }
      // A poll may have confirmed the connection while this QR was in flight.
      if (phaseRef.current === "open") return;
      const ttl = result.expiresInSeconds ?? QR_TTL_SECONDS;
      setQrBase64(result.qrBase64 ?? null);
      setTtlSeconds(ttl);
      setSecondsLeft(ttl);
      setPhase("qr");
    } catch (err) {
      if (!activeRef.current || epoch !== epochRef.current) return;
      if (phaseRef.current === "open") return;
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
      epochRef.current += 1;
    };
  }, [accountId, requestQr]);

  // 1s countdown while the QR is on screen — pure updater only.
  useEffect(() => {
    if (phase !== "qr") return;
    const timer = setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Expiry side effects (renewal budget / expired state) live OUTSIDE the
  // state updater — StrictMode double-invokes updaters, effects run once.
  useEffect(() => {
    if (phase !== "qr" || secondsLeft > 0) return;
    if (autoRenewsRef.current < MAX_AUTO_RENEWALS) {
      autoRenewsRef.current += 1;
      void requestQr();
    } else {
      setPhase("expired");
    }
  }, [phase, secondsLeft, requestQr]);

  // 2s state polling while pairing; skipped when the tab is hidden.
  useEffect(() => {
    if (!accountId || (phase !== "qr" && phase !== "connecting")) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      const epoch = epochRef.current;
      void getEvolutionState(accountId)
        .then((result) => {
          if (!activeRef.current || epoch !== epochRef.current) return;
          if (result.state === "open") {
            setProfile({ phoneNumber: result.phoneNumber, profileName: result.profileName });
            setPhase("open");
          } else if (result.state === "connecting") {
            setPhase((current) => (current === "qr" ? "connecting" : current));
          }
        })
        .catch(() => {
          // Transient poll failures are ignored — countdown/renewal and the
          // next tick keep the UX moving (no infinite spinners: expiry fires).
        });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [accountId, phase]);

  const renew = useCallback(() => {
    autoRenewsRef.current = 0;
    void requestQr();
  }, [requestQr]);

  return { phase, qrBase64, secondsLeft, ttlSeconds, profile, errorMessage, renew };
}
