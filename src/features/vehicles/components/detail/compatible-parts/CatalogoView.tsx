import { useMemo, useState, useEffect } from "react";
import type { ID, IPart } from "@/shared/types";
import type { PartCategory } from "@/shared/types";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { searchPartsByText } from "@/features/catalog/api/search";
import { VEHICLE_STRINGS } from "@/features/vehicles/i18n/pt-BR";
import { CompatiblePartRow } from "./CompatiblePartRow";

export interface ICatalogoViewProps {
  parts: IPart[];
  kitPartIds: Set<ID>;
  pageSize: number;
  onAddToQuote?: (p: IPart) => void;
}

const COPY = VEHICLE_STRINGS.detail.compatibleV2;

export function CatalogoView({ parts, kitPartIds, pageSize, onAddToQuote }: ICatalogoViewProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(0);

  const categories = useMemo(
    () => Array.from(new Set(parts.map((p) => p.category).filter(Boolean))) as PartCategory[],
    [parts],
  );

  const filtered = useMemo(() => {
    let r = query.trim() ? searchPartsByText(parts, query) : parts;
    if (category !== "all") r = r.filter((p) => p.category === category);
    return r;
  }, [parts, query, category]);

  useEffect(() => {
    setPage(0);
  }, [query, category]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={COPY.searchPlaceholder}
          className="flex-1"
        />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{COPY.categoryAll}</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">{COPY.emptyCatalogued}</p>
      ) : (
        <ul className="divide-y divide-border">
          {pageItems.map((part) => (
            <li key={part.id}>
              <CompatiblePartRow
                part={part}
                inKit={kitPartIds.has(part.id)}
                onAddToQuote={onAddToQuote}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Pager */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            {page + 1} / {pageCount}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
