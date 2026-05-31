import type {
  INotification,
  NotificationCategory,
  NotificationSeverity,
  NotificationStatus,
  ID,
} from "@/shared/types";
import { selectAllNotifications, selectNotificationById } from "../store/selectors";
import { patchById, upsert } from "../store/mutations";
import { getMockState } from "../store/mockStore";
import {
  MockNotFoundError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export interface IListNotificationsParams extends IPaginationParams {
  recipientId?: ID;
  recipientType?: INotification["recipientType"];
  categories?: NotificationCategory[];
  statuses?: NotificationStatus[];
  severities?: NotificationSeverity[];
  activeOnly?: boolean;
}

export const notificationsApi = {
  list(params: IListNotificationsParams = {}): Promise<IPaginatedResult<INotification>> {
    return runApi(
      "notificationsApi",
      "list",
      () => {
        const now = new Date().toISOString();
        let all = selectAllNotifications();

        if (params.recipientId) all = all.filter((n) => n.recipientId === params.recipientId);
        if (params.recipientType) all = all.filter((n) => n.recipientType === params.recipientType);
        if (params.categories && params.categories.length > 0) {
          const allowed = new Set(params.categories);
          all = all.filter((n) => allowed.has(n.category));
        }
        if (params.statuses && params.statuses.length > 0) {
          const allowed = new Set(params.statuses);
          all = all.filter((n) => allowed.has(n.status));
        }
        if (params.severities && params.severities.length > 0) {
          const allowed = new Set(params.severities);
          all = all.filter((n) => allowed.has(n.severity));
        }
        if (params.activeOnly) {
          all = all.filter((n) => !n.expiresAt || n.expiresAt > now);
        }

        const sorted = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  async get(id: ID): Promise<INotification> {
    return runApi("notificationsApi", "get", () => {
      const found = selectNotificationById(id);
      if (!found) throw new MockNotFoundError("notification", id);
      return found;
    });
  },

  async create(
    input: Omit<INotification, "id" | "createdAt" | "status"> & {
      status?: NotificationStatus;
    },
  ): Promise<INotification> {
    return runApi("notificationsApi", "create", () => {
      const id: ID = `notif-new-${crypto.randomUUID().slice(0, 8)}`;
      const notification: INotification = {
        ...input,
        id,
        status: input.status ?? "unread",
        createdAt: new Date().toISOString(),
      };
      upsert("notifications", notification);
      return notification;
    });
  },

  async unreadCount(recipientId?: ID): Promise<number> {
    return runApi("notificationsApi", "unreadCount", () => {
      let all = selectAllNotifications().filter((n) => n.status === "unread");
      if (recipientId) all = all.filter((n) => n.recipientId === recipientId);
      return all.length;
    });
  },

  async markRead(id: ID): Promise<INotification> {
    return runApi("notificationsApi", "markRead", () => {
      const updated = patchById("notifications", id, {
        status: "read",
        readAt: new Date().toISOString(),
      });
      if (!updated) throw new MockNotFoundError("notification", id);
      return updated;
    });
  },

  async markAllRead(recipientId?: ID): Promise<number> {
    return runApi("notificationsApi", "markAllRead", () => {
      const readAt = new Date().toISOString();
      let targets = selectAllNotifications().filter((n) => n.status === "unread");
      if (recipientId) targets = targets.filter((n) => n.recipientId === recipientId);

      for (const n of targets) {
        patchById("notifications", n.id, { status: "read", readAt });
      }
      return targets.length;
    });
  },

  async archive(id: ID): Promise<void> {
    return runApi("notificationsApi", "archive", () => {
      const updated = patchById("notifications", id, { status: "archived" });
      if (!updated) throw new MockNotFoundError("notification", id);
    });
  },

  async reconcileDerived(input: {
    recipientScope: ID[];
    upsert: INotification[];
    keepKeys: string[];
  }): Promise<void> {
    return runApi("notificationsApi", "reconcileDerived", () => {
      const now = new Date().toISOString();
      const keepKeys = new Set(input.keepKeys);
      const scope = new Set(input.recipientScope);

      // Expire derived notifications outside keepKeys within scope
      const all = selectAllNotifications();
      for (const n of all) {
        if (
          n.lifecycle === "derived" &&
          scope.has(n.recipientId) &&
          !keepKeys.has(n.dedupeKey) &&
          n.status !== "archived"
        ) {
          patchById("notifications", n.id, { status: "archived", expiresAt: now });
        }
      }

      // Upsert new/updated derived notifications
      for (const notification of input.upsert) {
        upsert("notifications", notification);
      }

      // Add genuinely new derived notifications (not already present)
      const existingKeys = new Set(getMockState().notifications.map((n) => n.dedupeKey));
      for (const notification of input.upsert) {
        if (!existingKeys.has(notification.dedupeKey)) {
          upsert("notifications", notification);
        }
      }
    });
  },
};
