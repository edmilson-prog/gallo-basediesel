import { useMemo, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import type { ID, IOrder, OrderPaymentStatus } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Icon } from "@/components/Icon";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import { usePortalSession } from "../hooks/usePortalSession";
import { usePortalOrders, usePortalVehicles } from "../hooks/usePortalResources";
import { usePortalStore } from "../store/portalStore";
import { PORTAL_STRINGS as S } from "../i18n/pt-BR";

export interface IPortalOrdersSearch {
  vehicleId?: string;
}

type PeriodFilter = "all" | "30" | "90" | "365";

function withinPeriod(iso: string, period: PeriodFilter): boolean {
  if (period === "all") return true;
  const days = Number(period);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(iso).getTime() >= cutoff;
}

export function PortalOrdersListPage() {
  const search = useSearch({ from: "/portal/pedidos/" }) as IPortalOrdersSearch;
  const { customer } = usePortalSession();
  const { data: orders = [], isLoading } = usePortalOrders(customer?.id);
  const { data: vehicles = [] } = usePortalVehicles(customer?.id);
  const requests = usePortalStore((s) => s.requests);
  const users = usePortalStore((s) => s.users);

  const [status, setStatus] = useState<OrderPaymentStatus | "all">("all");
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [minValue, setMinValue] = useState("");
  const [vehicleId, setVehicleId] = useState<string>(search.vehicleId ?? "all");
  const [buyerId, setBuyerId] = useState<string>("all");

  // Internal buyer is resolved by mapping an order back to the portal request
  // that originated it (relatedOrderId → requestedBy). Orders not raised through
  // the portal have no internal buyer.
  const buyerByOrderId = useMemo(() => {
    const map = new Map<ID, ID>();
    for (const r of requests) {
      if (r.relatedOrderId) map.set(r.relatedOrderId, r.requestedBy);
    }
    return map;
  }, [requests]);

  const companyUsers = useMemo(
    () => users.filter((u) => u.customerId === customer?.id),
    [users, customer?.id],
  );

  const filtered = useMemo(() => {
    const min = Number(minValue) || 0;
    return orders.filter((o: IOrder) => {
      if (status !== "all" && o.paymentStatus !== status) return false;
      if (!withinPeriod(o.createdAt, period)) return false;
      if (o.total < min) return false;
      if (vehicleId !== "all" && !o.items.some((it) => it.appliedToVehicleId === vehicleId)) {
        return false;
      }
      if (buyerId !== "all" && buyerByOrderId.get(o.id) !== buyerId) return false;
      return true;
    });
  }, [orders, status, period, minValue, vehicleId, buyerId, buyerByOrderId]);

  const hasActiveFilters =
    status !== "all" ||
    period !== "all" ||
    minValue !== "" ||
    vehicleId !== "all" ||
    buyerId !== "all";

  const clearFilters = () => {
    setStatus("all");
    setPeriod("all");
    setMinValue("");
    setVehicleId("all");
    setBuyerId("all");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-foreground">{S.ordersTitle}</h1>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button variant="outline" size="sm" disabled>
                  <Icon icon="mdi:file-delimited-outline" size={16} className="mr-1" aria-hidden />
                  {S.ordersExportCsv}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{S.ordersExportPlaceholder}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {S.ordersFilterStatus}
          </label>
          <Select value={status} onValueChange={(v) => setStatus(v as OrderPaymentStatus | "all")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{S.ordersFilterAll}</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="parcial">Parcial</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="vencido">Vencido</SelectItem>
              <SelectItem value="estornado">Estornado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {S.ordersFilterPeriod}
          </label>
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{S.ordersFilterAll}</SelectItem>
              <SelectItem value="30">{S.ordersPeriod30}</SelectItem>
              <SelectItem value="90">{S.ordersPeriod90}</SelectItem>
              <SelectItem value="365">{S.ordersPeriod365}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {S.ordersFilterMinValue}
          </label>
          <Input
            type="number"
            min={0}
            value={minValue}
            onChange={(e) => setMinValue(e.target.value)}
            placeholder="0"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {S.ordersFilterVehicle}
          </label>
          <Select value={vehicleId} onValueChange={setVehicleId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{S.ordersFilterAll}</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.brand} {v.model} ({v.plate ?? "s/ placa"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">{S.ordersFilterBuyer}</label>
          <Select value={buyerId} onValueChange={setBuyerId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{S.ordersFilterAll}</SelectItem>
              {companyUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters && (
          <div className="sm:col-span-2 lg:col-span-5">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <Icon icon="mdi:filter-remove-outline" size={16} className="mr-1" aria-hidden />
              {S.ordersClearFilters}
            </Button>
          </div>
        )}
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted-foreground">{S.ordersEmpty}</Card>
      ) : filtered.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted-foreground">{S.ordersNoMatch}</Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <Link key={o.id} to="/portal/pedidos/$id" params={{ id: o.id }}>
              <Card className="flex items-center justify-between gap-3 p-4 transition-colors hover:border-primary/40">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-semibold text-foreground">{o.number}</p>
                  <p className="text-xs text-muted-foreground">{formatDateBR(o.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{o.paymentStatus}</Badge>
                  <span className="text-sm font-semibold tabular-nums">{formatBRL(o.total)}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
