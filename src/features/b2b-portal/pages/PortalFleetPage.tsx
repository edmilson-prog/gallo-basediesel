import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortalSession } from "../hooks/usePortalSession";
import { usePortalVehicles } from "../hooks/usePortalResources";
import { PORTAL_STRINGS as S } from "../i18n/pt-BR";

export function PortalFleetPage() {
  const { customer } = usePortalSession();
  const { data: vehicles = [], isLoading } = usePortalVehicles(customer?.id);
  const [search, setSearch] = useState("");

  const term = search.trim().toLowerCase();
  const filtered = term
    ? vehicles.filter((v) =>
        `${v.plate ?? ""} ${v.brand} ${v.model} ${v.engine}`.toLowerCase().includes(term),
      )
    : vehicles;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-foreground">{S.fleetTitle}</h1>

      <div className="relative">
        <Icon
          icon="mdi:magnify"
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={S.fleetSearch}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{S.fleetEmpty}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((v) => (
            <Link key={v.id} to="/portal/frota/$id" params={{ id: v.id }}>
              <Card className="flex items-center gap-3 p-4 transition-colors hover:border-primary/40">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon icon="mdi:truck" size={22} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {v.brand} {v.model}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {v.plate ?? "sem placa"} · {v.year} · {v.engine}
                  </p>
                  {v.currentKm != null && (
                    <p className="text-[11px] text-muted-foreground">
                      {v.currentKm.toLocaleString("pt-BR")} km
                    </p>
                  )}
                </div>
                <Icon icon="mdi:chevron-right" size={18} className="text-muted-foreground" aria-hidden />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
