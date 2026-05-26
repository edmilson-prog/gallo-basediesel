import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ICustomer, ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";

function nameOf(c: ICustomer): string {
  return c.type === "B2B" ? c.nomeFantasia || c.razaoSocial : c.fullName;
}

export function CustomerAutocomplete({
  value,
  onChange,
  sellerIdFilter,
}: {
  value: ID | null;
  onChange: (customer: ICustomer | null) => void;
  /** When set, restrict suggestions to customers of this seller (own carteira). */
  sellerIdFilter?: ID | null;
}) {
  const provider = useCustomersProvider();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const customersQuery = useQuery({
    queryKey: ["customers-autocomplete", sellerIdFilter] as const,
    queryFn: () =>
      provider.list({ pageSize: 500, sellerId: sellerIdFilter ?? undefined }),
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const list = customersQuery.data?.data ?? [];
    if (!query.trim()) return list.slice(0, 10);
    const q = query.toLowerCase();
    return list
      .filter((c) => {
        const name = nameOf(c).toLowerCase();
        if (name.includes(q)) return true;
        if (c.type === "B2B" && c.cnpj.toLowerCase().includes(q)) return true;
        if (c.type === "B2C" && c.cpf.toLowerCase().includes(q)) return true;
        if (c.email?.toLowerCase().includes(q)) return true;
        return false;
      })
      .slice(0, 10);
  }, [customersQuery.data, query]);

  const selected = useMemo(() => {
    if (!value) return null;
    return (customersQuery.data?.data ?? []).find((c) => c.id === value) ?? null;
  }, [customersQuery.data, value]);

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
        <Icon
          icon="mdi:magnify"
          size={16}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          className="pl-8"
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
      {open && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
              onMouseDown={() => onChange(c)}
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
