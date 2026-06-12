import { useMemo, useState } from "react";
import type { ID } from "@/shared/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Icon } from "@/components/Icon";
import { useMediaViewMode, type MediaViewMode } from "@/features/media";
import { useConversationMessageMedia } from "../../hooks/useConversationMessageMedia";
import {
  DEFAULT_MEDIA_FILTERS,
  countByKind,
  filterMediaItems,
  groupMediaByType,
  type ConversationMediaKind,
  type IConversationMediaFilters,
  type IConversationMediaItem,
  type MediaAuthorFilter,
  type MediaPeriodFilter,
} from "../../engine/conversationMedia";
import { MediaThumb } from "./MediaThumb";
import { MediaCard } from "./MediaCard";
import { MediaViewerDialog } from "./MediaViewerDialog";

interface IProps {
  conversationId: ID;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const KIND_CHIPS: { key: "all" | ConversationMediaKind; label: string; icon: string | null }[] = [
  { key: "all", label: "Todos", icon: null },
  { key: "image", label: "Imagens", icon: "mdi:image-outline" },
  { key: "document", label: "Docs", icon: "mdi:file-document-outline" },
  { key: "audio", label: "Áudios", icon: "mdi:waveform" },
  { key: "video", label: "Vídeos", icon: "mdi:video-outline" },
];

// Same icons as the Vault gallery switcher (visual parity with the previous panel),
// with tooltips worded for this context.
const VIEW_MODES: { value: MediaViewMode; icon: string; label: string }[] = [
  { value: "grade", icon: "mdi:view-grid-outline", label: "Grade" },
  { value: "cartoes", icon: "mdi:view-agenda-outline", label: "Cartões" },
  { value: "tipo", icon: "mdi:format-list-group", label: "Por tipo" },
];

/** Side sheet (scope=conversation) showing the conversation's real media,
 *  derived from messages — replaces the Vault gallery here (PR #71 follow-up). */
export function ConversationMediaPanel({ conversationId, open, onOpenChange }: IProps) {
  const { items, isLoading, isError, refetch } = useConversationMessageMedia(conversationId, open);
  const [viewMode, setViewMode] = useMediaViewMode();
  const [filters, setFilters] = useState<IConversationMediaFilters>(DEFAULT_MEDIA_FILTERS);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<IConversationMediaItem | null>(null);

  const counts = useMemo(() => countByKind(items), [items]);

  const filtered = useMemo(() => {
    const base = filterMediaItems(items, filters, Date.now());
    const term = search.trim().toLowerCase();
    return term ? base.filter((i) => (i.caption ?? "").toLowerCase().includes(term)) : base;
  }, [items, filters, search]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="text-sm font-semibold">Mídias</SheetTitle>
        </SheetHeader>

        {/* Search + view switcher */}
        <div className="flex items-center gap-2 px-4 pt-3">
          <div className="relative flex-1">
            <Icon
              icon="mdi:magnify"
              size={16}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por legenda"
              className="h-9 pl-8"
            />
          </div>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as MediaViewMode)}
            className="shrink-0 rounded-lg bg-muted/40 p-1"
            aria-label="Modo de visualização"
          >
            {VIEW_MODES.map((m) => (
              <Tooltip key={m.value}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value={m.value}
                    aria-label={m.label}
                    className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
                  >
                    <Icon icon={m.icon} size={18} />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>{m.label}</TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>
        </div>

        {/* Kind chips */}
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {KIND_CHIPS.map((chip) => {
            const activeChip = filters.kind === chip.key;
            const count = chip.key === "all" ? items.length : counts[chip.key];
            return (
              <Button
                key={chip.key}
                type="button"
                variant={activeChip ? "default" : "outline"}
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => setFilters((f) => ({ ...f, kind: chip.key }))}
              >
                {chip.icon && <Icon icon={chip.icon} size={13} />}
                {chip.label}
                <span className={activeChip ? "opacity-80" : "text-muted-foreground"}>{count}</span>
              </Button>
            );
          })}
        </div>

        {/* Author + period */}
        <div className="flex gap-2 px-4 pt-3">
          <Select
            value={filters.author}
            onValueChange={(v) => setFilters((f) => ({ ...f, author: v as MediaAuthorFilter }))}
          >
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os autores</SelectItem>
              <SelectItem value="in">Recebidas</SelectItem>
              <SelectItem value="out">Enviadas</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.period}
            onValueChange={(v) => setFilters((f) => ({ ...f, period: v as MediaPeriodFilter }))}
          >
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Qualquer data</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Body */}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
              <Icon icon="mdi:loading" className="mr-2 animate-spin" size={16} />
              Carregando mídias…
            </div>
          ) : isError ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <Icon icon="mdi:alert-circle-outline" size={26} className="text-severity-critical" />
              <span className="text-sm">Não foi possível carregar as mídias.</span>
              <Button variant="outline" size="sm" onClick={refetch}>
                Tentar novamente
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <Icon icon="mdi:image-off-outline" size={26} />
              <span className="text-sm">
                {items.length === 0 ? "Nenhuma mídia ainda." : "Nenhuma mídia para os filtros."}
              </span>
            </div>
          ) : viewMode === "grade" ? (
            <div className="grid grid-cols-3 items-start gap-2">
              {filtered.map((item) => (
                <MediaThumb key={item.id} item={item} onOpen={setActive} />
              ))}
            </div>
          ) : viewMode === "cartoes" ? (
            <div className="grid grid-cols-2 items-start gap-3">
              {filtered.map((item) => (
                <MediaCard key={item.id} item={item} onOpen={setActive} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {groupMediaByType(filtered).map((group) => (
                <section key={group.key}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label} · {group.items.length}
                  </h3>
                  <div className="grid grid-cols-3 items-start gap-2">
                    {group.items.map((item) => (
                      <MediaThumb key={item.id} item={item} onOpen={setActive} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </SheetContent>

      <MediaViewerDialog item={active} onClose={() => setActive(null)} />
    </Sheet>
  );
}
