import { useEffect, useRef, useState } from "react";
import type { ICustomerSegment } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SegmentsDropdown } from "./SegmentsDropdown";

export interface ICustomersHeaderProps {
  total: number;
  searchValue: string;
  onSearchChange: (q: string) => void;
  canCreateCustomer: boolean;
  onCreateCustomer: () => void;
  privateSegments: ICustomerSegment[];
  sharedSegments: ICustomerSegment[];
  activeSegmentId: string | null;
  activeSegmentName: string | null;
  hasFilters: boolean;
  hasUnsavedFilters: boolean;
  onApplySegment: (segment: ICustomerSegment) => void;
  onSaveAsNew: () => void;
  onSaveChanges: () => void;
  onManageSegments: () => void;
  onClearSegment: () => void;
  onConfigureColumns: () => void;
}

export function CustomersHeader({
  total,
  searchValue,
  onSearchChange,
  canCreateCustomer,
  onCreateCustomer,
  privateSegments,
  sharedSegments,
  activeSegmentId,
  activeSegmentName,
  hasFilters,
  hasUnsavedFilters,
  onApplySegment,
  onSaveAsNew,
  onSaveChanges,
  onManageSegments,
  onClearSegment,
  onConfigureColumns,
}: ICustomersHeaderProps) {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);

  // Press "/" anywhere (outside inputs) to focus the search field.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;
      if (isEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div className="flex flex-col gap-2 border-b border-border/40 bg-background/85 px-4 py-3 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 shrink-0 items-baseline gap-2">
          <h1 className="text-base font-semibold text-foreground">Clientes</h1>
          <Badge variant="outline" className="bg-muted/50 text-xs text-muted-foreground">
            {total.toLocaleString("pt-BR")} {total === 1 ? "cliente" : "clientes"}
          </Badge>
        </div>

        {activeSegmentName && (
          <div className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs">
            <Icon icon="mdi:bookmark-check" size={14} className="text-primary" />
            <span className="font-medium text-primary">{activeSegmentName}</span>
            {hasUnsavedFilters && (
              <span className="rounded bg-amber-200/60 px-1 text-[10px] font-semibold uppercase text-amber-800 dark:bg-amber-400/20 dark:text-amber-300">
                Modificado
              </span>
            )}
            <button
              type="button"
              onClick={onClearSegment}
              className="ml-1 text-primary/70 hover:text-primary"
              aria-label="Desativar segmentação"
            >
              <Icon icon="mdi:close" size={14} />
            </button>
          </div>
        )}

        <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          {/* Search grows while focused (dynamic width) — same UX as the old
              global search: "/" focuses it, Escape blurs. */}
          <div
            className={cn(
              "relative w-full flex-1 transition-[max-width] duration-300 ease-out motion-reduce:transition-none",
              focused ? "max-w-2xl" : "max-w-[260px]",
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
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") e.currentTarget.blur();
              }}
              placeholder="Buscar nome, CNPJ, telefone…"
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
          {hasUnsavedFilters && activeSegmentId && (
            <Button variant="outline" size="sm" className="shrink-0" onClick={onSaveChanges}>
              Salvar alterações
            </Button>
          )}
          <SegmentsDropdown
            privateOnes={privateSegments}
            shared={sharedSegments}
            activeSegmentId={activeSegmentId}
            hasUnsavedFilters={hasUnsavedFilters}
            hasFilters={hasFilters}
            onApply={onApplySegment}
            onSaveAsNew={onSaveAsNew}
            onManage={onManageSegments}
          />
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label="Configurar colunas"
            onClick={onConfigureColumns}
          >
            <Icon icon="mdi:tune-vertical" size={16} />
          </Button>
          {canCreateCustomer && (
            <Button size="sm" className="shrink-0 gap-1.5" onClick={onCreateCustomer}>
              <Icon icon="mdi:plus" size={16} />
              Cliente
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
