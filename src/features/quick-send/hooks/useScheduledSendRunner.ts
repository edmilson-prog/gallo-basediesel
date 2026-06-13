import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ID, IConversation, IScheduledSend, IWhatsAppAccount } from "@/shared/types";
import {
  useScheduledSendProvider,
  useAssetLibraryProvider,
  getActiveDataSource,
} from "@/providers/data";
import { useMessageSend } from "@/features/conversations/hooks/useMessageSend";
import { useAuth } from "@/features/auth/useAuth";
import { isDue } from "../engine/scheduledSend";
import { pickSendableVersion } from "../engine/assetVersioning";
import { isSensitiveAsset, canSendSensitiveAsset } from "../engine/assetSensitivity";
import { useSendAsset } from "./useSendAsset";
import { scheduledSendsQueryKey } from "./useConversationScheduled";

const POLL_INTERVAL_MS = 10_000;

/**
 * Simulated scheduled-send runner (D-11). Polls listDue(now), re-validates the
 * payload (published + sensitivity permission) AT DISPATCH TIME, sends via the
 * existing send hooks, and marks sent/failed. Never throws — a broken/forbidden
 * payload becomes status "failed" with a reason; nothing unsendable is sent.
 *
 * Products are sent as DEGRADED TEXT via useMessageSend (MVP choice per spec
 * §11 — full product re-hydration requires the live catalog IPart, a Plan B
 * composer concern not available at fire time).
 *
 * MOCK-ONLY: in `supabase` the server-side worker (`scheduled-send-worker` +
 * pg_cron) owns dispatch — it fires due sends even with no browser open, so
 * running this poller too would risk double-dispatch. The mock data source has
 * no server, so it keeps this in-browser simulation.
 */
export function useScheduledSendRunner(
  conversation: IConversation,
  whatsappAccount: IWhatsAppAccount | null,
): void {
  const provider = useScheduledSendProvider();
  const assetProvider = useAssetLibraryProvider();
  const send = useMessageSend(conversation, whatsappAccount);
  const { sendAsset } = useSendAsset(conversation, whatsappAccount);
  const { userRole } = useAuth();
  const queryClient = useQueryClient();
  // Guard against overlapping ticks and double-dispatch of the same row.
  const inFlightRef = useRef<Set<ID>>(new Set());

  useEffect(() => {
    // Server-authoritative in supabase (see file header) — skip the poller.
    if (getActiveDataSource() === "supabase") return;
    let cancelled = false;
    const viewer = userRole ? { role: userRole } : null;

    const dispatchOne = async (item: IScheduledSend) => {
      if (inFlightRef.current.has(item.id)) return;
      inFlightRef.current.add(item.id);
      try {
        const ctx = item.payload.contextMessage;
        if (item.payload.type === "snippet") {
          // Snippet body was resolved at schedule time → contextMessage carries it.
          if (!ctx || !ctx.trim()) throw new Error("snippet vazio");
          await send.send({ text: ctx });
        } else if (item.payload.type === "asset" || item.payload.type === "combo") {
          const ids = item.payload.assetIds ?? [];
          if (ids.length === 0) throw new Error("sem ativos");
          // Re-validate each asset at dispatch time; skip forbidden, fail if none sendable.
          let anySent = false;
          for (const assetId of ids) {
            const asset = await assetProvider.get(assetId);
            if (!asset) continue;
            if (!pickSendableVersion(asset)) continue; // not published anymore
            if (isSensitiveAsset(asset) && !canSendSensitiveAsset(viewer)) continue;
            // useSendAsset is fire-and-forget: it swallows its own send errors
            // (try/catch + toast). So `anySent` means "a sendable asset was
            // dispatched", not "delivery confirmed". Full delivery-state
            // reconciliation is a Fase-2 concern.
            // Only the first sendable asset carries the context note (mirror
            // useComboSend) so it isn't repeated for every item in a combo.
            await sendAsset(asset, anySent ? undefined : ctx);
            anySent = true;
          }
          if (!anySent) throw new Error("nenhum ativo enviável");
        } else if (item.payload.type === "product") {
          // Product card snapshot is rebuilt by the composer flow; here we send
          // the stored context text as a fallback (full card requires the live
          // catalog part which is out of the runner's scope at fire time).
          if (ctx && ctx.trim()) await send.send({ text: ctx });
          else throw new Error("produto sem contexto");
        }
        await provider.markSent(item.id);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "falha no envio agendado";
        await provider.markFailed(item.id, reason);
      } finally {
        inFlightRef.current.delete(item.id);
        if (!cancelled) {
          void queryClient.invalidateQueries({
            queryKey: scheduledSendsQueryKey(conversation.id),
          });
        }
      }
    };

    const tick = async () => {
      if (cancelled) return;
      let due: IScheduledSend[] = [];
      try {
        due = await provider.listDue(new Date().toISOString());
      } catch {
        return; // provider hiccup; try again next tick
      }
      for (const item of due) {
        if (cancelled) break;
        if (item.conversationId !== conversation.id) continue;
        if (item.status !== "pending") continue;
        // Engine-level due re-check (defensive; provider already filtered).
        if (!isDue(item.scheduledFor, new Date().toISOString())) continue;
        void dispatchOne(item);
      }
    };

    // Fire once on mount, then poll.
    void tick();
    const handle = window.setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [provider, assetProvider, send, sendAsset, userRole, queryClient, conversation.id]);
}
