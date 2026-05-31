import { toast } from "sonner";
import type { INotification } from "@/shared/types";
import type { IChannelResult, INotificationChannel } from "./contract";

/**
 * Active channel — shows an ephemeral toast via sonner, mapping the
 * notification severity to the matching sonner variant.
 *
 * Migration note (PRD-008 Task 4.4): existing feature call-sites still invoke
 * `toast()` from sonner directly. They are intentionally NOT rerouted through
 * this channel in PRD-008 — driving them via the bus/router would also persist
 * an in-app notification (a visible behaviour change), and the UI is validated
 * manually. Consolidating those call-sites through ToastChannel is deferred to
 * PRD-009 (Chime), where the Notification Center unifies toasts and the bell.
 */
export function makeToastChannel(): INotificationChannel {
  return {
    channel: "toast",
    async send(notification: INotification): Promise<IChannelResult> {
      const options = notification.body ? { description: notification.body } : undefined;
      switch (notification.severity) {
        case "success":
          toast.success(notification.title, options);
          break;
        case "warning":
          toast.warning(notification.title, options);
          break;
        case "critical":
          toast.error(notification.title, options);
          break;
        case "info":
        default:
          toast.info(notification.title, options);
      }
      return { status: "sent" };
    },
  };
}
