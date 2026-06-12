import { Icon } from "@/components/Icon";
import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl";
import { AudioMediaTile } from "./AudioMediaTile";
import type { ConversationMediaKind, IConversationMediaItem } from "../../engine/conversationMedia";

const KIND_ICON: Record<ConversationMediaKind, string> = {
  image: "mdi:image-outline",
  audio: "mdi:waveform",
  video: "mdi:play-circle-outline",
  document: "mdi:file-document-outline",
};

const KIND_LABEL: Record<ConversationMediaKind, string> = {
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
};

/**
 * One media tile. Audio renders as an inline mini-player; images/videos show a
 * real thumbnail; documents show an icon + label. Clicking an image/video opens
 * the viewer — documents download directly via an anchor.
 */
export function MediaThumb({
  item,
  onOpen,
}: {
  item: IConversationMediaItem;
  onOpen: (item: IConversationMediaItem) => void;
}) {
  if (item.kind === "audio") return <AudioMediaTile item={item} />;
  return <VisualThumb item={item} onOpen={onOpen} />;
}

/** Image / video / document tile (everything except inline audio). */
function VisualThumb({
  item,
  onOpen,
}: {
  item: IConversationMediaItem;
  onOpen: (item: IConversationMediaItem) => void;
}) {
  const { data: url, isLoading } = useResolvedMediaUrl(item.mediaUrl);

  const frame =
    "group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  if (item.kind === "document") {
    return (
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        download
        className={frame}
        aria-label={`Baixar ${item.caption || "documento"}`}
        onClick={(e) => {
          if (!url) e.preventDefault();
        }}
      >
        <Icon icon={KIND_ICON.document} size={30} />
        <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-1 py-0.5 text-center text-[10px]">
          {item.caption || "Documento"}
        </span>
      </a>
    );
  }

  return (
    <button type="button" onClick={() => onOpen(item)} className={frame} aria-label={KIND_LABEL[item.kind]}>
      {item.kind === "image" && url ? (
        <img src={url} alt={item.caption || "Imagem"} loading="lazy" className="h-full w-full object-cover" />
      ) : item.kind === "video" && url ? (
        <>
          <video src={url} muted preload="metadata" className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
            <Icon icon="mdi:play-circle" size={34} />
          </span>
        </>
      ) : (
        // loading / unresolved image|video
        <Icon
          icon={isLoading ? "mdi:loading" : "mdi:image-broken-variant"}
          className={isLoading ? "animate-spin" : undefined}
          size={24}
        />
      )}
    </button>
  );
}
