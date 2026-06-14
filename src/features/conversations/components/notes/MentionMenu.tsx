import type { ISeller } from "@/shared/types";
import { cn } from "@/lib/utils";
import { initialsFrom } from "@/shared/utils/avatar";
import { sellerDisplay } from "../../engine/conversationNotes";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";

const S = CONVERSATION_STRINGS.conversationNotes;

export interface IMentionMenuProps {
  candidates: ISeller[];
  /** Highlighted entry index, driven by the composer's keyboard nav. */
  activeIndex: number;
  onPick: (seller: ISeller) => void;
}

/**
 * Popover anchored above the note composer while an `@mention` is being typed.
 * Mirrors quick-send's SlashMenu: the parent owns activeness and keyboard nav.
 */
export function MentionMenu({ candidates, activeIndex, onPick }: IMentionMenuProps) {
  return (
    <div
      className="absolute bottom-full left-0 z-30 mb-1 max-h-56 w-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
      role="listbox"
      aria-label={S.mentionMenuLabel}
    >
      {candidates.length === 0 ? (
        <div className="px-3 py-3 text-center text-xs text-muted-foreground">{S.mentionEmpty}</div>
      ) : (
        candidates.map((seller, i) => {
          const display = sellerDisplay(seller);
          return (
            <button
              key={seller.id}
              type="button"
              role="option"
              aria-selected={activeIndex === i}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                activeIndex === i ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(seller);
              }}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                {initialsFrom(display)}
              </span>
              <span className="truncate">{display}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
