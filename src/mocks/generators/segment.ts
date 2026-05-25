import type { ICustomerSegment, ID } from "@/shared/types";
import { SEED_OWNER_ID } from "../data";
import { type ISeededContext } from "./utils";

interface ISegmentTemplate {
  name: string;
  description: string;
  scope: ICustomerSegment["scope"];
  filters: Record<string, unknown>;
  ownerId?: ID;
}

const TEMPLATES: ISegmentTemplate[] = [
  {
    name: "Clientes Volvo dormentes (>60d)",
    description: "Frota Volvo sem compra nos últimos 60 dias.",
    scope: "shared",
    filters: { tag: "Volvo", status: "dormente", lastPurchaseGteDays: 60 },
  },
  {
    name: "Frotistas A — recorrentes",
    description: "Curva A com compra mensal nos últimos 6 meses.",
    scope: "shared",
    filters: { abcClass: "A", purchaseFrequencyMonths: 6 },
  },
  {
    name: "Top ticket — últimos 90 dias",
    description: "Clientes com pedidos acima de R$ 50 mil nos últimos 90 dias.",
    scope: "shared",
    filters: { minOrderValue: 50_000, lastOrderLteDays: 90 },
  },
  {
    name: "Pendentes de aprovação de veículo",
    description: "Clientes com ao menos um veículo aguardando cadastro.",
    scope: "shared",
    filters: { hasVehiclePending: true },
  },
  {
    name: "Carteira do Carlos — Mercedes",
    description: "Filtro pessoal do vendedor Carlos para clientes Mercedes da sua carteira.",
    scope: "private",
    filters: { sellerId: "seller-carlos-santos", tag: "Mercedes-Benz" },
    ownerId: "seller-carlos-santos",
  },
  {
    name: "Clientes em recuperação",
    description: "Clientes marcados como em recuperação para força-tarefa do mês.",
    scope: "shared",
    filters: { status: "recuperacao" },
  },
];

export function generateSegments(ctx: ISeededContext): ICustomerSegment[] {
  const now = new Date().toISOString();
  return TEMPLATES.map((tpl, i) => ({
    id: `segment-${String(i + 1).padStart(3, "0")}`,
    ownerId: tpl.ownerId ?? SEED_OWNER_ID,
    name: tpl.name,
    description: tpl.description,
    scope: tpl.scope,
    filters: tpl.filters,
    estimatedSize: ctx.int(5, 70),
    createdAt: now,
  }));
}
