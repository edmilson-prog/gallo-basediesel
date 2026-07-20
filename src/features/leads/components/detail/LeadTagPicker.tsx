import { useState } from "react";
import type { IConversationTag } from "@/shared/types";
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
import { tagColorHex } from "@/features/conversations/engine/tagCatalog";
import { hasTag, matchCatalogTag, removeTag, toggleTag } from "../../utils/leadTagCatalog";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

const COPY = LEADS_STRINGS.detail;

export interface ILeadTagPickerProps {
  /** Selected tag labels (draft state). */
  selected: string[];
  /** The store's conversation-tag catalog (archived included). */
  catalog: IConversationTag[];
  onChange: (next: string[]) => void;
}

/**
 * Pick-only tag editor for the lead: selected chips (removable) + a cmdk
 * popover that toggles labels from the curated conversation-tag catalog. New
 * tags are created only in Configurações → Tags (Owner-curated), never here.
 */
export function LeadTagPicker({ selected, catalog, onChange }: ILeadTagPickerProps) {
  const [open, setOpen] = useState(false);
  const activeTags = catalog.filter((t) => !t.archived);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((label) => {
        const match = matchCatalogTag(label, catalog);
        return (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2 py-1 text-xs text-foreground"
          >
            {match ? (
              <span
                aria-hidden
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: tagColorHex(match.color) }}
              />
            ) : (
              <Icon icon="mdi:tag-outline" size={12} className="text-muted-foreground" />
            )}
            {label}
            <button
              type="button"
              aria-label={`Remover ${label}`}
              className="cursor-pointer text-muted-foreground hover:text-foreground"
              onClick={() => onChange(removeTag(selected, label))}
            >
              <Icon icon="mdi:close" size={12} />
            </button>
          </span>
        );
      })}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 cursor-pointer gap-1 px-2 text-xs text-muted-foreground"
            aria-label={COPY.addTagAria}
          >
            <Icon icon="mdi:tag-plus-outline" size={14} />
            {COPY.addTag}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <Command>
            <CommandInput placeholder={COPY.searchTagPlaceholder} />
            <CommandList className="max-h-64">
              <CommandEmpty>{COPY.noCatalogTags}</CommandEmpty>
              <CommandGroup>
                {activeTags.map((tag) => {
                  const checked = hasTag(selected, tag.label);
                  return (
                    <CommandItem
                      key={tag.id}
                      value={tag.label}
                      onSelect={() => onChange(toggleTag(selected, tag.label))}
                      className="cursor-pointer gap-2"
                    >
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: tagColorHex(tag.color) }}
                      />
                      <span className="flex-1 truncate">{tag.label}</span>
                      {checked && <Icon icon="mdi:check" size={14} className="text-primary" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
