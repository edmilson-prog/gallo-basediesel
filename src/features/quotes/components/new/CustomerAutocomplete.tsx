import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ICustomer, ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { useDebounce } from "@/shared/hooks/useDebounce";

function nameOf(c: ICustomer): string {
  return c.type === "B2B" ? c.nomeFantasia || c.razaoSocial : c.fullName;
}

export function CustomerAutocomplete({
  value,
  onChange,
  sellerIdFilter,
  borderless = false,
}: {
  value: ID | null;
  onChange: (customer: ICustomer | null) => void;
  /** When set, restrict suggestions to customers of this seller (own carteira). */
  sellerIdFilter?: ID | null;
  /** Drops the field's own frame — it sits inside the customer band's card. */
  borderless?: boolean;
}) {
  const provider = useCustomersProvider();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // Last-picked customer kept locally: the server-side search below narrows the
  // result set, so the chosen customer may no longer be in it after typing.
  const [picked, setPicked] = useState<ICustomer | null>(null);

  const debouncedQuery = useDebounce(query.trim(), 300);

  // Server-side search: customers exceed any client-side slice (3k+ rows), so
  // the typed term goes to the provider (`search` → buildCustomerSearchOr on
  // supabase) instead of filtering a pre-fetched page locally.
  const customersQuery = useQuery({
    queryKey: ["customers-autocomplete", sellerIdFilter, debouncedQuery] as const,
    queryFn: () =>
      provider.list({
        search: debouncedQuery || undefined,
        pageSize: 20,
        sellerId: sellerIdFilter ?? undefined,
      }),
    staleTime: 60_000,
  });

  const suggestions = useMemo(
    () => (customersQuery.data?.data ?? []).slice(0, 10),
    [customersQuery.data],
  );

  const selected = useMemo(() => {
    if (!value) return null;
    if (picked?.id === value) return picked;
    // Fallback for an externally-set value: best-effort lookup in the current page.
    return (customersQuery.data?.data ?? []).find((c) => c.id === value) ?? null;
  }, [picked, customersQuery.data, value]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{nameOf(selected)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {selected.type === "B2B" ? `CNPJ ${selected.cnpj}` : `CPF ${selected.cpf}`} ·{" "}
            {selected.phone}
          </p>
        </div>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            onChange(null);
            setPicked(null);
            setQuery("");
          }}
        >
          <Icon icon="mdi:close" size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        {!borderless && (
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
        )}
        <Input
          type="search"
          className={
            borderless
              ? "h-7 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
              : "pl-8"
          }
          placeholder="Buscar cliente por nome, CNPJ/CPF…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {suggestions.map((c) => (
            <button
              key={c.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
              onMouseDown={() => {
                setPicked(c);
                onChange(c);
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{nameOf(c)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.type === "B2B" ? `CNPJ ${c.cnpj}` : `CPF ${c.cpf}`} · {c.phone}
                </p>
              </div>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                {c.type}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
