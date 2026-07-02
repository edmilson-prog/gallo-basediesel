import { useCallback, useEffect, useRef, useState } from "react";
import {
  getActiveDataSource,
  useConversationsProvider,
  useMessagesProvider,
} from "@/providers/data";
import { subscribeToTable } from "@/shared/lib/realtime";
import type { IConversation } from "@/shared/types";

/** Build-time data source: decides simulator (mock) vs Supabase Realtime. */
const IS_SUPABASE = getActiveDataSource() === "supabase";

const LOCAL_STORAGE_KEY = "gallo-realtime-enabled";
const MIN_INTERVAL_MS = 8_000;
const MAX_INTERVAL_MS = 15_000;

const SIMULATED_LINES = [
  "Você ainda tem aquela peça em estoque?",
  "Quanto fica com frete para Frederico?",
  "Bom dia, conseguiu olhar minha cotação?",
  "Pode me passar o prazo de entrega, por favor?",
  "Esse valor inclui a montagem?",
  "Vou conferir com a oficina e te respondo já.",
  "Já fizeram a NF? Recebi por aqui.",
  "Aceitam boleto a 30 dias?",
  "Esse turbo tem garantia de quanto tempo?",
  "Confirmando o pedido — pode separar para retirada amanhã.",
];

function readEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

function writeEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, String(enabled));
  } catch {
    // ignore
  }
}

function pickActive(conversations: IConversation[]): IConversation | null {
  const active = conversations.filter(
    (c) =>
      c.status === "em_andamento" || c.status === "aguardando_cliente" || c.status === "aguardando",
  );
  if (active.length === 0) return null;
  return active[Math.floor(Math.random() * active.length)];
}

function pickLine(): string {
  return SIMULATED_LINES[Math.floor(Math.random() * SIMULATED_LINES.length)];
}

/**
 * ~1 in 5 simulated inbound messages carries an image payload so a fresh media
 * asset is created + deduped through the live inbound archival path
 * (useEnsureInboundMedia → ensureFromMessage) at runtime (RF-006/007/008).
 */
function pickMediaType(): "image" | undefined {
  return Math.random() < 0.2 ? "image" : undefined;
}

function pickIntervalMs(): number {
  return MIN_INTERVAL_MS + Math.floor(Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS));
}

/**
 * Builds a channel-status handler that fires `onCatchUp` exactly once per
 * down→SUBSCRIBED transition, forwarding every status to `forward` unchanged.
 *
 * postgres_changes has no replay: any join transition (boot, auth re-join,
 * socket reconnect) may land AFTER events the channel never delivered, so each
 * (re)join refetches once via the same tick the live events feed. Pure factory
 * — unit tested in `useRealtimeConversations.test.ts`.
 */
export function createCatchUpStatusHandler(
  onCatchUp: () => void,
  forward?: (connected: boolean) => void,
): (connected: boolean) => void {
  let wasUp = false;
  return (connected: boolean) => {
    if (connected && !wasUp) onCatchUp();
    wasUp = connected;
    forward?.(connected);
  };
}

export interface IRealtimeState {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  /** Increments on every live event (real or simulated). Use as refetch key. */
  tick: number;
  /**
   * Channel health. Always true in mock mode (the simulator is local); in
   * supabase mode it reflects the Realtime channel status (false while
   * connecting / reconnecting).
   */
  connected: boolean;
}

/**
 * Keeps the inbox live.
 *
 * - `mock` (default): drives the demo by injecting one inbound message every
 *   8-15 seconds — single jittered timeout, rescheduled after each injection.
 * - `supabase` (PRD-105): subscribes to Supabase Realtime postgres_changes on
 *   `conversations` + `messages` (RLS scopes the events server-side) and bumps
 *   `tick` so list consumers refetch. The simulator never runs in this mode.
 *
 * The on/off state persists in `localStorage` and the public API is identical
 * in both modes.
 */
export function useRealtimeConversations(): IRealtimeState {
  const conversationsProvider = useConversationsProvider();
  const messagesProvider = useMessagesProvider();
  const [enabled, setEnabledState] = useState(readEnabled);
  const [tick, setTick] = useState(0);
  const [connected, setConnected] = useState(!IS_SUPABASE);
  const timerRef = useRef<number | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    writeEnabled(next);
  }, []);

  const fire = useCallback(async () => {
    if (!enabledRef.current) return;
    try {
      // Pull a small page to pick a random conversation; pageSize=50 is enough
      // to cover the inbox top while staying cheap.
      const page = await conversationsProvider.list({ pageSize: 50 });
      const target = pickActive(page.data);
      if (!target) return;
      await messagesProvider.simulateIncoming(target.id, pickLine(), pickMediaType());
      setTick((t) => t + 1);
    } catch {
      // Silent — real-time is best-effort. A failed mock tick should not
      // surface as an error to the user.
    }
  }, [conversationsProvider, messagesProvider]);

  // mock mode — simulated inbound traffic.
  useEffect(() => {
    if (IS_SUPABASE) return;
    if (!enabled) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    const schedule = () => {
      timerRef.current = window.setTimeout(async () => {
        await fire();
        if (enabledRef.current) schedule();
      }, pickIntervalMs());
    };
    schedule();
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, fire]);

  // supabase mode — real Realtime subscriptions (shared, ref-counted channels).
  useEffect(() => {
    if (!IS_SUPABASE) return;
    if (!enabled) {
      setConnected(false);
      return;
    }
    const bump = () => setTick((t) => t + 1);
    const offMessages = subscribeToTable(
      "messages",
      bump,
      createCatchUpStatusHandler(bump, setConnected),
    );
    const offConversations = subscribeToTable(
      "conversations",
      bump,
      createCatchUpStatusHandler(bump),
    );
    return () => {
      offMessages();
      offConversations();
    };
  }, [enabled]);

  return { enabled, setEnabled, tick, connected };
}
