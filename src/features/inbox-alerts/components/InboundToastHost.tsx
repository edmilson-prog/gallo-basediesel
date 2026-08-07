import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { useConversationsProvider } from "@/providers/data";
import { activeConversationIdFromPath } from "../engine/activeConversation";
import { inboundPreview } from "../engine/inboundPreview";
import {
  createInboundToastAccumulator,
  type IInboundToastEntry,
} from "../engine/inboundToastAccumulator";
import { subscribeInboundOnMine } from "../events/inboundOnMine";
import { useInboundToastSettings } from "../hooks/useInboundToastSettings";

/** Title while the contact name has not resolved (or failed to). */
const UNKNOWN_CONTACT_TITLE = "Nova mensagem";
/** Body when the store chose to hide the message text. */
const HIDDEN_PREVIEW_TEXT = "Nova mensagem";

/**
 * Renders the clickable toast for inbound messages that land on the seller's
 * conversations while they are elsewhere. Mounted once, next to the Inbox
 * activity monitor — the monitor decides WHETHER to alert (freshness, dedupe,
 * active-conversation guard); this host decides HOW it looks.
 *
 * One toast per conversation: sonner keys by `id`, so a burst updates the same
 * toast in place and only bumps its counter instead of stacking.
 */
export function InboundToastHost() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const conversationsProvider = useConversationsProvider();

  const accumulatorRef = useRef(createInboundToastAccumulator());
  /** conversationId → resolved contact name. */
  const namesRef = useRef(new Map<string, string>());
  /** Conversations with a `listContacts` call in flight — never ask twice. */
  const pendingNamesRef = useRef(new Set<string>());

  // Store config mirrored into a ref: the subscription below must not be torn
  // down and re-registered every time the settings query refetches.
  const toastSettings = useInboundToastSettings();
  const toastSettingsRef = useRef(toastSettings);
  toastSettingsRef.current = toastSettings;

  useEffect(() => {
    const accumulator = accumulatorRef.current;
    const names = namesRef.current;
    const pendingNames = pendingNamesRef.current;

    function raise(conversationId: string, entry: IInboundToastEntry) {
      const name = names.get(conversationId);
      const { showPreview, durationSeconds } = toastSettingsRef.current;
      // With the preview hidden the body still has to say something, otherwise
      // an alert with an unresolved contact name would be a blank toast.
      const body = showPreview ? entry.preview : HIDDEN_PREVIEW_TEXT;
      toast(name ? `💬 ${name}` : UNKNOWN_CONTACT_TITLE, {
        id: conversationId,
        // The line break is an inline style, not a utility class: sonner injects
        // its own UNLAYERED stylesheet, and `src/components/ui/sonner.tsx`
        // documents that Tailwind utilities are inert on the toast and its
        // inner parts. An inline declaration cannot lose that cascade, so the
        // counter is guaranteed to sit on its own line.
        description: (
          <span style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
            <span>{body}</span>
            {entry.count > 1 && (
              <span className="text-xs opacity-70">{entry.count} novas mensagens</span>
            )}
          </span>
        ),
        duration: durationSeconds * 1000,
        action: {
          label: "Abrir",
          onClick: () => {
            accumulator.clear(conversationId);
            void navigate({ to: "/app/atendimento/$id", params: { id: conversationId } });
          },
        },
        // A cleared entry also means "no toast on screen" — see the re-raise
        // guard below, which is what keeps a late-arriving name from
        // resurrecting a toast the seller already dismissed.
        onDismiss: () => accumulator.clear(conversationId),
        onAutoClose: () => accumulator.clear(conversationId),
      });
    }

    return subscribeInboundOnMine((event) => {
      // Store switched the on-screen alert off. The SOUND is governed
      // separately (Central de Sons), so it keeps playing — turning one off
      // must never take the other with it.
      if (!toastSettingsRef.current.enabled) return;

      const { conversationId } = event;
      const entry = accumulator.register(
        conversationId,
        inboundPreview(event.text, event.mediaType),
      );
      // Show immediately — the name is a nicety, never a blocker.
      raise(conversationId, entry);

      if (names.has(conversationId) || pendingNames.has(conversationId)) return;
      pendingNames.add(conversationId);
      void conversationsProvider
        .listContacts([conversationId])
        .then((rows) => {
          pendingNames.delete(conversationId);
          const name = rows[0]?.name?.trim();
          if (!name) return;
          names.set(conversationId, name);
          // Only re-raise while the toast is still live, so a slow RPC cannot
          // pop a closed toast back onto the screen.
          const current = accumulator.peek(conversationId);
          if (current) raise(conversationId, current);
        })
        .catch(() => {
          pendingNames.delete(conversationId);
          /* best-effort — the toast already showed without the name */
        });
    });
  }, [conversationsProvider, navigate]);

  // Opening the conversation answers the alert: drop its toast and reset the
  // counter so a later message starts a fresh one.
  useEffect(() => {
    const openId = activeConversationIdFromPath(pathname);
    if (!openId) return;
    toast.dismiss(openId);
    accumulatorRef.current.clear(openId);
  }, [pathname]);

  return null;
}
