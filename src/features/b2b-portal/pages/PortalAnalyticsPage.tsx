import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ID, IOrder, IPart, IVehicle } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { formatBRL, formatBRLCompact } from "@/shared/utils/format";
import { usePartsProvider } from "@/providers/data";
import { usePortalSession } from "../hooks/usePortalSession";
import { usePortalOrders, usePortalVehicles } from "../hooks/usePortalResources";
import { PORTAL_STRINGS as S } from "../i18n/pt-BR";

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function buildMonthly(orders: IOrder[]) {
  const map = new Map<string, number>();
  for (const o of orders) {
    if (o.paymentStatus !== "pago") continue;
    const key = monthKey(o.paidAt ?? o.createdAt);
    map.set(key, (map.get(key) ?? 0) + o.total);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([month, value]) => ({ month, value }));
}

function buildTopParts(orders: IOrder[]) {
  const map = new Map<string, number>();
  for (const o of orders) {
    for (const it of o.items) {
      map.set(it.partName, (map.get(it.partName) ?? 0) + it.total);
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }));
}

const CATEGORY_LABELS: Record<string, string> = {
  filtro: "Filtros",
  freio: "Freios",
  correia: "Correias",
  motor: "Motor",
  embreagem: "Embreagem",
  eletrica: "Elétrica",
  transmissao: "Transmissão",
  suspensao: "Suspensão",
  arrefecimento: "Arrefecimento",
  lubrificante: "Lubrificantes",
  outros: "Outros",
};

/** Spend grouped by part category, resolving partId → category via the parts map. */
function buildByCategory(orders: IOrder[], partsById: Map<ID, IPart>) {
  const map = new Map<string, number>();
  for (const o of orders) {
    if (o.paymentStatus !== "pago") continue;
    for (const it of o.items) {
      const cat = partsById.get(it.partId)?.category ?? "outros";
      map.set(cat, (map.get(cat) ?? 0) + it.total);
    }
  }
  return [...map.entries()]
    .map(([category, value]) => ({ category, label: CATEGORY_LABELS[category] ?? category, value }))
    .sort((a, b) => b.value - a.value);
}

/** Spend grouped by the destination vehicle (item.appliedToVehicleId). */
function buildByVehicle(orders: IOrder[], vehiclesById: Map<ID, IVehicle>) {
  const map = new Map<string, number>();
  for (const o of orders) {
    if (o.paymentStatus !== "pago") continue;
    for (const it of o.items) {
      if (!it.appliedToVehicleId) continue;
      map.set(it.appliedToVehicleId, (map.get(it.appliedToVehicleId) ?? 0) + it.total);
    }
  }
  return [...map.entries()]
    .map(([vehicleId, value]) => {
      const v = vehiclesById.get(vehicleId);
      const label = v ? `${v.brand} ${v.model} (${v.plate ?? "s/ placa"})` : "Veículo removido";
      return { vehicleId, label, value };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: 12,
};

export function PortalAnalyticsPage() {
  const navigate = useNavigate();
  const { customer } = usePortalSession();
  const { data: orders = [] } = usePortalOrders(customer?.id);
  const { data: vehicles = [] } = usePortalVehicles(customer?.id);
  const partsProvider = usePartsProvider();

  const { data: partsPage } = useQuery({
    queryKey: ["portal", "parts"] as const,
    staleTime: 5 * 60_000,
    queryFn: () => partsProvider.list({ pageSize: 2000 }),
  });

  const partsById = useMemo(() => {
    const map = new Map<ID, IPart>();
    for (const p of partsPage?.data ?? []) map.set(p.id, p);
    return map;
  }, [partsPage]);

  const vehiclesById = useMemo(() => {
    const map = new Map<ID, IVehicle>();
    for (const v of vehicles) map.set(v.id, v);
    return map;
  }, [vehicles]);

  const monthly = useMemo(() => buildMonthly(orders), [orders]);
  const topParts = useMemo(() => buildTopParts(orders), [orders]);
  const byCategory = useMemo(() => buildByCategory(orders, partsById), [orders, partsById]);
  const byVehicle = useMemo(() => buildByVehicle(orders, vehiclesById), [orders, vehiclesById]);

  const drillToVehicle = (vehicleId: ID) =>
    void navigate({ to: "/portal/pedidos", search: { vehicleId } });

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-foreground">{S.analyticsTitle}</h1>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-foreground">{S.chartSpendMonthly}</h2>
        {monthly.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sem dados.</p>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => formatBRLCompact(v)}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                  tickLine={false}
                  width={64}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => [formatBRL(v), "Gasto"]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h2 className="text-sm font-semibold text-foreground">{S.chartSpendCategory}</h2>
          {byCategory.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sem dados.</p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={byCategory}
                  layout="vertical"
                  margin={{ top: 4, right: 12, bottom: 0, left: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    opacity={0.4}
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tickFormatter={(v: number) => formatBRLCompact(v)}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    stroke="var(--border)"
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={96}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    stroke="var(--border)"
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={false}
                    contentStyle={tooltipStyle}
                    formatter={(v: number) => [formatBRL(v), "Gasto"]}
                  />
                  <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="text-sm font-semibold text-foreground">{S.chartByVehicle}</h2>
          {byVehicle.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sem peças atribuídas a veículos ainda.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Clique numa barra para ver os pedidos do veículo.
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={byVehicle}
                    layout="vertical"
                    margin={{ top: 4, right: 12, bottom: 0, left: 8 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                      opacity={0.4}
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tickFormatter={(v: number) => formatBRLCompact(v)}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      stroke="var(--border)"
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={120}
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      stroke="var(--border)"
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={false}
                      contentStyle={tooltipStyle}
                      formatter={(v: number) => [formatBRL(v), "Gasto"]}
                    />
                    <Bar
                      dataKey="value"
                      fill="var(--primary)"
                      radius={[0, 4, 4, 0]}
                      className="cursor-pointer"
                      onClick={(data: { payload?: { vehicleId?: ID } }) => {
                        if (data.payload?.vehicleId) drillToVehicle(data.payload.vehicleId);
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </Card>
      </div>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-foreground">{S.chartTopParts}</h2>
        {topParts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sem dados.</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topParts}
                layout="vertical"
                margin={{ top: 4, right: 12, bottom: 0, left: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  opacity={0.4}
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => formatBRLCompact(v)}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                  tickLine={false}
                />
                <Tooltip
                  cursor={false}
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => [formatBRL(v), "Total"]}
                />
                <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
