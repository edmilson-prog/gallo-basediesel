import type { ICustomer, IRecommendation, ID, RecommendationType } from "@/shared/types";
import { SEED_STORE_ID } from "../data";
import { daysAgo, pickWeighted, randomISO, type ISeededContext } from "./utils";

const MVP_TYPES: RecommendationType[] = ["recovery", "vehicle_maintenance", "follow_up"];

const PRIORITY_WEIGHTS = [
  { value: "high" as const, weight: 2 },
  { value: "medium" as const, weight: 4 },
  { value: "low" as const, weight: 3 },
  { value: "critical" as const, weight: 1 },
];

const COPY_BY_TYPE: Record<RecommendationType, { title: string; description: string }> = {
  recovery: {
    title: "Cliente dormente — abordagem de recuperação",
    description: "Sem compra nos últimos 60 dias. Sugerir contato para retomar relacionamento.",
  },
  vehicle_maintenance: {
    title: "Manutenção preventiva prevista",
    description:
      "Histórico do veículo indica troca próxima de filtros e óleo. Oferecer kit completo.",
  },
  follow_up: {
    title: "Follow-up de orçamento",
    description: "Orçamento enviado há mais de 5 dias sem resposta. Acompanhar com o cliente.",
  },
  cross_sell: { title: "", description: "" },
  up_sell: { title: "", description: "" },
  equivalence: { title: "", description: "" },
  stock_alert: { title: "", description: "" },
  birthday: { title: "", description: "" },
  wallet_imbalance: { title: "", description: "" },
  positivacao_gap: { title: "", description: "" },
};

export function generateRecommendation(
  ctx: ISeededContext,
  options: { sequence: number; customer: ICustomer },
): IRecommendation {
  const type = ctx.pick(MVP_TYPES);
  const copy = COPY_BY_TYPE[type];
  const id: ID = `reco-${String(options.sequence + 1).padStart(4, "0")}`;
  const createdAt = randomISO(ctx, daysAgo(14), new Date());
  const resolved = ctx.bool(0.3);

  return {
    id,
    storeId: SEED_STORE_ID,
    sellerId: options.customer.sellerId ?? "",
    subjectId: options.customer.id,
    type,
    priority: pickWeighted(ctx, PRIORITY_WEIGHTS),
    title: copy.title,
    description: copy.description,
    actionHref: `/app/clientes/${options.customer.id}`,
    resolved,
    createdAt,
    resolvedAt: resolved ? randomISO(ctx, new Date(createdAt), new Date()) : undefined,
  };
}
