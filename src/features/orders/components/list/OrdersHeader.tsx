import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ListLayoutSwitcher, type ListLayout } from "@/shared/list-views";

export function OrdersHeader({
  total,
  searchValue,
  onSearchChange,
  layout,
  onLayoutChange,
}: {
  total: number;
  searchValue: string;
  onSearchChange: (q: string) => void;
  layout: ListLayout;
  onLayoutChange: (layout: ListLayout) => void;
}) {
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
    <header className="flex flex-col gap-3 border-b border-border/40 bg-background/85 px-4 py-4 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50 md:flex-row md:items-center md:px-6">
      <div className="shrink-0">
        <h1 className="text-lg font-semibold text-foreground">Pedidos</h1>
        <p className="text-xs text-muted-foreground">
          {total.toLocaleString("pt-BR")} {total === 1 ? "pedido" : "pedidos"} encontrado
          {total === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex w-full min-w-0 items-center gap-2 md:flex-1 md:justify-end">
        {/* Search grows while focused (dynamic width) — same UX as the old
            global search: "/" focuses it, Escape blurs. */}
        <div
          className={cn(
            "relative w-full flex-1 transition-[max-width] duration-300 ease-out motion-reduce:transition-none",
            focused ? "max-w-2xl" : "max-w-sm",
          )}
        >
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={searchRef}
            type="search"
            className="pl-8 pr-9"
            placeholder="Buscar por número, NF ou rastreio…"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") e.currentTarget.blur();
            }}
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
        <ListLayoutSwitcher value={layout} onChange={onLayoutChange} />
      </div>
    </header>
  );
}
