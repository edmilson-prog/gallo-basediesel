import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";

export interface IEquivalentsEditorProps {
  selectedIds: ID[];
  excludeId?: ID;
  onChange: (ids: ID[]) => void;
}

export function EquivalentsEditor({ selectedIds, excludeId, onChange }: IEquivalentsEditorProps) {
  const provider = usePartsProvider();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setDebounced(query), 250);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [query]);

  // Resolve currently selected parts (one batch call).
  const selectedQuery = useQuery({
    queryKey: ["parts-by-ids", selectedIds] as const,
    queryFn: async () => {
      if (selectedIds.length === 0) return [] as IPart[];
      const result = await provider.list({ pageSize: 2000 });
      return result.data.filter((p) => selectedIds.includes(p.id));
    },
    staleTime: 60_000,
  });

  const searchQuery = useQuery({
    queryKey: ["parts-search", debounced] as const,
    queryFn: () => provider.list({ search: debounced, pageSize: 10 }),
    enabled: debounced.trim().length >= 2,
    staleTime: 30_000,
  });

  const results = (searchQuery.data?.data ?? []).filter(
    (p) => p.id !== excludeId && !selectedIds.includes(p.id),
  );

  const add = (id: ID) => {
    onChange([...selectedIds, id]);
    setQuery("");
  };

  const remove = (id: ID) => onChange(selectedIds.filter((x) => x !== id));

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{CATALOG_STRINGS.form.fields.equivalentsHint}</p>

      <div className="relative">
        <Icon
          icon="mdi:magnify"
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={CATALOG_STRINGS.form.searchEquivalentPlaceholder}
          className="pl-8"
        />
        {results.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => add(p.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{p.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {p.oemCodes[0]} · {p.brand}
                  </span>
                </div>
                <Icon icon="mdi:plus" size={14} className="text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>

      {(selectedQuery.data ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(selectedQuery.data ?? []).map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2 py-1 text-xs"
            >
              <span className="font-medium">{p.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {p.oemCodes[0]}
              </span>
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Remover ${p.name}`}
              >
                <Icon icon="mdi:close" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
