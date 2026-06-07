import { useState } from "react";
import type { ID, IAssetLibraryItem } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IComboTrayProps {
  items: IAssetLibraryItem[];
  onReorder: (assetIds: ID[]) => void;
  onRemove: (id: ID) => void;
  onSendAll: () => void;
  progress?: { sent: number; total: number };
}

const CATEGORY_ICON: Record<IAssetLibraryItem["category"], string> = {
  catalogo: "mdi:book-open-variant",
  ficha_tecnica: "mdi:file-document-outline",
  tabela_preco: "mdi:currency-usd",
  garantia: "mdi:shield-check-outline",
  video: "mdi:play-circle-outline",
  link: "mdi:link-variant",
};

/** Move item at `from` to `to`, returning the reordered id list. */
function reorder(items: IAssetLibraryItem[], from: number, to: number): ID[] {
  const ids = items.map((i) => i.id);
  if (to < 0 || to >= ids.length) return ids;
  const [moved] = ids.splice(from, 1);
  ids.splice(to, 0, moved);
  return ids;
}

/**
 * Revisable combo tray above the composer (D-10). Reorder via ▲▼ buttons and
 * keyboard Alt+↑/↓; remove per item; "Enviar todos" delegates the sequential
 * fan-out to the consumer (which uses planComboSend + tolerates partial fail).
 */
export function ComboTray({ items, onReorder, onRemove, onSendAll, progress }: IComboTrayProps) {
  const s = QUICK_SEND_STRINGS.combo;
  const [announcement, setAnnouncement] = useState("");
  if (items.length === 0) return null;
  const sending = progress !== undefined && progress.sent < progress.total;

  /** Reorder an item and announce its new 1-based position to AT (RNF-004). */
  const move = (from: number, to: number) => {
    const dest = Math.max(0, Math.min(items.length - 1, to));
    if (dest === from) return;
    onReorder(reorder(items, from, dest));
    setAnnouncement(s.moved(items[from].title, dest + 1, items.length));
  };

  const handleKey = (e: React.KeyboardEvent<HTMLLIElement>, index: number) => {
    if (!e.altKey) return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      move(index, index - 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(index, index + 1);
    }
  };

  return (
    <div className="border-b border-border bg-muted/30 px-3 py-2" aria-label={s.tray}>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Icon icon="mdi:package-variant-closed" size={14} />
          {s.tray} · {items.length}
        </span>
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-xs"
          onClick={onSendAll}
          disabled={sending}
        >
          {sending ? (
            <>
              <Icon icon="mdi:loading" size={13} className="animate-spin" />
              {s.sending(progress!.sent + 1, progress!.total)}
            </>
          ) : (
            <>
              <Icon icon="mdi:send-outline" size={13} />
              {s.sendAll}
            </>
          )}
        </Button>
      </div>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li
            key={item.id}
            tabIndex={0}
            onKeyDown={(e) => handleKey(e, index)}
            className={cn(
              "flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs",
              "focus:outline-none focus:ring-2 focus:ring-ring",
            )}
          >
            <span className="flex w-5 shrink-0 justify-center text-[10px] font-semibold text-muted-foreground">
              {index + 1}
            </span>
            <Icon
              icon={CATEGORY_ICON[item.category]}
              size={14}
              className="shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 flex-1 truncate text-foreground">{item.title}</span>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                aria-label={s.moveUp}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <Icon icon="mdi:chevron-up" size={14} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                aria-label={s.moveDown}
                disabled={index === items.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <Icon icon="mdi:chevron-down" size={14} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                aria-label={s.remove}
                onClick={() => onRemove(item.id)}
              >
                <Icon icon="mdi:close" size={14} />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
