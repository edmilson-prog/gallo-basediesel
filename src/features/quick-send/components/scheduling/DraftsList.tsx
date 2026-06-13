import type { IScheduledSend } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

export interface IDraftsListProps {
  /** Items with status === "draft". */
  items: IScheduledSend[];
  /** Opens the composer in edit mode to give the draft a time. */
  onEdit: (item: IScheduledSend) => void;
  onDelete: (item: IScheduledSend) => void;
}

export function DraftsList({ items, onEdit, onDelete }: IDraftsListProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {s.draftsTitle(items.length)}
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-2.5 rounded-md border border-dashed border-border bg-muted/20 p-3"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-background text-muted-foreground">
              <Icon icon="mdi:file-edit-outline" size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">
                {item.payload.contextMessage?.trim() ||
                  (item.payload.type === "media" ? item.payload.fileName : "") ||
                  s.payloadSnippet}
              </p>
              <p className="text-[11px] text-muted-foreground">{s.draftNoTime}</p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => onEdit(item)}>
                {s.setTime}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-severity-critical hover:text-severity-critical"
                aria-label={s.deleteDraft}
                onClick={() => onDelete(item)}
              >
                <Icon icon="mdi:trash-can-outline" size={14} />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
