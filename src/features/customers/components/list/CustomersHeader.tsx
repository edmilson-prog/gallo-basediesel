import type { ICustomerSegment } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  return (
    <div className="flex flex-col gap-2 border-b border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
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

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Icon
              icon="mdi:magnify"
              size={16}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar nome, CNPJ, telefone…"
              className="h-9 w-[260px] pl-8 text-sm"
            />
          </div>
          {hasUnsavedFilters && activeSegmentId && (
            <Button variant="outline" size="sm" onClick={onSaveChanges}>
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
            aria-label="Configurar colunas"
            onClick={onConfigureColumns}
          >
            <Icon icon="mdi:tune-vertical" size={16} />
          </Button>
          {canCreateCustomer && (
            <Button size="sm" className="gap-1.5" onClick={onCreateCustomer}>
              <Icon icon="mdi:plus" size={16} />
              Cliente
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
