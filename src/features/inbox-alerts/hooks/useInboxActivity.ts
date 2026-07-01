import { useInboxActivityStore } from "../store/inboxActivityStore";

/** True when there's pending Inbox activity (unread mine OR queue waiting). */
export function useInboxActivity(): boolean {
  return useInboxActivityStore((s) => s.hasUnreadMine || s.hasQueueWaiting);
}
