import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const CONTACTS_PAGE_SIZES = [15, 30, 60, 120] as const;

export interface IContactsPaginationProps {
  page: number;
  pageSize: number;
  /**
   * Total matching the current filters, **from the server**. Never pass
   * `contacts.length` — that is how silent truncation gets reported as a
   * complete result.
   */
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/** Kit's window: first, ellipsis, the current page's neighbours, ellipsis, last. */
function buildPageWindow(page: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);

  const window: (number | "gap")[] = [1];
  if (page > 3) window.push("gap");
  for (let p = Math.max(2, page - 1); p <= Math.min(pages - 1, page + 1); p++) window.push(p);
  if (page < pages - 2) window.push("gap");
  window.push(pages);
  return window;
}

export function ContactsPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: IContactsPaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const window = buildPageWindow(page, pages);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border bg-card px-4 py-2">
      <span className="text-xs text-muted-foreground">
        Mostrando{" "}
        <b className="tabular-nums text-foreground">
          {from}–{to}
        </b>{" "}
        de <b className="tabular-nums text-foreground">{total.toLocaleString("pt-BR")}</b>
      </span>

      <span className="text-muted-foreground" aria-hidden>
        ·
      </span>

      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        Por página
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
          <SelectTrigger className="h-7 w-[4.5rem] text-xs" aria-label="Itens por página">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTACTS_PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </span>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Página anterior"
        >
          <Icon icon="mdi:chevron-left" size={16} />
        </Button>

        {window.map((entry, index) =>
          entry === "gap" ? (
            <span key={`gap-${index}`} className="px-1 text-xs text-muted-foreground" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              onClick={() => onPageChange(entry)}
              aria-label={`Página ${entry}`}
              aria-current={entry === page ? "page" : undefined}
              className={cn(
                "h-7 min-w-7 rounded px-1.5 text-xs tabular-nums transition-colors",
                entry === page
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {entry}
            </button>
          ),
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Próxima página"
        >
          <Icon icon="mdi:chevron-right" size={16} />
        </Button>
      </div>
    </div>
  );
}
