// src/features/media/components/MediaFilters.tsx
import type { IMediaAsset, IMediaClassification } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { IUseMediaFilters } from "../hooks/useMediaFilters";
import type { MediaViewMode } from "../hooks/useMediaViewMode";
import { MediaViewSwitcher } from "./MediaViewSwitcher";
import { MEDIA_STRINGS } from "../i18n/pt-BR";

interface IMediaFiltersProps {
  filtersApi: IUseMediaFilters;
  viewMode: MediaViewMode;
  onViewModeChange: (m: MediaViewMode) => void;
}

const KINDS: IMediaAsset["kind"][] = ["image", "document", "audio", "video"];
const AUTHORS: IMediaAsset["authorType"][] = ["customer", "seller", "sdr", "system"];
const PERIODS = ["all", "7d", "30d", "90d"] as const;
const CLASSIFICATIONS: IMediaClassification[] = [
  "nota_fiscal",
  "peca",
  "chassi_placa",
  "comprovante",
  "catalogo",
  "outro",
];

export function MediaFilters({ filtersApi, viewMode, onViewModeChange }: IMediaFiltersProps) {
  const { scope, filters, setFilter, reset, activeCount } = filtersApi;
  const s = MEDIA_STRINGS.filters;

  return (
    <div className="flex flex-col gap-2 border-b border-border bg-card px-3 py-2">
      {/* Row 1: search + switcher */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
            placeholder={s.searchPlaceholder}
            aria-label={s.searchLabel}
            className="h-8 pl-8 pr-8 text-sm"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => setFilter("search", "")}
              aria-label={s.clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <Icon icon="mdi:close-circle" size={15} />
            </button>
          )}
        </div>
        <MediaViewSwitcher mode={viewMode} onChange={onViewModeChange} />
      </div>

      {/* Row 2: kind toggle + selects */}
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          value={filters.kind}
          onValueChange={(v) => setFilter("kind", (v || "all") as typeof filters.kind)}
          aria-label={s.kindLabel}
          className="rounded-md border border-border p-0.5"
        >
          <ToggleGroupItem value="all" className="h-7 px-2 text-xs">
            {s.kindAll}
          </ToggleGroupItem>
          {KINDS.map((k) => (
            <Tooltip key={k}>
              <TooltipTrigger asChild>
                <ToggleGroupItem value={k} aria-label={s.kind[k]} className="h-7 w-7 p-0">
                  <Icon
                    icon={
                      k === "image"
                        ? "mdi:image-outline"
                        : k === "document"
                          ? "mdi:file-document-outline"
                          : k === "audio"
                            ? "mdi:waveform"
                            : "mdi:video-outline"
                    }
                    size={15}
                  />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent>{s.kind[k]}</TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>

        <Select
          value={filters.authorType}
          onValueChange={(v) => setFilter("authorType", v as typeof filters.authorType)}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs" aria-label={s.authorLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{s.authorAll}</SelectItem>
            {AUTHORS.map((a) => (
              <SelectItem key={a} value={a}>
                {s.author[a]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.period}
          onValueChange={(v) => setFilter("period", v as typeof filters.period)}
        >
          <SelectTrigger className="h-8 w-[150px] text-xs" aria-label={s.periodLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p} value={p}>
                {s.period[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {scope === "customer" && (
          <Select
            value={filters.classification}
            onValueChange={(v) => setFilter("classification", v as typeof filters.classification)}
          >
            <SelectTrigger className="h-8 w-[150px] text-xs" aria-label={s.classificationLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{s.classificationAll}</SelectItem>
              {CLASSIFICATIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {s.classification[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={reset}>
            <Icon icon="mdi:filter-remove-outline" size={14} />
            {s.clearAll}
            <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px]">{activeCount}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
