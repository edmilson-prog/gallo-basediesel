import type { IScheduledSend, IScheduledSendWithContext } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";
import { ScheduledItemCard } from "./ScheduledItemCard";

export interface IGlobalQueueListProps {
  items: IScheduledSendWithContext[];
  isLoading: boolean;
  onEdit: (item: IScheduledSend) => void;
  onCancel: (item: IScheduledSend) => void;
}

/** Store-wide pending queue (Owner/Gestor). Each card shows the recipient. */
export function GlobalQueueList({ items, isLoading, onEdit, onCancel }: IGlobalQueueListProps) {
  const s = QUICK_SEND_STRINGS.schedule;

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">…</p>;
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Icon icon="mdi:calendar-blank-outline" size={32} className="text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">{s.emptyGlobal}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <ScheduledItemCard
            item={item}
            recipient={item.customerName ?? item.customerPhone}
            onEdit={onEdit}
            onCancel={onCancel}
          />
        </li>
      ))}
    </ul>
  );
}
