import { useCallback, useEffect, useState } from "react";
import { shouldOfferPush } from "../engine/pushOptIn";
import { usePushSubscription } from "./usePushSubscription";

const DECLINED_KEY = "gallo-atendimento-push-declined-at";
/** Delay after mount before the soft ask may appear — long enough for the list
 *  to paint, so the first thing the user sees is their conversations. */
const SOFT_ASK_DELAY_MS = 1200;

function readDeclinedAt(): string | null {
  try {
    return window.localStorage.getItem(DECLINED_KEY);
  } catch {
    return null;
  }
}

function writeDeclinedAt(): void {
  try {
    window.localStorage.setItem(DECLINED_KEY, new Date().toISOString());
  } catch {
    /* no storage — the ask may reappear next session */
  }
}

/**
 * Orchestrates the soft ask.
 *
 * `active` gates the whole thing: the prompt must never appear over the login
 * or the install screen, where the user has no idea yet what they would be
 * agreeing to receive.
 */
export function usePushOptIn({ active }: { active: boolean }) {
  const push = usePushSubscription();
  const [offering, setOffering] = useState(false);

  useEffect(() => {
    if (!active || !push.isSupported) return;
    const eligible = shouldOfferPush({
      permission: push.permission,
      declinedAt: readDeclinedAt(),
      now: new Date(),
    });
    if (!eligible) return;
    const timer = window.setTimeout(() => setOffering(true), SOFT_ASK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [active, push.isSupported, push.permission]);

  const allow = useCallback(async () => {
    setOffering(false);
    await push.subscribe();
  }, [push]);

  const decline = useCallback(() => {
    setOffering(false);
    writeDeclinedAt();
  }, []);

  return { ...push, offering, allow, decline };
}
