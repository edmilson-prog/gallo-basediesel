import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";

export interface ICatalogHeaderProps {
  total: number;
  searchValue: string;
  onSearchChange: (q: string) => void;
  canCreate: boolean;
  onCreate: () => void;
}

export function CatalogHeader({
  total,
  searchValue,
  onSearchChange,
  canCreate,
  onCreate,
}: ICatalogHeaderProps) {
  const [local, setLocal] = useState(searchValue);
  const timerRef = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    setLocal(searchValue);
  }, [searchValue]);

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      if (local !== searchValue) onSearchChange(local);
    }, 300);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

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

  const countLabel =
    total === 1 ? CATALOG_STRINGS.list.countOne(total) : CATALOG_STRINGS.list.countMany(total);

  return (
    <header className="flex flex-col gap-3 border-b border-border/40 bg-background/85 px-4 py-3 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50 md:flex-row md:items-center md:px-6">
      <div className="flex shrink-0 items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon icon="mdi:package-variant-closed" size={20} />
        </div>
        <div>
          <h1 className="font-display text-xl font-extrabold uppercase leading-none tracking-[0.01em] text-foreground">
            {CATALOG_STRINGS.pageTitle}
          </h1>
          <p className="mt-0.5 text-[11.5px] tabular-nums text-muted-foreground">{countLabel}</p>
        </div>
      </div>

      <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center md:flex-1 md:justify-end">
        {/* Search grows while focused (dynamic width) — same UX as the old
            global search: "/" focuses it, Escape blurs. */}
        <div
          className={cn(
            "relative w-full flex-1 transition-[max-width] duration-300 ease-out motion-reduce:transition-none",
            focused ? "max-w-2xl" : "sm:max-w-sm",
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
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") e.currentTarget.blur();
            }}
            placeholder={CATALOG_STRINGS.list.searchPlaceholder}
            className="pl-8 pr-9"
            aria-label="Buscar peças"
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

        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block shrink-0">
                <Button variant="outline" size="sm" disabled aria-disabled="true">
                  <Icon icon="mdi:upload-outline" size={16} />
                  {CATALOG_STRINGS.list.importCsv}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{CATALOG_STRINGS.list.importCsvHint}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {canCreate && (
          <Button size="sm" className="shrink-0" onClick={onCreate}>
            <Icon icon="mdi:plus" size={16} />
            {CATALOG_STRINGS.list.add}
          </Button>
        )}
      </div>
    </header>
  );
}
