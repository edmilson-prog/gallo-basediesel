import type { ID, ISeller, IProductIndicator, IndicatorMetric, ProductSelector } from "@/shared/types";
import { SEED_STORE_ID } from "../data";
import { monthRange, monthRef, type ISeededContext } from "./utils";

const METRIC_LABEL: Record<IndicatorMetric, string> = {
  faturamento: "Faturamento",
  quantidade: "Quantidade",
  margem: "Margem",
  pedidos: "Pedidos",
};

function selectorLabel(sel: ProductSelector): string {
  switch (sel.kind) {
    case "category":
      return sel.categories.join(" + ");
    case "sku":
      return `${sel.partIds.length} SKU(s)`;
    case "group":
      return sel.label;
  }
}

interface IMakeInput {
  id: ID;
  selector: ProductSelector;
  metric: IndicatorMetric;
  scopeLevel: IProductIndicator["scopeLevel"];
  sellerId?: ID;
  targetValue: number;
  start: Date;
  end: Date;
  status: IProductIndicator["status"];
}

function make(input: IMakeInput): IProductIndicator {
  const month = input.start.toLocaleDateString("pt-BR", { month: "long" });
  const cap = month.charAt(0).toUpperCase() + month.slice(1);
  const nowISO = new Date().toISOString();
  return {
    id: input.id,
    storeId: SEED_STORE_ID,
    name: `${METRIC_LABEL[input.metric]} — ${selectorLabel(input.selector)} — ${cap} ${input.start.getFullYear()}`,
    selector: input.selector,
    metric: input.metric,
    scopeLevel: input.scopeLevel,
    sellerId: input.sellerId,
    period: { type: "mensal", start: input.start.toISOString(), end: input.end.toISOString() },
    targetValue: input.targetValue,
    status: input.status,
    division: "parts",
    createdBy: "seller-joao-gallo",
    createdAt: nowISO,
    updatedAt: nowISO,
  };
}

/**
 * Product indicators seed: a mix of selector kinds (category/sku/group),
 * metrics, scopes (store + individual) and statuses, plus a few months of
 * history and one canceled indicator.
 */
export function generateIndicators(
  _ctx: ISeededContext,
  options: { sellers: ISeller[]; now?: Date },
): IProductIndicator[] {
  const now = options.now ?? new Date();
  const out: IProductIndicator[] = [];
  const cur = monthRange(now);
  const period = monthRef(now);
  const featured = options.sellers.find((s) => s.id !== "seller-joao-gallo") ?? options.sellers[0];

  out.push(make({ id: `ind-${period}-store-filtros-fat`, selector: { kind: "category", categories: ["filtro"] }, metric: "faturamento", scopeLevel: "store", targetValue: 400_000, start: cur.start, end: cur.end, status: "ativo" }));
  out.push(make({ id: `ind-${period}-store-freios-qtd`, selector: { kind: "category", categories: ["freio"] }, metric: "quantidade", scopeLevel: "store", targetValue: 800, start: cur.start, end: cur.end, status: "ativo" }));
  out.push(make({ id: `ind-${period}-store-lubrificante-margem`, selector: { kind: "category", categories: ["lubrificante"] }, metric: "margem", scopeLevel: "store", targetValue: 60_000, start: cur.start, end: cur.end, status: "ativo" }));
  out.push(make({ id: `ind-${period}-store-linhapesada-grupo`, selector: { kind: "group", label: "Linha pesada", categories: ["motor", "transmissao", "suspensao"] }, metric: "faturamento", scopeLevel: "store", targetValue: 250_000, start: cur.start, end: cur.end, status: "ativo" }));
  if (featured) {
    out.push(make({ id: `ind-${period}-${featured.id}-filtros-fat`, selector: { kind: "category", categories: ["filtro"] }, metric: "faturamento", scopeLevel: "individual", sellerId: featured.id, targetValue: 80_000, start: cur.start, end: cur.end, status: "ativo" }));
    out.push(make({ id: `ind-${period}-${featured.id}-pedidos-freio`, selector: { kind: "category", categories: ["freio"] }, metric: "pedidos", scopeLevel: "individual", sellerId: featured.id, targetValue: 15, start: cur.start, end: cur.end, status: "ativo" }));
  }

  for (let i = 1; i <= 3; i += 1) {
    const past = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const range = monthRange(past);
    out.push(make({ id: `ind-${monthRef(past)}-store-filtros-fat`, selector: { kind: "category", categories: ["filtro"] }, metric: "faturamento", scopeLevel: "store", targetValue: 380_000, start: range.start, end: range.end, status: i % 2 === 0 ? "arquivado" : "concluido" }));
  }

  out.push({
    ...make({ id: `ind-${period}-store-eletrica-cancelado`, selector: { kind: "category", categories: ["eletrica"] }, metric: "faturamento", scopeLevel: "store", targetValue: 90_000, start: cur.start, end: cur.end, status: "cancelado" }),
    cancelReason: "Reorientação de mix de produtos no trimestre",
  });

  return out;
}
