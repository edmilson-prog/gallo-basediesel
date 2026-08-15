import type { IMessage } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { BubbleChrome, type IBubbleProps } from "./bubbleChrome";
import { WhatsAppText } from "./WhatsAppText";
import { fileNameFromUrl, formatFileSize, mediaIcon } from "../../utils/messageDisplay";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl";
import { downloadFileName, triggerMediaDownload } from "../../utils/mediaDownload";

function deterministicSize(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return 80_000 + (Math.abs(h) % 4_500_000);
}

export function DocumentBubble({ message, onRetry, ...extras }: IBubbleProps) {
  // Inbound documents/videos are private storage paths; sign on demand for the
  // download link. When unresolved (failed download), the link is hidden.
  const { data: url } = useResolvedMediaUrl(message.mediaUrl);
  const fileName = message.mediaFilename || fileNameFromUrl(message.mediaUrl) || "anexo.pdf";
  const size = formatFileSize(deterministicSize(message.id));
  const icon = mediaIcon(message.mediaType, fileName);

  return (
    <BubbleChrome message={message} onRetry={onRetry} {...extras}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon icon={icon} size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
          <p className="text-[11px] text-muted-foreground">{size}</p>
        </div>
        {url && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            aria-label={CONVERSATION_STRINGS.download}
            onClick={() =>
              triggerMediaDownload(
                url,
                downloadFileName({
                  mediaType: message.mediaType,
                  id: message.id,
                  caption: message.text,
                  existingName: fileName,
                }),
              )
            }
          >
            <Icon icon="mdi:download" size={16} />
          </Button>
        )}
      </div>
      {message.text && (
        <WhatsAppText
          text={message.text}
          className="whitespace-pre-wrap break-words mt-2 text-sm"
        />
      )}
    </BubbleChrome>
  );
}
