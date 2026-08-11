import { useState } from "react";
import type { ConversationChannel, ConversationStatus } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { activeFilterCount, type IPwaFilters } from "../engine/pwaFilters";
import { PWA_CHANNEL_META, PWA_STATUS_META } from "./ui/statusMeta";
import { PWA_ATENDIMENTO_STRINGS as S } from "../i18n/pt-BR";

const STATUS_CHOICES: ConversationStatus[] = [
  "aguardando",
  "em_andamento",
  "aguardando_cliente",
  "resolvida",
];
const CHANNEL_CHOICES: ConversationChannel[] = ["whatsapp", "ecommerce", "phone", "site"];

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-[44px] whitespace-nowrap rounded-full px-3.5 text-xs font-bold",
        active
          ? "bg-foreground text-background"
          : "bg-foreground/[0.05] text-muted-foreground ring-1 ring-inset ring-border",
      )}
    >
      {label}
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

interface IPwaFilterPanelProps {
  filters: IPwaFilters;
  onChange: (next: IPwaFilters) => void;
  onClear: () => void;
  /** Rows currently loaded — shown next to "Limpar tudo". */
  count: number;
}

/** Search box plus the collapsible facet panel (Status · Canal · Atribuição). */
export function PwaFilterPanel({ filters, onChange, onClear, count }: IPwaFilterPanelProps) {
  const [open, setOpen] = useState(false);
  const active = activeFilterCount(filters);

  return (
    <div className="flex flex-col gap-2.5 border-b border-border bg-background px-3.5 pb-3 pt-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-[42px] flex-1 items-center gap-2.5 rounded bg-foreground/[0.05] px-3 ring-1 ring-inset ring-border">
          <Icon icon="mdi:magnify" size={16} className="text-muted-foreground" />
          <input
            type="search"
            value={filters.q}
            onChange={(event) => onChange({ ...filters, q: event.target.value })}
            placeholder={S.list.searchPlaceholder}
            aria-label={S.list.searchPlaceholder}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70 [&::-webkit-search-cancel-button]:hidden"
          />
          {filters.q && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, q: "" })}
              aria-label={S.list.clearSearch}
              className="-m-1 p-1 text-muted-foreground"
            >
              <Icon icon="mdi:close" size={15} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={S.list.filters}
          aria-expanded={open}
          className={cn(
            "relative flex h-11 w-11 items-center justify-center rounded",
            open
              ? "bg-foreground text-background"
              : "bg-foreground/[0.05] text-muted-foreground ring-1 ring-inset ring-border",
          )}
        >
          <Icon icon="mdi:tune-variant" size={17} />
          {active > 0 && !open && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-extrabold text-primary-foreground">
              {active}
            </span>
          )}
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-3.5 pt-1">
          <Group label={S.list.filterStatus}>
            <Chip
              active={filters.status === "all"}
              label={S.list.all}
              onClick={() => onChange({ ...filters, status: "all" })}
            />
            {STATUS_CHOICES.map((status) => (
              <Chip
                key={status}
                active={filters.status === status}
                label={PWA_STATUS_META[status].label}
                onClick={() => onChange({ ...filters, status })}
              />
            ))}
          </Group>

          <Group label={S.list.filterChannel}>
            <Chip
              active={filters.channel === "all"}
              label={S.list.allMasculine}
              onClick={() => onChange({ ...filters, channel: "all" })}
            />
            {CHANNEL_CHOICES.map((channel) => (
              <Chip
                key={channel}
                active={filters.channel === channel}
                label={PWA_CHANNEL_META[channel].label}
                onClick={() => onChange({ ...filters, channel })}
              />
            ))}
          </Group>

          <Group label={S.list.filterAssign}>
            <Chip
              active={filters.assign === "all"}
              label={S.list.all}
              onClick={() => onChange({ ...filters, assign: "all" })}
            />
            <Chip
              active={filters.assign === "me"}
              label={S.list.mine}
              onClick={() => onChange({ ...filters, assign: "me" })}
            />
            <Chip
              active={filters.assign === "queue"}
              label={S.list.inQueue}
              onClick={() => onChange({ ...filters, assign: "queue" })}
            />
          </Group>

          <div className="flex items-center justify-between border-t border-border pt-2.5">
            <span className="text-xs text-muted-foreground">
              {count === 1 ? S.list.countOne : S.list.countOther(count)}
            </span>
            <button
              type="button"
              onClick={onClear}
              className="min-h-[44px] px-0.5 text-[12.5px] font-bold text-primary"
            >
              {S.list.clearAll}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
