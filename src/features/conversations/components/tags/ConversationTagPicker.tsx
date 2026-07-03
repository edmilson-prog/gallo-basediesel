import { useState } from "react";
import { toast } from "sonner";
import type { IConversation } from "@/shared/types";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/useAuth";
import { useConversationTagsProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { tagColorHex, validateTagLabel } from "../../engine/tagCatalog";
import { useConversationTags } from "../../hooks/useConversationTags";
import { useConversationTagsMutation } from "../../hooks/useConversationTagsMutation";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";

const COPY = CONVERSATION_STRINGS.tags;

export interface IConversationTagPickerProps {
  conversation: IConversation;
  /** Bubbled after a successful write so callers can refresh their own caches. */
  onChanged?: () => void;
  /** Custom trigger; defaults to a ghost "+ Tag" button. */
  trigger?: React.ReactNode;
  align?: "start" | "end";
}

/**
 * Popover + cmdk multi-select of conversation tags. Selection toggles in
 * place (the popover stays open); Escape closes. Inline creation is
 * Owner-only — the catalog is curated.
 */
export function ConversationTagPicker({
  conversation,
  onChanged,
  trigger,
  align = "end",
}: IConversationTagPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { activeTags, tags: allTags } = useConversationTags();
  const { toggleTag, saving } = useConversationTagsMutation(conversation, { onDone: onChanged });
  const { hasRole, currentUser } = useAuth();
  const provider = useConversationTagsProvider();
  const { currentStoreId } = useCurrentStore();
  const queryClient = useQueryClient();
  const isOwner = hasRole("Owner");

  // Archived tags still associated to THIS conversation stay listed so they
  // can be removed; other archived tags are hidden from the picker.
  const selectable = [
    ...activeTags,
    ...allTags.filter((t) => t.archived && conversation.tags.includes(t.id)),
  ];

  const trimmed = search.trim();
  const canCreateInline =
    isOwner && trimmed.length > 0 && validateTagLabel(trimmed, allTags.map((t) => t.label)).ok;

  async function handleCreateInline() {
    if (!currentStoreId || !canCreateInline) return;
    try {
      const created = await provider.create({ storeId: currentStoreId, label: trimmed, color: "slate" });
      await queryClient.invalidateQueries({ queryKey: ["conversation-tags"] });
      await toggleTag(created.id);
      setSearch("");
    } catch {
      toast.error(COPY.createFailed);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            aria-label={COPY.pickerAria}
          >
            <Icon icon="mdi:tag-plus-outline" size={14} />
            {COPY.add}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-0">
        <Command>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={COPY.searchPlaceholder}
          />
          <CommandList className="max-h-64">
            <CommandEmpty>
              {canCreateInline ? (
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-left text-sm text-primary hover:underline"
                  onClick={() => void handleCreateInline()}
                >
                  {COPY.createInline(trimmed)}
                </button>
              ) : (
                COPY.empty
              )}
            </CommandEmpty>
            <CommandGroup>
              {selectable.map((tag) => {
                const checked = conversation.tags.includes(tag.id);
                return (
                  <CommandItem
                    key={tag.id}
                    value={tag.label}
                    disabled={saving}
                    onSelect={() => void toggleTag(tag.id)}
                    className="gap-2"
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tagColorHex(tag.color) }}
                    />
                    <span className="flex-1 truncate">
                      {tag.label}
                      {tag.archived && (
                        <span className="ml-1 text-muted-foreground">{COPY.archivedSuffix}</span>
                      )}
                    </span>
                    {checked && <Icon icon="mdi:check" size={14} className="text-primary" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
