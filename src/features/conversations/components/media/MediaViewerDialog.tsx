import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/Icon";
import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl";
import type { IConversationMediaItem } from "../../engine/conversationMedia";

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
      <DialogContent className="max-w-3xl overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Visualizar mídia</DialogTitle>
        </DialogHeader>
        {item && <ViewerBody item={item} />}
      </DialogContent>
    </Dialog>
  );
}

function ViewerBody({ item }: { item: IConversationMediaItem }) {
  const { data: url, isLoading } = useResolvedMediaUrl(item.mediaUrl);

  if (isLoading) {
    return (
      <div className="flex h-72 items-center justify-center text-muted-foreground">
        <Icon icon="mdi:loading" className="mr-2 animate-spin" size={20} />
        Carregando…
      </div>
    );
  }
  if (!url) {
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-2 text-muted-foreground">
        <Icon icon="mdi:image-broken-variant" size={28} />
        <span className="text-sm">Mídia indisponível</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {item.kind === "image" && (
        <img src={url} alt={item.caption || "Imagem"} className="max-h-[80vh] w-full object-contain" />
      )}
      {item.kind === "video" && (
        <video src={url} controls autoPlay className="max-h-[80vh] w-full bg-black" />
      )}
      {item.kind === "audio" && (
        <div className="flex flex-col gap-3 p-6">
          <audio src={url} controls autoPlay className="w-full" />
        </div>
      )}
      {item.caption && (
        <p className="border-t border-border bg-card px-4 py-2 text-sm text-foreground">
          {item.caption}
        </p>
      )}
    </div>
  );
}
