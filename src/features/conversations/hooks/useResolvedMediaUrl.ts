import { useQuery } from "@tanstack/react-query";
import { useMessagesProvider } from "@/providers/data";

/**
 * Resolve a message media ref (`IMessage.mediaUrl`) into a browser-navigable
 * URL, signing private `whatsapp-media` object paths on demand.
 *
 * Cached under the signed-URL lifetime so a conversation re-renders (typing,
 * status ticks, Realtime) don't re-sign the same object on every paint. The
 * query is disabled when there is no ref. A `null` result means "unavailable"
 * (empty ref, failed download, or a forbidden/absent object) — the caller
 * shows a graceful fallback rather than a broken element.
 */
export function useResolvedMediaUrl(mediaUrl: string | undefined) {
  const messages = useMessagesProvider();
  return useQuery({
    queryKey: ["message-media-url", mediaUrl ?? null],
    queryFn: () => messages.resolveMediaUrl(mediaUrl),
    enabled: Boolean(mediaUrl),
    // Comfortably under the 1h signed-URL TTL minted by the Supabase provider.
    staleTime: 50 * 60_000,
    gcTime: 55 * 60_000,
    retry: 1,
  });
}
