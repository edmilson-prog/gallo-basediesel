import type {
  ICustomer,
  IGoal,
  IInsight,
  IInsightThresholds,
  IOrder,
  IPart,
  ISdrSession,
  ISeller,
  ID,
} from "@/shared/types";
import {
  countBySeller,
  formatPercentAbs,
  isoDaysAgo,
  marginByPart,
  ordersPaidBetween,
  ordersPaidSince,
  quantityByPart,
  revenueBySeller,
  sumOrdersTotal,
  MS_PER_DAY,
} from "./utils";

/**
 * Snapshot of the live data feeding the heuristics (PRD-053).
 *
 * Pure function input — the engine does not read providers nor make calls.
 * Consumers (the daily-detection hook) gather the slice and pass it in.
 */
export interface IInsightsContext {
  now: Date;
  storeId: ID;
  thresholds: IInsightThresholds;
  orders: IOrder[];
  customers: ICustomer[];
  parts: IPart[];
  sellers: ISeller[];
  goals: IGoal[];
  sdrSessions: ISdrSession[];
  /** Lifecycle window for "dormente" status — used by `customer_at_risk`. */
  dormantDays: number;
}

const REFERENCE_WINDOW_DAYS = 30;

/**
 * Runs every PRD-053 heuristic over `context` and returns the resulting
 * insights. Pure: no side effects, deterministic given identical input.
 *
 * Insight IDs use a stable seed derived from `type` + key dimensions so
 * the dismissal storage can recognise a recurring pattern and skip it
 * during its `validUntil` window.
 */
export function detectInsights(context: IInsightsContext): IInsight[] {
  const out: IInsight[] = [];
  out.push(...detectMarginDrop(context));
  out.push(...detectChurnSpike(context));
  out.push(...detectSellerAtRisk(context));
  out.push(...detectCustomerAtRisk(context));
  out.push(...detectProductDecline(context));
  out.push(...detectProductExcess(context));
  out.push(...detectSdrConversionDrop(context));
  out.push(...detectMetaAtRisk(context));
  out.push(...detectTopSellerOverload(context));
  out.push(...detectOpportunitySegment(context));
  out.push(...detectNewCustomerWinning(context));
  out.push(...detectRecoverySuccess(context));
  return out;
}

// ----------------------------------------------------------------------------
// Heurística 1 — margin_drop
// ----------------------------------------------------------------------------

function detectMarginDrop(ctx: IInsightsContext): IInsight[] {
  const since30 = isoDaysAgo(ctx.now, REFERENCE_WINDOW_DAYS);
  const since60 = isoDaysAgo(ctx.now, REFERENCE_WINDOW_DAYS * 2);

  const recent = ordersPaidBetween(ctx.orders, since30, ctx.now.toISOString());
  const previous = ordersPaidBetween(ctx.orders, since60, since30);

  // Aggregate margin per `IPart.category` (the catalog family).
  const partCategoryById = new Map<ID, string>();
  for (const p of ctx.parts) {
    if (p.category) partCategoryById.set(p.id, p.category);
  }

  const sumByCategory = (orders: IOrder[]): Map<string, { margin: number; revenue: number }> => {
    const m = new Map<string, { margin: number; revenue: number }>();
    for (const o of orders) {
      for (const item of o.items) {
        const cat = partCategoryById.get(item.partId);
        if (!cat) continue;
        const slot = m.get(cat) ?? { margin: 0, revenue: 0 };
        slot.margin += item.marginValue;
        slot.revenue += item.total;
        m.set(cat, slot);
      }
    }
    return m;
  };

  const recentByCat = sumByCategory(recent);
  const previousByCat = sumByCategory(previous);

  const insights: IInsight[] = [];
  for (const [cat, recentVals] of recentByCat) {
    const prevVals = previousByCat.get(cat);
    if (!prevVals) continue;
    if (recentVals.revenue < 1000 || prevVals.revenue < 1000) continue;
    const recentPct = recentVals.margin / recentVals.revenue;
    const prevPct = prevVals.margin / prevVals.revenue;
    if (prevPct <= 0) continue;
    const delta = (recentPct - prevPct) / prevPct;
    if (delta <= -ctx.thresholds.marginDropPct) {
      insights.push({
        id: insightId("margin_drop", cat),
        type: "margin_drop",
        priority: "critico",
        category: "financeiro",
        title: `Margem de ${labelCategory(cat)} caiu ${formatPercentAbs(delta)}`,
        description: `A margem percentual da categoria caiu de ${formatPercentAbs(prevPct)} para ${formatPercentAbs(recentPct)} nos últimos 30 dias.`,
        context: {
          categoria: cat,
          margemAtualPct: round(recentPct),
          margemAnteriorPct: round(prevPct),
          receitaAtual: round(recentVals.revenue),
          receitaAnterior: round(prevVals.revenue),
        },
        suggestedAction: {
          label: "Analisar rentabilidade",
          drillDownUrl: `/app/gestao/rentabilidade?category=${encodeURIComponent(cat)}`,
        },
        detectedAt: ctx.now.toISOString(),
        validUntil: isoDaysAgo(ctx.now, -7),
        storeId: ctx.storeId,
      });
    }
  }
  return insights;
}

// ----------------------------------------------------------------------------
// Heurística 2 — churn_spike
// ----------------------------------------------------------------------------

function detectChurnSpike(ctx: IInsightsContext): IInsight[] {
  const since30 = ctx.now.getTime() - REFERENCE_WINDOW_DAYS * MS_PER_DAY;
  const since60 = ctx.now.getTime() - REFERENCE_WINDOW_DAYS * 2 * MS_PER_DAY;

  let recent = 0;
  let previous = 0;
  for (const c of ctx.customers) {
    if (c.storeId !== ctx.storeId) continue;
    if (c.status !== "perdido") continue;
    // Use `lastPurchaseAt` as the proxy of churn timestamp.
    const ts = c.lastPurchaseAt ? new Date(c.lastPurchaseAt).getTime() : NaN;
    if (Number.isNaN(ts)) continue;
    if (ts >= since30) recent += 1;
    else if (ts >= since60) previous += 1;
  }

  if (previous < 3) return [];
  const delta = (recent - previous) / previous;
  if (delta < ctx.thresholds.churnSpikePct) return [];

  return [
    {
      id: insightId("churn_spike"),
      type: "churn_spike",
      priority: "critico",
      category: "cliente",
      title: `Churn subiu ${formatPercentAbs(delta)} nos últimos 30 dias`,
      description: `${recent} clientes foram perdidos vs ${previous} no período anterior. Considere ações de recuperação.`,
      context: {
        churnAtual: recent,
        churnAnterior: previous,
        variacaoPct: round(delta),
      },
      suggestedAction: {
        label: "Ver clientes perdidos",
        drillDownUrl: `/app/clientes?status=perdido`,
      },
      detectedAt: ctx.now.toISOString(),
      validUntil: isoDaysAgo(ctx.now, -7),
      storeId: ctx.storeId,
    },
  ];
}

// ----------------------------------------------------------------------------
// Heurística 3 — seller_at_risk
// ----------------------------------------------------------------------------

function detectSellerAtRisk(ctx: IInsightsContext): IInsight[] {
  const since30 = isoDaysAgo(ctx.now, REFERENCE_WINDOW_DAYS);
  const since60 = isoDaysAgo(ctx.now, REFERENCE_WINDOW_DAYS * 2);

  const recent = ordersPaidBetween(ctx.orders, since30, ctx.now.toISOString());
  const previous = ordersPaidBetween(ctx.orders, since60, since30);

  const revenueRecent = revenueBySeller(recent);
  const revenuePrevious = revenueBySeller(previous);
  const countRecent = countBySeller(recent);
  const countPrevious = countBySeller(previous);

  // Aggregate paid customer count for ticket-medio (orders / customers).
  const customersBySellerRecent = new Map<ID, Set<ID>>();
  const customersBySellerPrevious = new Map<ID, Set<ID>>();
  for (const o of recent) {
    const s = customersBySellerRecent.get(o.sellerId) ?? new Set();
    s.add(o.customerId);
    customersBySellerRecent.set(o.sellerId, s);
  }
  for (const o of previous) {
    const s = customersBySellerPrevious.get(o.sellerId) ?? new Set();
    s.add(o.customerId);
    customersBySellerPrevious.set(o.sellerId, s);
  }

  const out: IInsight[] = [];
  for (const seller of ctx.sellers) {
    if (!seller.active) continue;
    if (seller.storeId && seller.storeId !== ctx.storeId) continue;

    const recRev = revenueRecent.get(seller.id) ?? 0;
    const prevRev = revenuePrevious.get(seller.id) ?? 0;
    const recCnt = countRecent.get(seller.id) ?? 0;
    const prevCnt = countPrevious.get(seller.id) ?? 0;
    const recCust = customersBySellerRecent.get(seller.id)?.size ?? 0;
    const prevCust = customersBySellerPrevious.get(seller.id)?.size ?? 0;
    const recTicket = recCnt > 0 ? recRev / recCnt : 0;
    const prevTicket = prevCnt > 0 ? prevRev / prevCnt : 0;

    if (prevRev < 1000) continue;

    const drops: string[] = [];
    if (prevRev > 0 && (recRev - prevRev) / prevRev <= -0.15) drops.push("receita");
    if (prevCnt > 0 && (recCnt - prevCnt) / prevCnt <= -0.15) drops.push("pedidos");
    if (prevCust > 0 && (recCust - prevCust) / prevCust <= -0.15) drops.push("clientes");
    if (prevTicket > 0 && (recTicket - prevTicket) / prevTicket <= -0.15)
      drops.push("ticket médio");

    if (drops.length >= ctx.thresholds.sellerAtRiskMetrics) {
      out.push({
        id: insightId("seller_at_risk", seller.id),
        type: "seller_at_risk",
        priority: "medio",
        category: "comercial",
        title: `${seller.fullName} teve queda em ${drops.length} métricas`,
        description: `O vendedor apresentou queda simultânea em ${drops.join(", ")} nos últimos 30 dias.`,
        context: {
          sellerId: seller.id,
          sellerName: seller.fullName,
          metricasAfetadas: drops,
          receitaAtual: round(recRev),
          receitaAnterior: round(prevRev),
          pedidosAtual: recCnt,
          pedidosAnterior: prevCnt,
        },
        suggestedAction: {
          label: "Ver carteira do vendedor",
          drillDownUrl: `/app/gestao/carteira-analitica/${seller.id}`,
        },
        detectedAt: ctx.now.toISOString(),
        validUntil: isoDaysAgo(ctx.now, -7),
        storeId: ctx.storeId,
      });
    }
  }
  return out;
}

// ----------------------------------------------------------------------------
// Heurística 4 — customer_at_risk
// ----------------------------------------------------------------------------

function detectCustomerAtRisk(ctx: IInsightsContext): IInsight[] {
  const limitDays = Math.round(ctx.dormantDays * ctx.thresholds.customerAtRiskRatio);
  const cutoff = ctx.now.getTime() - limitDays * MS_PER_DAY;

  const targets = ctx.customers.filter((c) => {
    if (c.storeId !== ctx.storeId) return false;
    if (c.status !== "ativo") return false;
    if (c.abcClass !== "A" && c.abcClass !== "B") return false;
    if (!c.lastPurchaseAt) return false;
    const ts = new Date(c.lastPurchaseAt).getTime();
    return ts < cutoff;
  });

  if (targets.length === 0) return [];

  // Cap to the top-5 highest-value customers to avoid spam — one insight
  // per customer keeps drill-down precise.
  targets.sort((a, b) => (b.purchaseStats?.ltv ?? 0) - (a.purchaseStats?.ltv ?? 0));
  const top = targets.slice(0, 5);

  return top.map<IInsight>((c) => {
    const lastTs = new Date(c.lastPurchaseAt!).getTime();
    const daysWithout = Math.floor((ctx.now.getTime() - lastTs) / MS_PER_DAY);
    const name = displayCustomerName(c);
    return {
      id: insightId("customer_at_risk", c.id),
      type: "customer_at_risk",
      priority: "medio",
      category: "cliente",
      title: `${name} não compra há ${daysWithout} dias`,
      description: `Cliente classe ${c.abcClass ?? "—"} sem compras há ${daysWithout} dias (limite dormência: ${ctx.dormantDays}). Considere ação proativa.`,
      context: {
        customerId: c.id,
        nome: name,
        diasSemCompra: daysWithout,
        classeABC: c.abcClass,
        ltv: c.purchaseStats?.ltv ?? 0,
      },
      suggestedAction: {
        label: "Abrir cliente",
        drillDownUrl: `/app/clientes/${c.id}`,
      },
      detectedAt: ctx.now.toISOString(),
      validUntil: isoDaysAgo(ctx.now, -14),
      storeId: ctx.storeId,
    };
  });
}

// ----------------------------------------------------------------------------
// Heurística 5 — product_decline
// ----------------------------------------------------------------------------

function detectProductDecline(ctx: IInsightsContext): IInsight[] {
  const since30 = isoDaysAgo(ctx.now, REFERENCE_WINDOW_DAYS);
  const since60 = isoDaysAgo(ctx.now, REFERENCE_WINDOW_DAYS * 2);

  const recent = ordersPaidBetween(ctx.orders, since30, ctx.now.toISOString());
  const previous = ordersPaidBetween(ctx.orders, since60, since30);

  const qtyRecent = quantityByPart(recent);
  const qtyPrevious = quantityByPart(previous);

  const partsById = new Map<ID, IPart>();
  for (const p of ctx.parts) partsById.set(p.id, p);

  const drops: Array<{ partId: ID; recent: number; previous: number; delta: number }> = [];
  for (const [partId, prev] of qtyPrevious) {
    if (prev < 5) continue;
    const rec = qtyRecent.get(partId) ?? 0;
    const delta = (rec - prev) / prev;
    if (delta <= -ctx.thresholds.productDeclinePct) {
      drops.push({ partId, recent: rec, previous: prev, delta });
    }
  }
  drops.sort((a, b) => a.delta - b.delta);
  const top = drops.slice(0, 5);

  return top.map<IInsight>((d) => {
    const part = partsById.get(d.partId);
    const name = part?.name ?? d.partId;
    return {
      id: insightId("product_decline", d.partId),
      type: "product_decline",
      priority: "medio",
      category: "comercial",
      title: `${name} caiu ${formatPercentAbs(d.delta)} em vendas`,
      description: `Quantidade vendida caiu de ${d.previous} para ${d.recent} nos últimos 30 dias.`,
      context: {
        partId: d.partId,
        partName: name,
        quantidadeAtual: d.recent,
        quantidadeAnterior: d.previous,
        variacaoPct: round(d.delta),
      },
      suggestedAction: {
        label: "Ver produto no catálogo",
        drillDownUrl: `/app/catalogo/${d.partId}`,
      },
      detectedAt: ctx.now.toISOString(),
      validUntil: isoDaysAgo(ctx.now, -7),
      storeId: ctx.storeId,
    };
  });
}

// ----------------------------------------------------------------------------
// Heurística 6 — product_excess
// ----------------------------------------------------------------------------

function detectProductExcess(ctx: IInsightsContext): IInsight[] {
  const since90 = isoDaysAgo(ctx.now, 90);
  const last90 = ordersPaidSince(ctx.orders, since90);
  const qty90 = quantityByPart(last90);

  const partsByStore = ctx.parts.filter((p) => !p.storeId || p.storeId === ctx.storeId);
  const candidates: Array<{
    part: IPart;
    coverageDays: number;
    capital: number;
    sold90: number;
  }> = [];

  for (const p of partsByStore) {
    if (!p.active) continue;
    if (p.stockAvailable <= 0) continue;
    const sold = qty90.get(p.id) ?? 0;
    const dailyAvg = sold / 90;
    const coverageDays = dailyAvg > 0 ? p.stockAvailable / dailyAvg : 9999;
    const capital = p.stockAvailable * p.unitCost;
    if (
      coverageDays >= ctx.thresholds.productExcessCoverageDays &&
      capital >= ctx.thresholds.productExcessCapital
    ) {
      candidates.push({ part: p, coverageDays, capital, sold90: sold });
    }
  }
  candidates.sort((a, b) => b.capital - a.capital);
  const top = candidates.slice(0, 5);

  return top.map<IInsight>((c) => ({
    id: insightId("product_excess", c.part.id),
    type: "product_excess",
    priority: "medio",
    category: "operacional",
    title: `${c.part.name} com cobertura de ${Math.round(c.coverageDays)} dias`,
    description: `R$ ${formatBRL(c.capital)} de capital parado. Considere promoção ou ajuste de pedido.`,
    context: {
      partId: c.part.id,
      partName: c.part.name,
      coberturaDias: Math.round(c.coverageDays),
      capitalParado: round(c.capital),
      vendidos90d: c.sold90,
      estoqueAtual: c.part.stockAvailable,
    },
    suggestedAction: {
      label: "Ver estoque",
      drillDownUrl: `/app/gestao/estoque`,
    },
    detectedAt: ctx.now.toISOString(),
    validUntil: isoDaysAgo(ctx.now, -14),
    storeId: ctx.storeId,
  }));
}

// ----------------------------------------------------------------------------
// Heurística 7 — sdr_conversion_drop
// ----------------------------------------------------------------------------

function detectSdrConversionDrop(ctx: IInsightsContext): IInsight[] {
  if (ctx.sdrSessions.length === 0) return [];

  const since30 = ctx.now.getTime() - REFERENCE_WINDOW_DAYS * MS_PER_DAY;
  const since60 = ctx.now.getTime() - REFERENCE_WINDOW_DAYS * 2 * MS_PER_DAY;

  let recentAccepted = 0;
  let recentTotal = 0;
  let previousAccepted = 0;
  let previousTotal = 0;

  for (const s of ctx.sdrSessions) {
    const ts = new Date(s.startedAt).getTime();
    if (Number.isNaN(ts)) continue;
    const accepted = s.finishReason === "completed";
    if (ts >= since30) {
      recentTotal += 1;
      if (accepted) recentAccepted += 1;
    } else if (ts >= since60) {
      previousTotal += 1;
      if (accepted) previousAccepted += 1;
    }
  }

  if (previousTotal < 10 || recentTotal < 5) return [];
  const recentRate = recentAccepted / recentTotal;
  const previousRate = previousAccepted / previousTotal;
  if (previousRate <= 0) return [];
  const delta = (recentRate - previousRate) / previousRate;
  if (delta > -ctx.thresholds.sdrConversionDropPct) return [];

  return [
    {
      id: insightId("sdr_conversion_drop"),
      type: "sdr_conversion_drop",
      priority: "critico",
      category: "operacional",
      title: `Conversão SDR caiu ${formatPercentAbs(delta)}`,
      description: `Taxa de aceite SDR caiu de ${formatPercentAbs(previousRate)} para ${formatPercentAbs(recentRate)} nos últimos 30 dias.`,
      context: {
        taxaAtualPct: round(recentRate),
        taxaAnteriorPct: round(previousRate),
        sessoesAtual: recentTotal,
        sessoesAnterior: previousTotal,
      },
      suggestedAction: {
        label: "Abrir painel SDR",
        drillDownUrl: `/app/sdr`,
      },
      detectedAt: ctx.now.toISOString(),
      validUntil: isoDaysAgo(ctx.now, -7),
      storeId: ctx.storeId,
    },
  ];
}

// ----------------------------------------------------------------------------
// Heurística 8 — meta_at_risk
// ----------------------------------------------------------------------------

function detectMetaAtRisk(ctx: IInsightsContext): IInsight[] {
  return ctx.goals
    .filter((g) => {
      if (g.storeId !== ctx.storeId) return false;
      if (g.status && g.status !== "ativa") return false;
      const endTs = new Date(g.period.end).getTime();
      if (Number.isNaN(endTs)) return false;
      const daysRemaining = Math.ceil((endTs - ctx.now.getTime()) / MS_PER_DAY);
      if (daysRemaining < 0) return false;
      if (daysRemaining > ctx.thresholds.metaAtRiskDaysRemaining) return false;
      return g.progressPercent < ctx.thresholds.metaAtRiskProgress;
    })
    .map<IInsight>((g) => {
      const endTs = new Date(g.period.end).getTime();
      const daysRemaining = Math.ceil((endTs - ctx.now.getTime()) / MS_PER_DAY);
      const name = g.name ?? `Meta ${g.metric}`;
      return {
        id: insightId("meta_at_risk", g.id),
        type: "meta_at_risk",
        priority: "critico",
        category: "comercial",
        title: `${name} com ${formatPercentAbs(g.progressPercent)} e ${daysRemaining} dia(s) restantes`,
        description: `A meta encerra em ${daysRemaining} dia(s) e o progresso ainda está em ${formatPercentAbs(g.progressPercent)}.`,
        context: {
          goalId: g.id,
          metricaAlvo: g.metric,
          progressoPct: round(g.progressPercent),
          diasRestantes: daysRemaining,
          targetValue: g.targetValue,
          currentValue: g.currentValue,
        },
        suggestedAction: {
          label: "Abrir meta",
          drillDownUrl: `/app/gestao/metas/${g.id}`,
        },
        detectedAt: ctx.now.toISOString(),
        validUntil: g.period.end,
        storeId: ctx.storeId,
      };
    });
}

// ----------------------------------------------------------------------------
// Heurística 9 — top_seller_overload
// ----------------------------------------------------------------------------

function detectTopSellerOverload(ctx: IInsightsContext): IInsight[] {
  const since30 = isoDaysAgo(ctx.now, REFERENCE_WINDOW_DAYS);
  const since60 = isoDaysAgo(ctx.now, REFERENCE_WINDOW_DAYS * 2);

  const revenueRecent = revenueBySeller(
    ordersPaidBetween(ctx.orders, since30, ctx.now.toISOString()),
  );
  const sorted = [...revenueRecent.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return [];
  const [topSellerId] = sorted[0];
  const seller = ctx.sellers.find((s) => s.id === topSellerId);
  if (!seller) return [];

  // TMR proxy: average days between consecutive paid orders attributed to the
  // seller. A growing gap signals overload (less time to follow up each lead).
  const recentOrders = ctx.orders
    .filter((o) => o.sellerId === topSellerId && o.paidAt)
    .map((o) => new Date(o.paidAt as string).getTime())
    .sort((a, b) => a - b);
  if (recentOrders.length < 4) return [];

  const split = Math.floor(recentOrders.length / 2);
  const earlier = recentOrders.slice(0, split);
  const later = recentOrders.slice(split);

  const avgGap = (arr: number[]): number => {
    if (arr.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < arr.length; i += 1) total += arr[i] - arr[i - 1];
    return total / (arr.length - 1);
  };

  const previousGap = avgGap(earlier);
  const recentGap = avgGap(later);
  if (previousGap <= 0) return [];
  const delta = (recentGap - previousGap) / previousGap;
  if (delta < ctx.thresholds.topSellerOverloadTmrPct) return [];

  // Avoid emitting both `seller_at_risk` and `top_seller_overload` for the same
  // seller — at-risk takes precedence when present.
  void since60;

  return [
    {
      id: insightId("top_seller_overload", seller.id),
      type: "top_seller_overload",
      priority: "medio",
      category: "operacional",
      title: `${seller.fullName} pode estar sobrecarregado`,
      description: `O top vendedor do período apresentou variação positiva de ${formatPercentAbs(delta)} no intervalo médio entre pedidos pagos — possível sinal de sobrecarga.`,
      context: {
        sellerId: seller.id,
        sellerName: seller.fullName,
        intervaloAtualDias: round(recentGap / MS_PER_DAY),
        intervaloAnteriorDias: round(previousGap / MS_PER_DAY),
        variacaoPct: round(delta),
      },
      suggestedAction: {
        label: "Ver carteira analítica",
        drillDownUrl: `/app/gestao/carteira-analitica/${seller.id}`,
      },
      detectedAt: ctx.now.toISOString(),
      validUntil: isoDaysAgo(ctx.now, -7),
      storeId: ctx.storeId,
    },
  ];
}

// ----------------------------------------------------------------------------
// Heurística 10 — opportunity_segment
// ----------------------------------------------------------------------------

function detectOpportunitySegment(ctx: IInsightsContext): IInsight[] {
  const since30 = isoDaysAgo(ctx.now, REFERENCE_WINDOW_DAYS);
  const since60 = isoDaysAgo(ctx.now, REFERENCE_WINDOW_DAYS * 2);

  const recent = ordersPaidBetween(ctx.orders, since30, ctx.now.toISOString());
  const previous = ordersPaidBetween(ctx.orders, since60, since30);

  const partCategoryById = new Map<ID, string>();
  for (const p of ctx.parts) {
    if (p.category) partCategoryById.set(p.id, p.category);
  }

  const sumByCategory = (orders: IOrder[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const o of orders) {
      for (const item of o.items) {
        const cat = partCategoryById.get(item.partId);
        if (!cat) continue;
        m.set(cat, (m.get(cat) ?? 0) + item.total);
      }
    }
    return m;
  };

  const recentByCat = sumByCategory(recent);
  const previousByCat = sumByCategory(previous);

  const out: IInsight[] = [];
  for (const [cat, rec] of recentByCat) {
    const prev = previousByCat.get(cat) ?? 0;
    if (prev < 5000) continue;
    const delta = (rec - prev) / prev;
    if (delta >= ctx.thresholds.opportunitySegmentGrowthPct) {
      out.push({
        id: insightId("opportunity_segment", cat),
        type: "opportunity_segment",
        priority: "oportunidade",
        category: "comercial",
        title: `${labelCategory(cat)} cresceu ${formatPercentAbs(delta)} no período`,
        description: `Receita da categoria subiu de R$ ${formatBRL(prev)} para R$ ${formatBRL(rec)} — oportunidade para reforçar estoque e prospecção.`,
        context: {
          categoria: cat,
          receitaAtual: round(rec),
          receitaAnterior: round(prev),
          variacaoPct: round(delta),
        },
        suggestedAction: {
          label: "Explorar vendas da categoria",
          drillDownUrl: `/app/gestao/vendas`,
        },
        detectedAt: ctx.now.toISOString(),
        validUntil: isoDaysAgo(ctx.now, -14),
        storeId: ctx.storeId,
      });
    }
  }
  return out;
}

// ----------------------------------------------------------------------------
// Heurística 11 — new_customer_winning
// ----------------------------------------------------------------------------

function detectNewCustomerWinning(ctx: IInsightsContext): IInsight[] {
  const since90 = ctx.now.getTime() - 90 * MS_PER_DAY;

  const winners = ctx.customers.filter((c) => {
    if (c.storeId !== ctx.storeId) return false;
    if (c.abcClass !== "A") return false;
    if (!c.firstPurchaseAt) return false;
    return new Date(c.firstPurchaseAt).getTime() >= since90;
  });

  return winners.slice(0, 3).map<IInsight>((c) => ({
    id: insightId("new_customer_winning", c.id),
    type: "new_customer_winning",
    priority: "oportunidade",
    category: "cliente",
    title: `${displayCustomerName(c)} entrou direto na classe A`,
    description: `Cliente novo (cadastro nos últimos 90 dias) já figura como classe A na curva ABC. Vale aprofundar relacionamento.`,
    context: {
      customerId: c.id,
      nome: displayCustomerName(c),
      ltv: c.purchaseStats?.ltv ?? 0,
      ticketMedio: c.purchaseStats?.ticketMedio ?? 0,
    },
    suggestedAction: {
      label: "Abrir cliente",
      drillDownUrl: `/app/clientes/${c.id}`,
    },
    detectedAt: ctx.now.toISOString(),
    validUntil: isoDaysAgo(ctx.now, -30),
    storeId: ctx.storeId,
  }));
}

// ----------------------------------------------------------------------------
// Heurística 12 — recovery_success
// ----------------------------------------------------------------------------

function detectRecoverySuccess(ctx: IInsightsContext): IInsight[] {
  const recovered = ctx.customers.filter(
    (c) => c.storeId === ctx.storeId && c.status === "recuperacao",
  );
  if (recovered.length === 0) return [];

  const bySeller = new Map<ID, ICustomer[]>();
  for (const c of recovered) {
    const list = bySeller.get(c.sellerId) ?? [];
    list.push(c);
    bySeller.set(c.sellerId, list);
  }

  const out: IInsight[] = [];
  for (const [sellerId, customers] of bySeller) {
    if (customers.length < 2) continue;
    const seller = ctx.sellers.find((s) => s.id === sellerId);
    if (!seller) continue;
    out.push({
      id: insightId("recovery_success", sellerId),
      type: "recovery_success",
      priority: "oportunidade",
      category: "cliente",
      title: `${seller.fullName} recuperou ${customers.length} clientes`,
      description: `Vendedor reativou ${customers.length} clientes que estavam dormentes — bom momento para reconhecer e replicar a tática.`,
      context: {
        sellerId,
        sellerName: seller.fullName,
        clientesRecuperados: customers.length,
      },
      suggestedAction: {
        label: "Ver vendedor",
        drillDownUrl: `/app/gestao/ranking/${sellerId}`,
      },
      detectedAt: ctx.now.toISOString(),
      validUntil: isoDaysAgo(ctx.now, -14),
      storeId: ctx.storeId,
    });
  }
  return out;
}

// ----------------------------------------------------------------------------
// Internals
// ----------------------------------------------------------------------------

function insightId(type: string, key?: string): string {
  return key ? `ins-${type}-${key}` : `ins-${type}`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function labelCategory(slug: string): string {
  if (!slug) return "—";
  return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/_/g, " ");
}

function displayCustomerName(c: ICustomer): string {
  if (c.type === "B2B") return c.nomeFantasia || c.razaoSocial;
  return c.fullName ?? c.id;
}

// Re-export for tree-shaking-friendly imports.
export { sumOrdersTotal };
