import type { ICustomerSegment } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ISegmentsDropdownProps {
  privateOnes: ICustomerSegment[];
  shared: ICustomerSegment[];
  activeSegmentId: string | null;
  hasUnsavedFilters: boolean;
  onApply: (segment: ICustomerSegment) => void;
  onSaveAsNew: () => void;
  onManage: () => void;
  hasFilters: boolean;
}

export function SegmentsDropdown({
  privateOnes,
  shared,
  activeSegmentId,
  hasUnsavedFilters,
  onApply,
  onSaveAsNew,
  onManage,
  hasFilters,
}: ISegmentsDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Icon icon="mdi:bookmark-multiple-outline" size={16} />
          Segmentações
          <Icon icon="mdi:chevron-down" size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {shared.length > 0 && (
          <>
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Compartilhadas
            </DropdownMenuLabel>
            {shared.map((s) => (
              <SegmentItem
                key={s.id}
                segment={s}
                isActive={s.id === activeSegmentId}
                onApply={onApply}
              />
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        {privateOnes.length > 0 && (
          <>
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Privadas
            </DropdownMenuLabel>
            {privateOnes.map((s) => (
              <SegmentItem
                key={s.id}
                segment={s}
                isActive={s.id === activeSegmentId}
                onApply={onApply}
              />
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        {shared.length === 0 && privateOnes.length === 0 && (
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Nenhuma segmentação salva ainda.
          </DropdownMenuLabel>
        )}
        <DropdownMenuItem
          disabled={!hasFilters}
          onSelect={(e) => {
            e.preventDefault();
            onSaveAsNew();
          }}
        >
          <Icon icon="mdi:bookmark-plus-outline" size={16} />
          {hasUnsavedFilters && activeSegmentId
            ? "Salvar como nova segmentação"
            : "Salvar filtros atuais"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onManage();
          }}
        >
          <Icon icon="mdi:cog-outline" size={16} />
          Gerenciar segmentações
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ISegmentItemProps {
  segment: ICustomerSegment;
  isActive: boolean;
  onApply: (segment: ICustomerSegment) => void;
}

function SegmentItem({ segment, isActive, onApply }: ISegmentItemProps) {
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        onApply(segment);
      }}
      className={cn("flex flex-col items-start gap-0.5", isActive && "bg-accent/60")}
    >
      <div className="flex w-full items-center justify-between">
        <span className="truncate text-sm font-medium">{segment.name}</span>
        {isActive && <Icon icon="mdi:check" size={14} className="text-primary" />}
      </div>
      {segment.description && (
        <span className="truncate text-[10px] text-muted-foreground">{segment.description}</span>
      )}
    </DropdownMenuItem>
  );
}
