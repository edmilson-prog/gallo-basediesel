import type { IScheduledSend } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";
import { ScheduledItemCard } from "./ScheduledItemCard";

export interface IScheduledQueueListProps {
  /** Already filtered to pending/sent/failed (no drafts, no cancelled). */
  items: IScheduledSend[];
  onEdit: (item: IScheduledSend) => void;
  onCancel: (item: IScheduledSend) => void;
  /** Switches the shell to the "Novo" tab. */
  onCreate?: () => void;
}

export function ScheduledQueueList({ items, onEdit, onCancel, onCreate }: IScheduledQueueListProps) {
  const s = QUICK_SEND_STRINGS.schedule;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Icon icon="mdi:calendar-blank-outline" size={32} className="text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">{s.emptyConversation}</p>
        {onCreate && (
          <Button type="button" variant="outline" size="sm" onClick={onCreate}>
            {s.createCta}
          </Button>
        )}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <ScheduledItemCard item={item} onEdit={onEdit} onCancel={onCancel} />
        </li>
      ))}
    </ul>
  );
}
