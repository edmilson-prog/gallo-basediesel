import { useInboxActivityMonitor } from "../hooks/useInboxActivityMonitor";
import { InboundToastHost } from "./InboundToastHost";

/**
 * Mounts the global Inbox activity monitor for the whole session, plus the host
 * that renders its inbound toasts. No UI of its own.
 */
export function InboxActivityGuard() {
  useInboxActivityMonitor();
  return <InboundToastHost />;
}
