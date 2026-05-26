import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

  const countLabel =
    total === 1 ? CATALOG_STRINGS.list.countOne(total) : CATALOG_STRINGS.list.countMany(total);

  return (
    <header className="flex flex-col gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:flex-row md:items-center md:justify-between md:px-6">
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon icon="mdi:package-variant-closed" size={20} />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            {CATALOG_STRINGS.pageTitle}
          </h1>
          <p className="text-xs text-muted-foreground">{countLabel}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:w-72">
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            placeholder={CATALOG_STRINGS.list.searchPlaceholder}
            className="pl-8"
            aria-label="Buscar peças"
          />
        </div>

        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block">
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
          <Button size="sm" onClick={onCreate}>
            <Icon icon="mdi:plus" size={16} />
            {CATALOG_STRINGS.list.add}
          </Button>
        )}
      </div>
    </header>
  );
}
