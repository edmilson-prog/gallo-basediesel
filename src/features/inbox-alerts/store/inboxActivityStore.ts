import { create } from "zustand";

interface IInboxActivityState {
  /** Há mensagem não lida numa conversa atribuída ao usuário logado. */
  hasUnreadMine: boolean;
  /** Há pelo menos um cliente esperando na fila (sem atendente). */
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
