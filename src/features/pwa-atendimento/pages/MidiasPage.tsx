import { useMemo, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import type { ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useConversationMessageMedia } from "@/features/conversations/hooks/useConversationMessageMedia";
import { useConversationDetail } from "@/features/conversations/hooks/useConversationDetail";
import { useResolvedMediaUrl } from "@/features/conversations/hooks/useResolvedMediaUrl";
import { downloadFileName } from "@/features/conversations/utils/mediaDownload";
import type { IConversationMediaItem } from "@/features/conversations/engine/conversationMedia";
import { PwaMediaViewer } from "../components/ui/PwaMediaViewer";
import { shortNameOf } from "../components/ui/statusMeta";
import { PWA_ATENDIMENTO_STRINGS as S } from "../i18n/pt-BR";

type MediaTab = "all" | "image" | "audio" | "document";

const TABS: { id: MediaTab; label: string }[] = [
  { id: "all", label: S.mediaScreen.tabAll },
  { id: "image", label: S.mediaScreen.tabImages },
  { id: "audio", label: S.mediaScreen.tabAudios },
  { id: "document", label: S.mediaScreen.tabDocs },
];

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function MediaCell({ item }: { item: IConversationMediaItem }) {
  // Só foto e vídeo resolvem URL — a assinatura em lote da mídia é território
  // congelado, e resolver documento/áudio aqui mudaria quantos objetos a grade
  // assina de uma vez.
  const viewable = item.kind === "image" || item.kind === "video";
  const { data: url } = useResolvedMediaUrl(viewable ? item.mediaUrl : undefined);
  const [viewerOpen, setViewerOpen] = useState(false);
  const label = item.fileName || item.caption || "";

  const stamp = (
    <span className="mt-1.5 block text-[10px] font-semibold text-muted-foreground/70">
      {item.direction === "out" ? S.mediaScreen.fromMe : S.mediaScreen.fromCustomer} ·{" "}
      {timeLabel(item.sentAt)}
    </span>
  );

  // Vídeo NÃO é foto: mandá-lo para um `<img>` só rende um ícone de imagem
  // quebrada. Ele ganha a mesma placa dos outros arquivos, com o play por cima.
  const tile =
    item.kind === "image" && url ? (
      <img
        src={url}
        alt={label || "Mídia da conversa"}
        loading="lazy"
        className="h-[104px] w-full rounded-sm object-cover ring-1 ring-inset ring-border"
      />
    ) : (
      <div className="relative flex h-[104px] flex-col justify-between rounded-sm bg-card p-2.5 ring-1 ring-inset ring-border">
        <Icon
          icon={
            item.kind === "audio"
              ? "mdi:microphone"
              : item.kind === "video"
                ? "mdi:play-circle-outline"
                : "mdi:file-document-outline"
          }
          size={19}
          className={item.kind === "video" ? "text-foreground" : "text-muted-foreground"}
        />
        <span className="line-clamp-2 font-mono text-[9px] leading-tight text-muted-foreground">
          {label || item.kind}
        </span>
      </div>
    );

  if (!viewable || !url) {
    // Documento e áudio ainda não abrem por aqui (dependeriam de assinar a URL
    // de todo arquivo da grade); ficam inertes em vez de fingir um toque.
    return (
      <div className={cn("block text-left", !viewable && "opacity-80")}>
        {tile}
        {stamp}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setViewerOpen(true)}
        aria-label={item.kind === "video" ? S.viewer.openVideo : S.viewer.open}
        className="block w-full text-left"
      >
        {tile}
        {stamp}
      </button>

      <PwaMediaViewer
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        kind={item.kind === "video" ? "video" : "image"}
        url={url}
        caption={item.caption}
        fileName={downloadFileName({
          mediaType: item.kind,
          id: item.id,
          caption: item.caption,
          existingName: item.fileName,
        })}
      />
    </>
  );
}

export function MidiasPage() {
  const { id } = useParams({ from: "/atendimento/conversa/$id/midias" });
  const conversationId: ID = id;
  const [tab, setTab] = useState<MediaTab>("all");

  const detail = useConversationDetail(conversationId);
  const media = useConversationMessageMedia(conversationId);

  const items = useMemo(
    () =>
      tab === "all"
        ? media.items
        : media.items.filter((item) =>
            // Video lives under "Fotos" here — the kit has four tabs, not five.
            tab === "image" ? item.kind === "image" || item.kind === "video" : item.kind === tab,
          ),
    [media.items, tab],
  );

  const name = detail.contact?.name ?? "Conversa";

  return (
    <>
      <div className="border-b border-border bg-background/95 pl-1 pr-3 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center gap-1.5">
          <Link
            to="/atendimento/conversa/$id"
            params={{ id: conversationId }}
            aria-label={S.thread.back}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-foreground"
          >
            <Icon icon="mdi:chevron-left" size={22} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[19px] font-extrabold uppercase tracking-[0.02em] text-foreground">
              {S.mediaScreen.title}
            </h1>
            <p className="truncate text-[11.5px] text-muted-foreground">
              {shortNameOf(name)} · {S.mediaScreen.countLabel(media.items.length)}
            </p>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto py-2.5 pl-2">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={cn(
                "min-h-[44px] whitespace-nowrap rounded-full px-4 text-xs font-bold",
                tab === entry.id
                  ? "bg-foreground text-background"
                  : "bg-foreground/[0.05] text-muted-foreground ring-1 ring-inset ring-border",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-3.5">
        {media.isLoading ? (
          <p
            aria-busy="true"
            className="flex items-center justify-center gap-2 py-14 text-xs text-muted-foreground"
          >
            <Icon icon="mdi:loading" size={16} className="animate-spin" />
            Carregando mídias…
          </p>
        ) : items.length === 0 ? (
          <p className="py-14 text-center text-[13.5px] text-muted-foreground">
            {S.mediaScreen.empty}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {items.map((item) => (
              <MediaCell key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
