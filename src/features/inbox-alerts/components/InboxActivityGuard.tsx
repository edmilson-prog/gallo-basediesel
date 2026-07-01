import { useInboxActivityMonitor } from "../hooks/useInboxActivityMonitor";

/** Mounts the global Inbox activity monitor for the whole session. No UI of its own. */
export function InboxActivityGuard() {
  useInboxActivityMonitor();
  return null;
}
