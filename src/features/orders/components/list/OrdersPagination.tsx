import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ORDER_PAGE_SIZES, type OrdersPageSize } from "../../utils/listFilters";

export function OrdersPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: OrdersPageSize;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: OrdersPageSize) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border bg-background px-4 py-2 text-xs md:px-6">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>
          {start}–{end} de {total}
        </span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(Number(v) as OrdersPageSize)}
        >
          <SelectTrigger className="h-7 w-20 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORDER_PAGE_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s} / pg
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          <Icon icon="mdi:chevron-left" size={16} />
        </Button>
        <span className="px-2 text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          <Icon icon="mdi:chevron-right" size={16} />
        </Button>
      </div>
    </div>
  );
}
