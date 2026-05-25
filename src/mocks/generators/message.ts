import type { IConversation, IMessage, ID } from "@/shared/types";
import { pickWeighted, type ISeededContext } from "./utils";

const CUSTOMER_LINES = [
  "Bom dia! Vocês têm pastilha de freio para Volvo FH 460?",
  "Qual o prazo de entrega para Frederico Westphalen?",
  "Esse preço é à vista ou parcelado?",
  "Consegue mandar foto da peça?",
  "Vou conferir e te respondo ainda hoje.",
  "Pode emitir a nota em nome da empresa, por favor.",
  "Esse turbocompressor é original ou genérico?",
  "Estou precisando para a frota toda — qual o desconto?",
  "Combinado, pode enviar o boleto.",
  "Recebi a peça, perfeita. Obrigado!",
];

const SELLER_LINES = [
  "Bom dia! Sim, temos pronto entrega.",
  "Prazo é 24h para a região, frete CIF.",
  "À vista temos 5% de desconto, no boleto fica 28 dias.",
  "Já te envio aqui pelo WhatsApp.",
  "É linha original Bosch, com garantia de 12 meses.",
  "Vou montar uma cotação especial considerando o volume.",
  "Posso te ligar para alinhar os detalhes?",
  "Já mandei a NF e o boleto pro e-mail cadastrado.",
  "Obrigado pela confiança! Qualquer coisa, estou à disposição.",
];

const SDR_LINES = [
  "Olá! Sou o assistente da GALLO Base Diesel — em que posso ajudar?",
  "Para qual veículo é a peça? Marca, modelo e ano por favor.",
  "Vou consultar nosso estoque, um momento…",
  "Encontrei opções compatíveis. Posso enviar a cotação?",
  "Vou transferir para um vendedor humano finalizar com você. Um instante.",
];

/**
 * Generate the message thread of a conversation.
 *
 * The thread always starts with a customer-side message, alternates with
 * meaningful gaps and the very last message timestamp matches
 * `conversation.lastMessageAt`.
 */
export function generateMessagesForConversation(
  ctx: ISeededContext,
  conversation: IConversation,
  startSequence: number,
): IMessage[] {
  const count = pickWeighted(ctx, [
    { value: 2, weight: 2 },
    { value: 5, weight: 4 },
    { value: 8, weight: 6 },
    { value: 14, weight: 3 },
    { value: 25, weight: 1 },
  ]);

  const lastAt = new Date(conversation.lastMessageAt).getTime();
  const startAt = new Date(conversation.createdAt).getTime();
  const span = Math.max(0, lastAt - startAt);
  const out: IMessage[] = [];

  for (let i = 0; i < count; i += 1) {
    const ratio = count === 1 ? 1 : i / (count - 1);
    const ts = new Date(startAt + ratio * span).toISOString();
    const isCustomer = i === 0 ? true : ctx.bool(0.55);
    const authorType = isCustomer
      ? "customer"
      : conversation.isSdrActive && ctx.bool(0.6)
        ? "sdr"
        : "seller";
    const direction = isCustomer ? "in" : "out";
    const text = isCustomer
      ? ctx.pick(CUSTOMER_LINES)
      : authorType === "sdr"
        ? ctx.pick(SDR_LINES)
        : ctx.pick(SELLER_LINES);
    const mediaType = ctx.bool(0.05) ? ("image" as const) : undefined;

    const message: IMessage = {
      id: `msg-${String(startSequence + i + 1).padStart(5, "0")}`,
      conversationId: conversation.id,
      direction,
      authorType,
      authorId: authorTypeToId(authorType, conversation),
      provider:
        conversation.channel === "whatsapp" ? (ctx.bool(0.6) ? "meta" : "evolution") : "mock",
      text,
      mediaType,
      mediaUrl: mediaType
        ? `https://picsum.photos/seed/${conversation.id}-${i}/600/400`
        : undefined,
      status: pickStatus(ctx, direction),
      sentAt: ts,
      deliveredAt: direction === "out" ? ts : undefined,
      readAt: direction === "out" && ctx.bool(0.7) ? ts : undefined,
    };
    out.push(message);
  }

  return out;
}

function authorTypeToId(
  authorType: IMessage["authorType"],
  conversation: IConversation,
): ID | undefined {
  switch (authorType) {
    case "customer":
      return conversation.customerId ?? conversation.leadId;
    case "seller":
      return conversation.assignedSellerId;
    case "sdr":
      return "sdr-agent";
    case "system":
      return undefined;
  }
}

function pickStatus(ctx: ISeededContext, direction: IMessage["direction"]): IMessage["status"] {
  if (direction === "in") return "delivered";
  return pickWeighted(ctx, [
    { value: "sent" as const, weight: 1 },
    { value: "delivered" as const, weight: 3 },
    { value: "read" as const, weight: 5 },
    { value: "failed" as const, weight: 1 },
  ]);
}
