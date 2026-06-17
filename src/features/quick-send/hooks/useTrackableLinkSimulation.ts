import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IConversation, IMessage, ITrackableLink, LeadTemperature } from "@/shared/types";
import { useTrackableLinkProvider, useLeadsProvider, useMessagesProvider } from "@/providers/data";
import { useConversationContext } from "@/features/conversations/hooks/ConversationContext";
import { nextTemperature } from "../engine/temperatureEscalation";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

// Trackable-links query key — MUST match `conversationLinksQueryKey` in
// useConversationLinks.ts (Task 9). Inlined here so this runner (Task 8) builds
// green before Task 9 lands; both produce ["quick-send","links",conversationId].
function linksQueryKey(conversationId: ID): readonly unknown[] {
  return ["quick-send", "links", conversationId] as const;
}

const OPEN_TICK_MS = 12_000;
/** Chance a tick produces an open for at least one not-yet-opened link. */
const OPEN_PROBABILITY = 0.5;

/**
 * Simulated trackable-link open runner (D-8/D-9). On each tick, with some
 * probability it registers an open on one of this conversation's links. A new
 * open whose link has a leadId escalates the lead temperature MONOTONICALLY
 * and drops a single SystemBubble cause→effect line. Idempotent per
 * (linkId,temperature) so re-opens at the same level never re-escalate.
 *
 * Live updates don't invalidate a shared messages/leads query key: those live
 * in useMessages/useConversationDetail's own per-conversation query caches,
 * mutated directly rather than through an invalidatable key. Instead:
 *  - the SystemBubble is appended via the conversation context's
 *    `messages.appendOptimistic(...)` (the same path useMessageSend uses) AND
 *    persisted through `messagesProvider.send({ authorType: "system" })`;
 *  - the lead chip refreshes by calling `refreshDetail()` (the page passes
 *    `detail.refresh`), which re-fetches the lead behind TemperatureChip.
 * Only the trackable-links query (a real query) is invalidated.
 */
export function useTrackableLinkSimulation(
  conversation: IConversation,
  refreshDetail: () => void,
): void {
  const linkProvider = useTrackableLinkProvider();
  const leadsProvider = useLeadsProvider();
  const messagesProvider = useMessagesProvider();
  const queryClient = useQueryClient();
  const { messages } = useConversationContext();
  // Records the temperature we last announced per leadId so we never repeat.
  const announcedRef = useRef<Map<ID, LeadTemperature>>(new Map());
  // The conversation-context `messages` object and `refreshDetail` are recreated
  // on every parent render; capture the bits we use in refs so the polling
  // effect's deps stay stable (otherwise the interval resets on every render).
  const appendOptimisticRef = useRef(messages.appendOptimistic);
  appendOptimisticRef.current = messages.appendOptimistic;
  const refreshDetailRef = useRef(refreshDetail);
  refreshDetailRef.current = refreshDetail;

  useEffect(() => {
    let cancelled = false;
    const leadId = conversation.leadId;

    const escalateAndAnnounce = async (link: ITrackableLink) => {
      if (!leadId) return;
      // Read current lead temperature, compute next (monotonic).
      const lead = await leadsProvider.get(leadId).catch(() => null);
      if (!lead) return;
      const current = lead.temperature as LeadTemperature;
      const next = nextTemperature(current);
      if (next === current) return; // already at top or no change
      if (announcedRef.current.get(leadId) === next) return; // already announced this level
      announcedRef.current.set(leadId, next);
      await leadsProvider.update(leadId, { temperature: next });
      // System bubble cause→effect (D-9).
      const note = QUICK_SEND_STRINGS.temperature.roseUpTo(next, link.utm?.campaign ?? "o link");
      // Append the bubble LIVE through the conversation context so it shows
      // immediately (appendOptimistic prepends synchronously to useMessages' query cache).
      const now = new Date().toISOString();
      const optimistic: IMessage = {
        id: `tmp-sys-${crypto.randomUUID()}`,
        conversationId: conversation.id,
        direction: "out",
        authorType: "system",
        provider: "mock",
        text: note,
        status: "sent",
        sentAt: now,
      };
      const handle = appendOptimisticRef.current(optimistic);
      try {
        // Persist so the note survives a remount; swap the optimistic row.
        const real = await messagesProvider.send(conversation.id, {
          authorType: "system",
          text: note,
        });
        handle.commit({ ...real, status: "sent" });
      } catch {
        // Non-fatal: keep the optimistic bubble; lead chip still refreshes.
      }
      // Re-fetch the lead so the header TemperatureChip updates + pulses.
      if (!cancelled) refreshDetailRef.current();
      toast(QUICK_SEND_STRINGS.temperature.toast(next));
    };

    const tick = async () => {
      if (cancelled) return;
      if (Math.random() > OPEN_PROBABILITY) return;
      let links: ITrackableLink[] = [];
      try {
        links = await linkProvider.listByConversation(conversation.id);
      } catch {
        return;
      }
      const candidates = links.filter((l) => l.leadId === leadId);
      if (candidates.length === 0) return;
      // Pick the link with the fewest opens to spread the simulation.
      const target = [...candidates].sort((a, b) => a.opens - b.opens)[0];
      if (!target) return;
      try {
        const updated = await linkProvider.registerOpen(target.id);
        // Trackable-links IS a real query (useConversationLinks) — invalidate it
        // so the LinkOpenIndicator's opens count refreshes.
        void queryClient.invalidateQueries({
          queryKey: linksQueryKey(conversation.id),
        });
        await escalateAndAnnounce(updated);
      } catch {
        // ignore — simulation is best-effort
      }
    };

    const handle = window.setInterval(() => void tick(), OPEN_TICK_MS);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [
    linkProvider,
    leadsProvider,
    messagesProvider,
    queryClient,
    conversation.id,
    conversation.leadId,
  ]);
}
