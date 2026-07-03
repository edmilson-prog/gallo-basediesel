import type { IConversation } from "@/shared/types";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { splitVisibleTags, resolveConversationTags } from "../../engine/tagCatalog";
import { useConversationTags } from "../../hooks/useConversationTags";
import { useConversationTagsHeaderMode } from "../../hooks/useConversationTagsHeaderMode";
import { useConversationTagsMutation } from "../../hooks/useConversationTagsMutation";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import { ConversationTagChip, TagOverflowChip } from "./ConversationTagChip";
import { ConversationTagPicker } from "./ConversationTagPicker";

const COPY = CONVERSATION_STRINGS.tags;
const TITLE_MAX_CHIPS = 3;

export interface IConversationHeaderTagsProps {
  conversation: IConversation;
  /** "title" = chip row beside the name; "band" = dedicated strip below the header. */
  area: "title" | "band";
  onChanged?: () => void;
}

/**
 * Renders the conversation tags in the header according to the Owner's
 * headerMode parameter:
 *  - readonly  → chips (read-only) in the title row; no band.
 *  - quick-add → chips + a "+" picker trigger in the title row; no band.
 *  - band      → nothing in the title row; a full strip with removable chips.
 */
export function ConversationHeaderTags({ conversation, area, onChanged }: IConversationHeaderTagsProps) {
  const mode = useConversationTagsHeaderMode();
  const { tags: catalog } = useConversationTags();
  const canEdit = usePermission("conversation", "edit", "own");
  const { toggleTag } = useConversationTagsMutation(conversation, { onDone: onChanged });

  const tags = resolveConversationTags(conversation.tags, catalog);

  if (area === "title") {
    if (mode === "band") return null;
    const { visible, overflow } = splitVisibleTags(tags, TITLE_MAX_CHIPS);
    return (
      <>
        {visible.map((tag) => (
          <ConversationTagChip key={tag.id} tag={tag} />
        ))}
        <TagOverflowChip tags={overflow} />
        {mode === "quick-add" && canEdit && (
          <ConversationTagPicker conversation={conversation} onChanged={onChanged} />
        )}
      </>
    );
  }

  // area === "band"
  if (mode !== "band") return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 bg-muted/40 px-4 py-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {COPY.sectionLabel}
      </span>
      {tags.map((tag) => (
        <ConversationTagChip
          key={tag.id}
          tag={tag}
          onRemove={canEdit ? () => void toggleTag(tag.id) : undefined}
        />
      ))}
      {canEdit && (
        <ConversationTagPicker
          conversation={conversation}
          onChanged={onChanged}
          trigger={
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-primary transition-colors hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring motion-reduce:transition-none"
              aria-label={COPY.pickerAria}
            >
              {COPY.addShort}
            </button>
          }
        />
      )}
    </div>
  );
}
