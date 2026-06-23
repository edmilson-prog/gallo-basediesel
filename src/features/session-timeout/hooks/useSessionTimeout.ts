import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { useSettingsProvider, useSellersProvider } from "@/providers/data";
import { resolveSessionTimeout } from "../engine/resolveSessionTimeout";
import { computeIdlePhase } from "../engine/idlePhases";
import { shouldBeepAtTick } from "../engine/beepSchedule";
import { createBeeper, type IBeeper } from "../lib/beep";
import { useActivityTracker } from "./useActivityTracker";
import { useAudioUnlock } from "./useAudioUnlock";
import { useCrossTabActivity } from "./useCrossTabActivity";

export interface ISessionTimeoutState {
  warningOpen: boolean;
  secondsLeft: number;
  /** Fixed warning-window length in seconds — stable base for the countdown bar. */
  warningTotalSeconds: number;
  soundEnabled: boolean;
  stayConnected: () => void;
  logoutNow: () => void;
}

const TICK_MS = 1_000;

/**
 * Idle-timeout orchestrator. Mounted once (via SessionTimeoutGuard) inside the
 * authenticated app layout. Tracks activity (this tab + others), opens a warning
 * with escalating beeps, and routes to /auth/logout on expiry.
 */
export function useSessionTimeout(): ISessionTimeoutState {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const settingsProvider = useSettingsProvider();
  const sellersProvider = useSellersProvider();

  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const sellerId = currentUser?.sellerId;

  const settingsQuery = useQuery({
    queryKey: ["settings", storeId],
    queryFn: () => settingsProvider.get(storeId),
    enabled: Boolean(currentUser),
    staleTime: 5 * 60_000,
  });
  const sellerQuery = useQuery({
    queryKey: ["seller", sellerId],
    queryFn: () => sellersProvider.get(sellerId!),
    enabled: Boolean(sellerId),
    staleTime: 5 * 60_000,
  });

  const resolved = useMemo(
    () =>
      resolveSessionTimeout(
        settingsQuery.data?.sessionTimeout,
        sellerQuery.data?.sessionTimeoutOverride,
      ),
    [settingsQuery.data?.sessionTimeout, sellerQuery.data?.sessionTimeoutOverride],
  );

  // Active only when enabled AND a user is signed in.
  const active = resolved.enabled && Boolean(currentUser);

  const beeperRef = useRef<IBeeper | null>(null);
  if (!beeperRef.current) beeperRef.current = createBeeper();

  const lastActivityRef = useRef<number>(Date.now());
  const lastBeepRemainingRef = useRef<number | null>(null);
  const loggedOutRef = useRef(false);

  const [warningOpen, setWarningOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Stable identity: useCrossTabActivity lists this in its subscribe-effect deps,
  // and the hook re-renders every second during the warning. An inline arrow would
  // tear down and recreate the BroadcastChannel each render, dropping in-flight
  // cross-tab messages. Activity in a sibling tab also clears the warning here
  // (logout fires only when EVERY tab is idle) instead of waiting up to one tick.
  const onRemoteActivity = useCallback((ts: number) => {
    if (ts <= lastActivityRef.current) return;
    lastActivityRef.current = ts;
    setWarningOpen(false);
    lastBeepRemainingRef.current = null;
  }, []);
  const { publish } = useCrossTabActivity(onRemoteActivity, active);

  const markActivity = useCallback(() => {
    // Once logout has been triggered, stop registering activity — a stray input
    // during the in-flight navigation would publish(now) and reset sibling tabs
    // that are themselves idle and about to log out.
    if (loggedOutRef.current) return;
    const now = Date.now();
    lastActivityRef.current = now;
    publish(now);
    // Any activity clears the warning state.
    // setWarningOpen(false) is a no-op when already closed (stable callback).
    setWarningOpen(false);
    lastBeepRemainingRef.current = null;
  }, [publish]);

  useActivityTracker(markActivity, active);

  // Unlock audio only on qualifying gestures (not mousemove/scroll/wheel), so
  // AudioContext.resume() never trips the browser autoplay-policy warning.
  const unlockAudio = useCallback(() => beeperRef.current?.unlock(), []);
  useAudioUnlock(unlockAudio, active);

  // Reset the clock whenever the feature (re)activates.
  useEffect(() => {
    if (active) {
      lastActivityRef.current = Date.now();
      loggedOutRef.current = false;
    }
  }, [active]);

  useEffect(() => {
    if (!active) {
      setWarningOpen(false);
      return;
    }
    const tick = () => {
      // Once logout has been triggered (expiry or "Sair agora"), stop all work —
      // otherwise the warning branch keeps re-opening the modal and beeping while
      // the navigation to /auth/logout is still in flight.
      if (loggedOutRef.current) return;
      const status = computeIdlePhase(
        lastActivityRef.current,
        Date.now(),
        resolved.idleMs,
        resolved.warningMs,
      );
      if (status.phase === "expired") {
        loggedOutRef.current = true;
        setWarningOpen(false);
        void navigate({ to: "/auth/logout" });
        return;
      }
      if (status.phase === "warning") {
        setWarningOpen(true);
        setSecondsLeft(Math.ceil(status.msUntilLogout / 1_000));
        if (resolved.soundEnabled) {
          const decision = shouldBeepAtTick(
            status.msUntilLogout,
            resolved.warningMs,
            lastBeepRemainingRef.current,
          );
          if (decision.beep) {
            beeperRef.current?.beep(resolved.soundVolume, decision.urgency);
            lastBeepRemainingRef.current = status.msUntilLogout;
          }
        }
      } else {
        setWarningOpen(false);
        lastBeepRemainingRef.current = null;
      }
    };
    tick();
    const id = window.setInterval(tick, TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // navigate, beeperRef and the *Ref values are stable; only resolved.* drive re-subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, resolved.idleMs, resolved.warningMs, resolved.soundEnabled, resolved.soundVolume]);

  const stayConnected = useCallback(() => {
    markActivity();
  }, [markActivity]);

  const logoutNow = useCallback(() => {
    if (loggedOutRef.current) return;
    loggedOutRef.current = true;
    setWarningOpen(false);
    void navigate({ to: "/auth/logout" });
  }, [navigate]);

  return {
    warningOpen: warningOpen && active,
    secondsLeft,
    warningTotalSeconds: Math.max(1, Math.ceil(resolved.warningMs / 1_000)),
    soundEnabled: resolved.soundEnabled,
    stayConnected,
    logoutNow,
  };
}
