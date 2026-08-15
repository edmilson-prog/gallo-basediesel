/** Route that renders a single conversation — `src/routes/app.atendimento.$id.tsx`. */
const CONVERSATION_ROUTE_PREFIX = "/app/atendimento/";

/**
 * Conversation id currently open in the URL, or `null` when the user is
 * anywhere else (including the Inbox list with no selection).
 *
 * Tolerates a trailing slash and a query string so it works with any caller's
 * flavour of "pathname" — TanStack Router hands over a bare pathname, but a
 * future caller passing `location.href`'s tail should not silently miss.
 */
export function activeConversationIdFromPath(pathname: string): string | null {
  const path = pathname.replace(/[?#].*$/, "");
  if (!path.startsWith(CONVERSATION_ROUTE_PREFIX)) return null;
  const tail = path.slice(CONVERSATION_ROUTE_PREFIX.length).replace(/\/+$/, "");
  // A nested segment means the user is on a sub-route, not on the conversation.
  if (!tail || tail.includes("/")) return null;
  return tail;
}

/**
 * True when `conversationId` is the conversation the user is actually looking
 * at: open in the route AND with the tab in the foreground. A conversation open
 * behind a minimized window or a background tab is NOT active — the seller is
 * not seeing it, so the alert must still fire.
 */
export function isConversationActive(
  pathname: string,
  conversationId: string,
  visibility: DocumentVisibilityState,
): boolean {
  if (visibility !== "visible") return false;
  if (!conversationId) return false;
  return activeConversationIdFromPath(pathname) === conversationId;
}
