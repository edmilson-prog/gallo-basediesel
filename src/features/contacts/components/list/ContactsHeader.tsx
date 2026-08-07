import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Card grid or dense table. */
export type ContactsView = "grid" | "table";

export interface IContactsHeaderProps {
  /** Total contacts behind the current filters, from the server. */
  total: number;
  searchValue: string;
  onSearchChange: (term: string) => void;
  view: ContactsView;
  onViewChange: (view: ContactsView) => void;
  canCreate: boolean;
  onCreate: () => void;
  onExport: () => void;
  /** Only rendered in table view — the grid has no columns to configure. */
  onConfigureColumns?: () => void;
}

const VIEW_OPTIONS: { id: ContactsView; icon: string; label: string }[] = [
  { id: "grid", icon: "mdi:view-grid-outline", label: "Ver em cards" },
  { id: "table", icon: "mdi:table", label: "Ver em tabela" },
];

/**
 * Glass page header for the Agenda (ux-guidelines §1).
 *
 * The search field widens while focused and is reachable with "/" from
 * anywhere on the page; Escape blurs it. The `kbd` hint fades out on focus so
 * it never sits on top of what the user is typing.
 *
 * Only Exportar lives under Manutenção in this phase — importing a CSV and
 * syncing the WhatsApp phonebook belong to later phases, and a menu item that
 * opens nothing is worse than an absent one.
 */
export function ContactsHeader({
  total,
  searchValue,
  onSearchChange,
  view,
  onViewChange,
  canCreate,
  onCreate,
  onExport,
  onConfigureColumns,
}: IContactsHeaderProps) {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);

  // "/" focuses the search from anywhere — but never while the user is
  // already typing somewhere, otherwise the character is swallowed instead of
  // inserted.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;
      if (isEditable) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div className="flex flex-col gap-2 border-b border-border/40 bg-background/85 px-4 py-3 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 shrink-0 items-baseline gap-2">
          <h1 className="text-base font-semibold text-foreground">Agenda</h1>
          <Badge variant="outline" className="bg-muted/50 text-xs text-muted-foreground">
            {total.toLocaleString("pt-BR")} {total === 1 ? "contato" : "contatos"}
          </Badge>
        </div>

        <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <div
            className={cn(
              "relative w-full flex-1 transition-[max-width] duration-300 ease-out motion-reduce:transition-none",
              focused ? "max-w-[520px]" : "max-w-[280px]",
            )}
          >
            <Icon
              icon="mdi:magnify"
              size={16}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={searchRef}
              type="search"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(event) => {
                if (event.key === "Escape") event.currentTarget.blur();
              }}
              placeholder="Buscar nome, telefone, e-mail, empresa…"
              aria-label="Buscar contatos"
              className="h-9 w-full pl-8 pr-9 text-sm"
            />
            <kbd
              aria-hidden
              className={cn(
                "pointer-events-none absolute right-2 top-1/2 hidden h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground transition-opacity duration-200 sm:flex",
                focused ? "opacity-0" : "opacity-100",
              )}
            >
              /
            </kbd>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
            {VIEW_OPTIONS.map((option) => (
              <Tooltip key={option.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onViewChange(option.id)}
                    aria-label={option.label}
                    aria-pressed={view === option.id}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded transition-colors",
                      view === option.id
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon icon={option.icon} size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{option.label}</TooltipContent>
              </Tooltip>
            ))}
          </div>

          {view === "table" && onConfigureColumns && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={onConfigureColumns}
                  aria-label="Colunas visíveis"
                >
                  <Icon icon="mdi:view-column-outline" size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Colunas visíveis</TooltipContent>
            </Tooltip>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0">
                <Icon icon="mdi:database-cog-outline" size={16} />
                Manutenção
                <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onSelect={onExport} className="gap-2">
                <Icon icon="mdi:download" size={16} className="text-primary" />
                <span className="flex flex-col">
                  <span className="text-sm">Exportar</span>
                  <span className="text-xs text-muted-foreground">
                    CSV da seleção ou dos filtros ativos
                  </span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {canCreate && (
            <Button size="sm" className="shrink-0" onClick={onCreate}>
              <Icon icon="mdi:plus" size={16} />
              Novo contato
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
