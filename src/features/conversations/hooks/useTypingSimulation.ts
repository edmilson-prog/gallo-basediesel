import { useEffect, useState } from "react";
import type { IConversation } from "@/shared/types";

const TICK_MIN_MS = 20_000;
const TICK_MAX_MS = 40_000;
const TYPING_DURATION_MIN_MS = 3_000;
const TYPING_DURATION_MAX_MS = 8_000;
const PROBABILITY = 0.3;

function pickDelay(): number {
  return TICK_MIN_MS + Math.random() * (TICK_MAX_MS - TICK_MIN_MS);
}

function pickDuration(): number {
  return TYPING_DURATION_MIN_MS + Math.random() * (TYPING_DURATION_MAX_MS - TYPING_DURATION_MIN_MS);
}

/**
 * Returns `true` when the conversation should display the "Cliente está
 * digitando…" indicator. The simulation only runs for live conversations
 * (`em_andamento` / `aguardando_cliente`) and flips on with 30% probability
 * every 20-40 seconds, staying visible for 3-8 seconds.
 *
 * Pure presentation aid — no provider mutations are issued.
 */
export function useTypingSimulation(conversation: IConversation): boolean {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (typing) return;
    const isLive =
      conversation.status === "em_andamento" || conversation.status === "aguardando_cliente";
    if (!isLive) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (Math.random() < PROBABILITY) {
        setTyping(true);
      }
    }, pickDelay());

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [conversation.id, conversation.status, typing]);

  useEffect(() => {
    if (!typing) return;
    const timer = window.setTimeout(() => setTyping(false), pickDuration());
    return () => window.clearTimeout(timer);
  }, [typing]);

  return typing;
}
