import type {
  IConversation,
  ICustomer,
  ID,
  ISdrContextSummary,
  ISdrEscalation,
  ISdrSession,
  SdrEscalationMode,
  SdrEscalationReason,
  SdrEscalationStatus,
} from "@/shared/types";
import { type ISeededContext } from "./utils";

interface IGenerateSdrEscalationInput {
  sequence: number;
  session: ISdrSession;
  conversation: IConversation;
  customer?: ICustomer;
  sellerIds: ID[];
  now?: Date;
}

const REASON_WEIGHTS: { value: SdrEscalationReason; weight: number }[] = [
  { value: "customer_requested", weight: 40 },
  { value: "negotiation_detected", weight: 30 },
  { value: "sdr_failed", weight: 15 },
  { value: "complexity", weight: 10 },
  { value: "out_of_scope", weight: 5 },
];

const STATUS_WEIGHTS: { value: SdrEscalationStatus; weight: number }[] = [
  { value: "answered", weight: 55 },
  { value: "assigned", weight: 25 },
  { value: "pending", weight: 10 },
  { value: "abandoned", weight: 10 },
];

const SAMPLE_BRANDS = ["Volvo", "Scania", "Mercedes-Benz", "Ford", "Iveco"];
const SAMPLE_PARTS = [
  { name: "Filtro de óleo", oem: "21380488", original: true },
  { name: "Pastilha de freio dianteira", oem: "20966401", original: false },
  { name: "Injetor de combustível", oem: "21006085", original: true },
  { name: "Embreagem completa", oem: "20785970", original: true },
  { name: "Rolamento de roda", oem: "21574794", original: false },
];

function pickWeightedReason(ctx: ISeededContext): SdrEscalationReason {
  const total = REASON_WEIGHTS.reduce((acc, w) => acc + w.weight, 0);
  let roll = ctx.int(1, total);
  for (const entry of REASON_WEIGHTS) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return "customer_requested";
}

function pickWeightedStatus(ctx: ISeededContext): SdrEscalationStatus {
  const total = STATUS_WEIGHTS.reduce((acc, w) => acc + w.weight, 0);
  let roll = ctx.int(1, total);
  for (const entry of STATUS_WEIGHTS) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return "answered";
}

function modeFor(reason: SdrEscalationReason): SdrEscalationMode {
  if (reason === "customer_requested") return "urgent";
  if (reason === "negotiation_detected" || reason === "complexity") return "normal";
  return "standard";
}

function buildSyntheticSummary(
  ctx: ISeededContext,
  input: IGenerateSdrEscalationInput,
  reason: SdrEscalationReason,
  startedAt: string,
  assignedAt: string,
): ISdrContextSummary {
  const customerName =
    input.customer?.type === "B2B"
      ? input.customer.contactName
      : input.customer?.type === "B2C"
        ? input.customer.fullName
        : input.session.collectedData.name;
  const customerCompany =
    input.customer?.type === "B2B"
      ? input.customer.nomeFantasia || input.customer.razaoSocial
      : input.session.collectedData.company;
  const phone = input.customer?.phone ?? "(55) 99999-0000";
  const brand = ctx.pick(SAMPLE_BRANDS);
  const part = ctx.pick(SAMPLE_PARTS);
  const includeVehicle = ctx.bool(0.85);
  const includePart = ctx.bool(0.75);
  const includeQuote = ctx.bool(0.6);
  const timeInSdr = Math.max(
    30,
    Math.floor((new Date(assignedAt).getTime() - new Date(startedAt).getTime()) / 1000),
  );

  return {
    customerName,
    customerCompany,
    customerPhone: phone,
    isB2B: input.customer?.type === "B2B" || Boolean(customerCompany),
    vehicleIdentified: includeVehicle
      ? { brand, model: `Modelo ${ctx.int(400, 800)}`, year: ctx.int(2014, 2024) }
      : undefined,
    partIdentified: includePart
      ? {
          id: `part-mock-${input.sequence}`,
          name: part.name,
          oemCode: part.oem,
          isOriginal: part.original,
        }
      : undefined,
    quoteGenerated: includeQuote
      ? {
          id: `quote-mock-${input.sequence}`,
          total: Number((ctx.int(8000, 75000) / 100).toFixed(2)),
          validUntil: new Date(
            new Date(assignedAt).getTime() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          status: "enviado",
          shippingIsToNegotiate: ctx.bool(0.4),
        }
      : undefined,
    reasonText:
      reason === "negotiation_detected"
        ? "Cliente pediu desconto"
        : reason === "customer_requested"
          ? "Quero falar com vendedor"
          : undefined,
    conversationLength: ctx.int(6, 24),
    timeInSdr,
    collectedData: {
      name: customerName,
      company: customerCompany,
      needs: input.session.collectedData.needs,
    },
    sdrTrace: [
      { step: "started_at:saudacao", timestamp: startedAt },
      { step: "last_activity:finalizado", timestamp: assignedAt },
    ],
  };
}

/**
 * Synthesize a historical `ISdrEscalation` for the painel + audit log. Fed by
 * the bootstrap right after `generateSdrSession` so the dataset carries enough
 * handoffs to populate metrics (PRD-024).
 */
export function generateSdrEscalation(
  ctx: ISeededContext,
  input: IGenerateSdrEscalationInput,
): ISdrEscalation {
  const reason = pickWeightedReason(ctx);
  const mode = modeFor(reason);
  const status = pickWeightedStatus(ctx);
  const sellerId = ctx.pick(input.sellerIds);
  const startedAt = input.session.startedAt;
  const finished = input.session.finishedAt ?? input.session.lastActivityAt;
  const assignedAt = finished;
  const firstHumanResponseAt =
    status === "answered" || status === "assigned" || status === "abandoned"
      ? new Date(new Date(assignedAt).getTime() + ctx.int(40_000, 600_000)).toISOString()
      : undefined;
  const summary = buildSyntheticSummary(ctx, input, reason, startedAt, assignedAt);

  return {
    id: `escalation-mock-${String(input.sequence + 1).padStart(4, "0")}`,
    sessionId: input.session.id,
    conversationId: input.conversation.id,
    customerId: input.conversation.customerId,
    leadId: input.conversation.leadId,
    storeId: input.conversation.storeId,
    reason,
    reasonDetails: summary.reasonText,
    mode,
    contextSummary: summary,
    assignedSellerId: status === "pending" ? undefined : sellerId,
    assignedAt: status === "pending" ? undefined : assignedAt,
    firstHumanResponseAt: status === "answered" ? firstHumanResponseAt : undefined,
    status,
    specialtyMatched: ctx.bool(0.6),
    createdAt: assignedAt,
  };
}
