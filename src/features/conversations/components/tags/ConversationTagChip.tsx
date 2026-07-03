import type { IConversationTag } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { tagColorHex } from "../../engine/tagCatalog";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";

const COPY = CONVERSATION_STRINGS.tags;

export interface IConversationTagChipProps {
  tag: IConversationTag;
  /** "sm" = header/fiche (11px); "xs" = inbox row (10px). */
  size?: "sm" | "xs";
  /** When provided, renders a keyboard-accessible remove button. */
  onRemove?: () => void;
  className?: string;
}

/**
 * Identity pill for a conversation tag: neutral chip + colored dot. Follows
 * the visual grammar — tags are rounded-full with a dot (identity), while
 * status badges stay rounded-md with semantic tones (state).
 */
export function ConversationTagChip({ tag, size = "sm", onRemove, className }: IConversationTagChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-muted text-foreground",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-px text-[10px]",
        tag.archived && "opacity-60",
        className,
      )}
      title={tag.archived ? `${tag.label} ${COPY.archivedSuffix}` : tag.label}
    >
      <span
        aria-hidden
        className={cn("shrink-0 rounded-full", size === "sm" ? "size-2" : "size-1.5")}
        style={{ backgroundColor: tagColorHex(tag.color) }}
      />
      <span className={cn("truncate", size === "sm" ? "max-w-[7rem]" : "max-w-[5.5rem]")}>{tag.label}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={COPY.removeAria(tag.label)}
          className="-mr-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring motion-reduce:transition-none"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Icon icon="mdi:close" size={size === "sm" ? 11 : 10} />
        </button>
      )}
    </span>
  );
}

/** "+N" overflow chip with a tooltip listing the hidden tags. */
export function TagOverflowChip({ tags, size = "sm" }: { tags: IConversationTag[]; size?: "sm" | "xs" }) {
  if (tags.length === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={COPY.overflowAria(tags.length)}
          className={cn(
            "inline-flex items-center rounded-full border border-border bg-muted text-muted-foreground",
            size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-px text-[10px]",
          )}
        >
          +{tags.length}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{tags.map((t) => t.label).join(" · ")}</TooltipContent>
    </Tooltip>
  );
}
