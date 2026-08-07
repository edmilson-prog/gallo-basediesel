// src/features/quick-send/components/SlashMenu.tsx
import type { IAssetLibraryItem, IPixKey, IQuickReply } from "@/shared/types";
import type { ISlashState } from "../engine/slashParser";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { PIX_STRINGS, PIX_TYPE_ICON, PIX_TYPE_LABEL, toDisplayPixKey } from "@/features/pix";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface ISlashMenuProps {
  state: ISlashState;
  items: IAssetLibraryItem[];
  replies: IQuickReply[];
  /** Active PIX keys matching the typed command (empty when none apply). */
  pixKeys: IPixKey[];
  /** Index of the highlighted entry (assets, then replies, then PIX keys). */
  activeIndex: number;
  onPickAsset: (item: IAssetLibraryItem) => void;
  onPickReply: (reply: IQuickReply) => void;
  onPickPixKey: (key: IPixKey) => void;
  onClose: () => void;
}

/**
 * Popover anchored above the textarea while a slash command is being typed.
 * Read-only: the parser owns activeness; keyboard nav is driven by MessageInput
 * (the parent updates `activeIndex` and calls the right onPick on Enter).
 */
export function SlashMenu({
  state,
  items,
  replies,
  pixKeys,
  activeIndex,
  onPickAsset,
  onPickReply,
  onPickPixKey,
  onClose,
}: ISlashMenuProps) {
  if (!state.active) return null;

  const total = items.length + replies.length + pixKeys.length;

  return (
    <div
      className="absolute bottom-full left-0 z-30 mb-1 max-h-64 w-80 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
      role="listbox"
      id="slash-listbox"
      aria-label={QUICK_SEND_STRINGS.slash.menuLabel}
    >
      {total === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          <p>{QUICK_SEND_STRINGS.slash.emptyState}</p>
          <p className="mt-1 opacity-70">{QUICK_SEND_STRINGS.slash.literalSlashHint}</p>
        </div>
      ) : (
        <>
          {items.map((item, i) => (
            <button
              key={item.id}
              id={`slash-opt-${i}`}
              type="button"
              role="option"
              aria-selected={activeIndex === i}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                activeIndex === i ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                onPickAsset(item);
              }}
            >
              <Icon icon="mdi:file-send-outline" size={15} className="shrink-0 text-muted-foreground" />
              <span className="truncate">{item.title}</span>
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{item.brand}</span>
            </button>
          ))}
          {replies.map((reply, j) => {
            const idx = items.length + j;
            return (
              <button
                key={reply.id}
                id={`slash-opt-${idx}`}
                type="button"
                role="option"
                aria-selected={activeIndex === idx}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  activeIndex === idx ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPickReply(reply);
                }}
              >
                <Icon icon="mdi:lightning-bolt-outline" size={15} className="shrink-0 text-muted-foreground" />
                <span className="truncate">{reply.title}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                  {reply.shortcut}
                </span>
              </button>
            );
          })}
          {pixKeys.map((key, k) => {
            const idx = items.length + replies.length + k;
            return (
              <button
                key={key.id}
                id={`slash-opt-${idx}`}
                type="button"
                role="option"
                aria-selected={activeIndex === idx}
                // The alias alone does not let someone decide blind — and "blind"
                // here includes the attendant working fast. Type and key go in.
                aria-label={`${PIX_STRINGS.composer.menuItem} ${key.alias}, ${
                  PIX_TYPE_LABEL[key.keyType]
                }, ${toDisplayPixKey(key.keyType, key.keyValue)}`}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  activeIndex === idx ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPickPixKey(key);
                }}
              >
                <Icon
                  icon={PIX_TYPE_ICON[key.keyType]}
                  size={15}
                  className="shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="truncate">{key.alias}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                  {key.shortcut ?? PIX_STRINGS.composer.menuHint}
                </span>
              </button>
            );
          })}
        </>
      )}
      <button type="button" className="sr-only" onClick={onClose}>
        {QUICK_SEND_STRINGS.slash.close}
      </button>
    </div>
  );
}
