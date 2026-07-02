import { Icon } from "@/components/Icon";
import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl";
import { fileNameFromUrl } from "../../utils/messageDisplay";
import { downloadFileName, triggerMediaDownload } from "../../utils/mediaDownload";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
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

const DOWNLOAD_LABEL: Record<"image" | "video", string> = {
  image: CONVERSATION_STRINGS.downloadImage,
  video: CONVERSATION_STRINGS.downloadVideo,
};

/**
 * One media tile. Audio renders as an inline mini-player; images/videos show a
 * real thumbnail (click opens the viewer, hover reveals a download button);
 * documents are a download button with an icon + label.
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
    "group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40 text-muted-foreground";

  if (item.kind === "document") {
    return (
      <button
        type="button"
        disabled={!url}
        onClick={() =>
          url &&
          triggerMediaDownload(
            url,
            downloadFileName({
              mediaType: "document",
              id: item.id,
              caption: item.caption,
              existingName: item.fileName ?? fileNameFromUrl(item.mediaUrl),
            }),
          )
        }
        className={`${frame} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50`}
        aria-label={`${CONVERSATION_STRINGS.downloadDocument}: ${item.fileName || item.caption || "documento"}`}
      >
        <Icon icon={KIND_ICON.document} size={30} />
        <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-1 py-0.5 text-center text-[10px]">
          {item.fileName || item.caption || "Documento"}
        </span>
      </button>
    );
  }

  return (
    <div className={frame}>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={KIND_LABEL[item.kind]}
      >
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
          <Icon
            icon={isLoading ? "mdi:loading" : "mdi:image-broken-variant"}
            className={isLoading ? "animate-spin" : undefined}
            size={24}
          />
        )}
      </button>
      {url && (item.kind === "image" || item.kind === "video") && (
        <button
          type="button"
          onClick={() =>
            triggerMediaDownload(
              url,
              downloadFileName({ mediaType: item.kind, id: item.id, caption: item.caption }),
            )
          }
          aria-label={DOWNLOAD_LABEL[item.kind]}
          className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 backdrop-blur transition-opacity hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
        >
          <Icon icon="mdi:download" size={14} />
        </button>
      )}
    </div>
  );
}
