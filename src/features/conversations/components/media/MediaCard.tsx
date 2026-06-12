import { MediaThumb } from "./MediaThumb";
import { AudioMediaTile } from "./AudioMediaTile";
import { MEDIA_KIND_LABEL, type IConversationMediaItem } from "../../engine/conversationMedia";

/** Short, locale-aware date for the card subtitle (e.g. "12 jun"). */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/**
 * "Cartões" layout tile: a real thumbnail plus a caption + author/date line —
 * the conversation-media equivalent of the Vault's name/classification card.
 * Audio uses the inline mini-player, which already carries its own metadata.
 */
export function MediaCard({
  item,
  onOpen,
}: {
  item: IConversationMediaItem;
  onOpen: (item: IConversationMediaItem) => void;
}) {
  if (item.kind === "audio") {
    return (
      <div className="flex flex-col gap-1.5">
        {item.caption && (
          <p className="min-w-0 truncate px-0.5 text-xs font-medium text-foreground">
            {item.caption}
          </p>
        )}
        <AudioMediaTile item={item} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <MediaThumb item={item} onOpen={onOpen} />
      <div className="min-w-0 px-0.5">
        <p className="truncate text-xs font-medium text-foreground">
          {item.caption || MEDIA_KIND_LABEL[item.kind]}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {item.direction === "in" ? "Recebida" : "Enviada"} · {shortDate(item.sentAt)}
        </p>
      </div>
    </div>
  );
}
