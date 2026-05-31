import { toast } from "sonner";
import type { INotification } from "@/shared/types";
import type { IChannelResult, INotificationChannel } from "./contract";

/**
 * Active channel — shows an ephemeral toast via sonner, mapping the
 * notification severity to the matching sonner variant.
 *
 * Presentation boundary (resolved in PRD-009 / Chime). There are two distinct
 * kinds of toast and they stay separate by design:
 *   1. Ephemeral action feedback — CRUD success/error and PRD-011 "Desfazer"
 *      (undo) toasts keep calling sonner `toast()` directly at the call-site.
 *      These are transient UI confirmations, NOT notifications: routing them
 *      through the bus would persist a bell/center entry (a real UX regression),
 *      so they are intentionally left as direct toasts.
 *   2. Notification-driven toasts — domain events the user should ALSO find in
 *      the bell/center flow event → bus → router → this ToastChannel, which is
 *      the single canonical presentation (severity → sonner variant).
 * Net: no existing call-sites are rerouted; ToastChannel owns the
 * notification-toast presentation. Toasts stay consistent without the
 * Notification Center being polluted by ephemeral feedback.
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
