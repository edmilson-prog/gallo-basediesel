import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl";
import { fileNameFromUrl } from "../../utils/messageDisplay";
import { downloadFileName, triggerMediaDownload } from "../../utils/mediaDownload";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import type { ConversationMediaKind, IConversationMediaItem } from "../../engine/conversationMedia";

const DOWNLOAD_LABEL: Record<ConversationMediaKind, string> = {
  image: CONVERSATION_STRINGS.downloadImage,
  video: CONVERSATION_STRINGS.downloadVideo,
  audio: CONVERSATION_STRINGS.downloadAudio,
  document: CONVERSATION_STRINGS.downloadDocument,
};

/** Enlarged viewer for an image/video/audio media item (documents download directly). */
export function MediaViewerDialog({
  item,
  onClose,
}: {
  item: IConversationMediaItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[95dvh] max-w-[96vw] overflow-hidden p-0 [&>button]:hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Visualizar mídia</DialogTitle>
        </DialogHeader>
        {item && <ViewerBody item={item} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ViewerBody({ item, onClose }: { item: IConversationMediaItem; onClose: () => void }) {
  const { data: url, isLoading } = useResolvedMediaUrl(item.mediaUrl);
  const name = downloadFileName({
    mediaType: item.kind,
    id: item.id,
    caption: item.caption,
    existingName: item.kind === "document" ? (item.fileName ?? fileNameFromUrl(item.mediaUrl)) : undefined,
  });

  function handleDownload() {
    if (!url) return;
    triggerMediaDownload(url, name);
  }

  return (
    <div className="flex max-h-[95dvh] flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-background/80 px-3 py-2 backdrop-blur">
        <span className="min-w-0 truncate text-xs text-muted-foreground">{name}</span>
        <div className="flex shrink-0 items-center gap-1">
          {url && (
            <Button
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 px-2.5"
              onClick={handleDownload}
              aria-label={DOWNLOAD_LABEL[item.kind]}
            >
              <Icon icon="mdi:download" size={16} />
              {CONVERSATION_STRINGS.download}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onClose}
            aria-label={CONVERSATION_STRINGS.close}
          >
            <Icon icon="mdi:close" size={18} />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-72 items-center justify-center text-muted-foreground">
            <Icon icon="mdi:loading" className="mr-2 animate-spin" size={20} />
            Carregando…
          </div>
        ) : !url ? (
          <div className="flex h-72 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Icon icon="mdi:image-broken-variant" size={28} />
            <span className="text-sm">Mídia indisponível</span>
          </div>
        ) : (
          <>
            {item.kind === "image" && (
              <img
                src={url}
                alt={item.caption || "Imagem"}
                className="mx-auto max-h-[80dvh] w-auto max-w-full object-contain"
              />
            )}
            {item.kind === "video" && (
              <video
                src={url}
                controls
                autoPlay
                className="mx-auto max-h-[80dvh] w-auto max-w-full bg-black"
              />
            )}
            {item.kind === "audio" && (
              <div className="flex flex-col gap-3 p-6">
                <audio src={url} controls autoPlay className="w-full" />
              </div>
            )}
            {item.caption && item.kind !== "audio" && (
              <p className="border-t border-border bg-card px-4 py-2 text-sm text-foreground">
                {item.caption}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
