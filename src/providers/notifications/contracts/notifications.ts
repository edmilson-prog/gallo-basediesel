import type {
  INotification,
  NotificationCategory,
  NotificationSeverity,
  NotificationStatus,
  ID,
} from "@/shared/types";
import type { IPaginationParams, IPaginatedResult } from "./_shared";

export interface IListNotificationsParams extends IPaginationParams {
  /** Resolved server-side from the authenticated actor; never trusted from the client. */
  recipientId?: ID;
  categories?: NotificationCategory[];
  statuses?: NotificationStatus[];
  severities?: NotificationSeverity[];
  /** Only notifications not expired at query time. */
  activeOnly?: boolean;
}

/** A derived reconcile pass: upsert these, expire derived ones absent from `keepKeys`. */
export interface IReconcileDerivedInput {
  recipientScope: ID[];
  upsert: INotification[];
  /** dedupeKeys that remain valid this pass; others (derived) get expired. */
  keepKeys: string[];
}

export interface INotificationStore {
  list(params?: IListNotificationsParams): Promise<IPaginatedResult<INotification>>;
  get(id: ID): Promise<INotification>;
  create(
    input: Omit<INotification, "id" | "createdAt" | "status"> & {
      status?: NotificationStatus;
    },
  ): Promise<INotification>;
  unreadCount(recipientId?: ID): Promise<number>;
  markRead(id: ID): Promise<INotification>;
  markAllRead(recipientId?: ID): Promise<number>;
  archive(id: ID): Promise<void>;
  reconcileDerived(input: IReconcileDerivedInput): Promise<void>;
}
