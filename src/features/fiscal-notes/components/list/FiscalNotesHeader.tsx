import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FISCAL_NOTES_STRINGS } from "../../i18n/pt-BR";

export interface IFiscalNotesHeaderProps {
  total: number;
  searchValue: string;
  onSearchChange: (q: string) => void;
  onImport: () => void;
}

export function FiscalNotesHeader({
  total,
  searchValue,
  onSearchChange,
  onImport,
}: IFiscalNotesHeaderProps) {
  const [local, setLocal] = useState(searchValue);
  const [focused, setFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const s = FISCAL_NOTES_STRINGS;

  useEffect(() => setLocal(searchValue), [searchValue]);

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

  // "/" em qualquer lugar foca a busca — sem roubar a digitação de um campo.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true
      ) {
        return;
      }
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const countLabel = total === 1 ? s.list.countOne(total) : s.list.countMany(total);

  return (
    <header className="flex shrink-0 flex-col gap-3 border-b border-border/40 bg-background/85 px-4 py-3 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50 md:flex-row md:items-center md:px-6">
      <div className="flex shrink-0 items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon icon="mdi:file-document-arrow-right-outline" size={20} aria-hidden />
        </div>
        <div>
          <h1 className="font-display text-xl font-extrabold uppercase leading-none tracking-[0.01em] text-foreground">
            {s.pageTitle}
          </h1>
          <p className="mt-0.5 text-[11.5px] tabular-nums text-muted-foreground">{countLabel}</p>
        </div>
      </div>

      <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center md:flex-1 md:justify-end">
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
            placeholder={s.list.searchPlaceholder}
            aria-label={s.list.searchPlaceholder}
            className="pl-8 pr-9"
          />
          <kbd
            className={cn(
              "pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 text-[10px] text-muted-foreground sm:flex",
              focused && "opacity-0",
            )}
            aria-hidden
          >
            /
          </kbd>
        </div>

        <Button size="sm" className="shrink-0" onClick={onImport}>
          <Icon icon="mdi:file-upload-outline" size={15} aria-hidden />
          {s.list.importCta}
        </Button>
      </div>
    </header>
  );
}
