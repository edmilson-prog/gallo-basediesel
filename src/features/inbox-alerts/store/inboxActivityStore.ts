import { create } from "zustand";

interface IInboxActivityState {
  /** There is an unread message in a conversation assigned to the signed-in user. */
  hasUnreadMine: boolean;
  /** There is at least one customer waiting in the queue (no assignee). */
  hasQueueWaiting: boolean;
  setHasUnreadMine: (value: boolean) => void;
  setHasQueueWaiting: (value: boolean) => void;
}

/**
 * In-memory, app-wide signal of pending Inbox activity — written by
 * `useInboxActivityMonitor` (mounted once in AppLayout) and read by the
 * TopBar's unread badge icon. NOT persisted: rebuilt on every mount via the
 * monitor's seed queries, so a stale value never survives a reload.
 */
export const useInboxActivityStore = create<IInboxActivityState>((set) => ({
  hasUnreadMine: false,
  hasQueueWaiting: false,
  setHasUnreadMine: (value) => set({ hasUnreadMine: value }),
  setHasQueueWaiting: (value) => set({ hasQueueWaiting: value }),
}));
