import { toast } from "sonner";
import type { INotification } from "@/shared/types";
import type { IChannelResult, INotificationChannel } from "./contract";

/**
 * Active channel — shows an ephemeral toast via sonner, mapping the
 * notification severity to the matching sonner variant.
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
