import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SIZES, type PageSize } from "../../utils/listFilters";

export interface ICustomersPaginationProps {
  page: number;
  pageSize: PageSize;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
}

export function CustomersPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: ICustomersPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pages = buildPageList(page, totalPages);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-col gap-2 border-t border-border bg-card px-4 py-1.5 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          {total > 0 ? (
            <>
              Mostrando <strong className="tabular-nums text-foreground">{from}</strong>–
              <strong className="tabular-nums text-foreground">{to}</strong> de{" "}
              <strong className="tabular-nums text-foreground">{total}</strong>
            </>
          ) : (
            "Nenhum cliente"
          )}
        </span>
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-2">
          Por página:
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v) as PageSize)}
          >
            <SelectTrigger className="h-7 w-[72px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Página anterior"
          className="h-7 w-7"
        >
          <Icon icon="mdi:chevron-left" size={16} />
        </Button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-2 text-xs text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? "default" : "ghost"}
              size="sm"
              onClick={() => onPageChange(p)}
              className="h-7 min-w-7 px-2 text-xs"
            >
              {p}
            </Button>
          ),
        )}
        <Button
          variant="ghost"
          size="icon"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Próxima página"
          className="h-7 w-7"
        >
          <Icon icon="mdi:chevron-right" size={16} />
        </Button>
      </div>
    </div>
  );
}

function buildPageList(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const out: (number | "…")[] = [1];
  if (current > 3) out.push("…");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p += 1) {
    out.push(p);
  }
  if (current < total - 2) out.push("…");
  out.push(total);
  return out;
}
