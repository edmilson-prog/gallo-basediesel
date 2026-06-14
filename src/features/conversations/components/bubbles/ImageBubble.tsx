import { useEffect, useState } from "react";
import type { IMessage } from "@/shared/types";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/Icon";
import { BubbleChrome } from "./bubbleChrome";
import { WhatsAppText } from "./WhatsAppText";
import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl";

export function ImageBubble({ message, onRetry }: { message: IMessage; onRetry?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  // Inbound images are private storage paths; resolve to a signed URL on demand.
  const { data: url, isLoading } = useResolvedMediaUrl(message.mediaUrl);

  // A freshly resolved URL (cache refresh / re-sign) must re-arm the <img>:
  // clear the previous load/error so it retries instead of staying stuck.
  useEffect(() => {
    setLoaded(false);
    setErrored(false);
  }, [url]);

  // No ref at all, the ref resolved to nothing (failed download / forbidden),
  // or the <img> itself failed to load (e.g. an expired/absent object).
  if (!message.mediaUrl || (!isLoading && !url) || errored) {
    return (
      <BubbleChrome message={message} onRetry={onRetry}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon icon="mdi:image-broken" size={16} />
          <span className="text-xs">Imagem indisponível</span>
        </div>
      </BubbleChrome>
    );
  }

  return (
    <>
      <BubbleChrome message={message} onRetry={onRetry} unpadded>
        <button
          type="button"
          onClick={() => url && setOpen(true)}
          className="block w-full overflow-hidden text-left"
          aria-label="Abrir imagem em tamanho maior"
        >
          <div className="relative aspect-[4/3] w-[260px] max-w-full bg-muted">
            {(!loaded || !url) && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <Icon icon="mdi:loading" className="animate-spin" size={20} />
              </div>
            )}
            {url && (
              <img
                src={url}
                alt={message.text || "Foto enviada"}
                className="h-full w-full object-cover"
                loading="lazy"
                onLoad={() => setLoaded(true)}
                onError={() => setErrored(true)}
              />
            )}
          </div>
        </button>
        {message.text && (
          <WhatsAppText
            text={message.text}
            className="whitespace-pre-wrap break-words px-3 py-2 text-sm"
          />
        )}
      </BubbleChrome>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-0">
          <DialogTitle className="sr-only">{message.text || "Imagem"}</DialogTitle>
          <DialogDescription className="sr-only">
            Visualização da imagem em tamanho maior
          </DialogDescription>
          {url && <img src={url} alt={message.text || "Foto"} className="w-full" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
