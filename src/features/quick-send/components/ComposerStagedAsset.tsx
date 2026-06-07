// src/features/quick-send/components/ComposerStagedAsset.tsx
import type { IAssetLibraryItem } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IComposerStagedAssetProps {
  item: IAssetLibraryItem;
  contextMessage: string;
  onContextChange: (text: string) => void;
  onSend: () => void;
  onCancel: () => void;
}

const CATEGORY_ICON: Record<IAssetLibraryItem["category"], string> = {
  catalogo: "mdi:book-open-variant",
  ficha_tecnica: "mdi:file-document-outline",
  tabela_preco: "mdi:cash-multiple",
  garantia: "mdi:shield-check-outline",
  video: "mdi:play-circle-outline",
  link: "mdi:link-variant",
};

/** Staged-asset chip above the textarea. Enter sends, Esc cancels (D-4). */
export function ComposerStagedAsset({
  item,
  contextMessage,
  onContextChange,
  onSend,
  onCancel,
}: IComposerStagedAssetProps) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
        <Icon icon={CATEGORY_ICON[item.category]} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{item.title}</p>
        <input
          type="text"
          value={contextMessage}
          onChange={(e) => onContextChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends the staged asset; ⌘/Ctrl+Enter is an explicit "send now"
            // alias (spec §6.2/§8); Esc cancels the staging (D-4).
            if (e.key === "Enter") {
              e.preventDefault();
              onSend();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          placeholder={QUICK_SEND_STRINGS.picker.contextPlaceholder}
          className="mt-0.5 w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          aria-label={QUICK_SEND_STRINGS.picker.contextPlaceholder}
        />
      </div>
      <Button
        type="button"
        size="sm"
        className="h-8 gap-1 px-2.5"
        onClick={onSend}
        aria-label={QUICK_SEND_STRINGS.picker.sendStaged}
      >
        <Icon icon="mdi:send" size={14} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onCancel}
        aria-label={QUICK_SEND_STRINGS.picker.cancelStaged}
      >
        <Icon icon="mdi:close" size={14} />
      </Button>
    </div>
  );
}
