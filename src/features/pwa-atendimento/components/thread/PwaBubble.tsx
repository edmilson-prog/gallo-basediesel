import { useState } from "react";
import type { IMessage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { WhatsAppText } from "@/features/conversations/components/bubbles/WhatsAppText";
import { useResolvedMediaUrl } from "@/features/conversations/hooks/useResolvedMediaUrl";
import { downloadFileName } from "@/features/conversations/utils/mediaDownload";
import { PwaMediaViewer } from "../ui/PwaMediaViewer";
import { PWA_ATENDIMENTO_STRINGS as S } from "../../i18n/pt-BR";
import { PwaTicks } from "./PwaTicks";
import { PwaAudioBody } from "./PwaAudioBody";

function timeOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function PwaImageBody({ message, outgoing }: { message: IMessage; outgoing: boolean }) {
  const { data: url, isLoading } = useResolvedMediaUrl(message.mediaUrl);
  const [viewerOpen, setViewerOpen] = useState(false);
  const caption = message.text?.trim();
  return (
    <div className="w-[214px]">
      {url ? (
        // O balão corta a foto (`object-cover`) para a lista não virar uma
        // coluna de alturas irregulares — quem quer ver a foto inteira toca
        // nela. Sem isso o corte seria a única leitura possível.
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          aria-label={S.viewer.open}
          className="block w-full"
        >
          <img
            src={url}
            alt={caption || S.viewer.title}
            loading="lazy"
            className="max-h-[280px] w-full rounded-sm object-cover"
          />
        </button>
      ) : (
        <div
          className={cn(
            "flex h-[158px] items-center justify-center rounded-sm",
            outgoing ? "bg-foreground/10" : "bg-background/10",
          )}
        >
          <Icon
            icon={isLoading ? "mdi:loading" : "mdi:image-off-outline"}
            size={22}
            className={isLoading ? "animate-spin opacity-60" : "opacity-50"}
          />
        </div>
      )}
      {caption && <p className="mt-1.5 text-[13.5px] leading-snug">{caption}</p>}

      <PwaMediaViewer
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        kind="image"
        url={url ?? null}
        caption={caption}
        fileName={downloadFileName({
          mediaType: message.mediaType,
          id: message.id,
          caption: message.text,
        })}
      />
    </div>
  );
}

function PwaDocumentBody({ message, outgoing }: { message: IMessage; outgoing: boolean }) {
  const { data: url } = useResolvedMediaUrl(message.mediaUrl);
  const name = message.mediaFilename || message.text?.trim() || "Documento";
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex min-h-[44px] w-[220px] items-center gap-2.5 rounded-sm px-2.5 py-2",
        outgoing ? "bg-foreground/10" : "bg-background/10",
        !url && "pointer-events-none opacity-60",
      )}
    >
      <Icon icon="mdi:file-document-outline" size={20} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{name}</span>
      <Icon icon="mdi:download" size={16} className="shrink-0 opacity-70" />
    </a>
  );
}

function PwaVideoBody({ message, outgoing }: { message: IMessage; outgoing: boolean }) {
  const { data: url } = useResolvedMediaUrl(message.mediaUrl);
  const caption = message.text?.trim();
  return (
    <div className="w-[214px]">
      {url ? (
        <video src={url} controls playsInline className="max-h-[280px] w-full rounded-sm" />
      ) : (
        <div
          className={cn(
            "flex h-[158px] items-center justify-center rounded-sm",
            outgoing ? "bg-foreground/10" : "bg-background/10",
          )}
        >
          <Icon icon="mdi:video-off-outline" size={22} className="opacity-50" />
        </div>
      )}
      {caption && <p className="mt-1.5 text-[13.5px] leading-snug">{caption}</p>}
    </div>
  );
}

/** Centred pill for lifecycle events (assignment, reopen, status changes). */
export function PwaSystemBubble({ text, at }: { text: string; at: string }) {
  return (
    <div className="flex justify-center py-1.5">
      <span className="rounded-sm bg-foreground/[0.05] px-2.5 py-1.5 text-[11.5px] font-semibold text-muted-foreground ring-1 ring-inset ring-border">
        {text} · {timeOf(at)}
      </span>
    </div>
  );
}

/**
 * One message.
 *
 * The kit's direction cue is a coloured rail, not a tail: incoming sits on
 * "paper" (a light card in a dark app — `bg-foreground` over `text-background`
 * is the honest way to say that with semantic tokens) with a graphite rail on
 * the left; outgoing sits on the muted surface with a gold rail on the right.
 */
export function PwaBubble({ message }: { message: IMessage }) {
  if (message.authorType === "system") {
    return <PwaSystemBubble text={message.text} at={message.sentAt} />;
  }

  const outgoing = message.direction === "out";
  const caption = message.text?.trim();

  const body = (() => {
    switch (message.mediaType) {
      case "audio":
        return <PwaAudioBody message={message} outgoing={outgoing} />;
      case "image":
      case "sticker":
        return <PwaImageBody message={message} outgoing={outgoing} />;
      case "video":
        return <PwaVideoBody message={message} outgoing={outgoing} />;
      case "document":
        return <PwaDocumentBody message={message} outgoing={outgoing} />;
      case "location":
      case "contact":
        return (
          <div className="flex items-center gap-2">
            <Icon
              icon={message.mediaType === "location" ? "mdi:map-marker" : "mdi:account-box"}
              size={18}
            />
            <span className="text-[13.5px] font-semibold">
              {caption || (message.mediaType === "location" ? "Localização" : "Contato")}
            </span>
          </div>
        );
      default:
        return caption ? (
          <WhatsAppText text={caption} className="text-[14.5px] leading-snug" />
        ) : (
          <p className="text-[13.5px] italic opacity-70">Mensagem não suportada</p>
        );
    }
  })();

  return (
    <div className={cn("flex py-[3px]", outgoing ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-[3px] px-3 py-2.5",
          outgoing
            ? "border-r-[3px] border-primary bg-muted text-foreground"
            : "border-l-[3px] border-muted-foreground bg-foreground text-background shadow-sm",
        )}
      >
        {body}
        <div className="mt-1.5 flex items-center justify-end gap-1.5">
          <span className="text-[10.5px] font-semibold tabular-nums opacity-60">
            {timeOf(message.sentAt)}
          </span>
          {outgoing && <PwaTicks status={message.status} />}
        </div>
        {message.status === "failed" && message.failureReason && (
          <p className="mt-1 text-[11px] font-semibold text-severity-critical">
            {message.failureReason}
          </p>
        )}
      </div>
    </div>
  );
}
