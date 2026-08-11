import type { MessageStatus } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { statusVisual } from "@/features/conversations/utils/messageDisplay";

/**
 * Delivery ticks of an outgoing message.
 *
 * The icon and colour come from the desktop's `statusVisual`, so a bubble means
 * the same thing on both screens — including the blue double check for "lida".
 */
export function PwaTicks({ status }: { status: MessageStatus }) {
  const visual = statusVisual(status);
  return (
    <Icon icon={visual.icon} size={14} className={visual.className} ariaLabel={visual.label} />
  );
}
