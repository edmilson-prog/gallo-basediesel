import type {
  ICustomer,
  ICopilotBriefing,
  ICopilotPanelData,
  ICopilotSummary,
  ID,
  IMessage,
  ISdrContextSummary,
} from "@/shared/types";
import type { ICopilotProvider } from "../../contracts/copilot";
import { mockConversationsProvider } from "./conversations";
import { mockMessagesProvider } from "./messages";
import { mockCustomersProvider } from "./customers";
import { mockSdrEscalationsProvider } from "./sdrEscalations";
import { runCopilotRules } from "./copilotRules";

function customerDisplayName(customer: ICustomer): string {
  return customer.type === "B2B"
    ? customer.nomeFantasia || customer.razaoSocial || customer.contactName
    : customer.fullName;
}

function daysSince(iso: string | undefined, now: Date): number | undefined {
  if (!iso) return undefined;
  const then = new Date(iso).getTime();
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

function isSameCalendarMonth(iso: string | undefined, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

function buildBriefing(customer: ICustomer, now: Date): ICopilotBriefing {
  return {
    customerName: customerDisplayName(customer),
    lifecycleStatus: customer.status,
    abcClass: customer.abcClass,
    averageTicket: customer.purchaseStats?.ticketMedio,
    ltv: customer.purchaseStats?.ltv,
    recencyDays: daysSince(customer.lastPurchaseAt, now),
    frequency: customer.purchaseStats
      ? `${customer.purchaseStats.orderCount12m} pedidos · 12m`
      : undefined,
    isPositivado: isSameCalendarMonth(customer.lastPurchaseAt, now),
  };
}

function summaryFromSdr(context: ISdrContextSummary): ICopilotSummary {
  const parts: string[] = [];
  if (context.partIdentified) parts.push(`Peça: ${context.partIdentified.name}`);
  if (context.vehicleIdentified) {
    parts.push(
      `Veículo: ${[context.vehicleIdentified.brand, context.vehicleIdentified.model].filter(Boolean).join(" ")}`,
    );
  }
  if (context.quoteGenerated) parts.push("Orçamento enviado pelo SDR");
  const text = parts.length > 0 ? parts.join(" · ") : "Conversa escalada pelo SDR.";
  return { text, source: "sdr", sdrContext: context };
}

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function mockSummaryFromMessages(messages: IMessage[]): ICopilotSummary | undefined {
  const inbound = messages.filter(
    (m) => m.direction === "in" && m.authorType === "customer" && m.text.trim(),
  );
  if (inbound.length === 0) return undefined;
  const first = inbound[0];
  const last = inbound[inbound.length - 1];
  // noUncheckedIndexedAccess: guard both ends even though length > 0 guarantees them
  if (!first || !last) return undefined;
  const text =
    first.id === last.id
      ? `Cliente: "${truncate(last.text)}".`
      : `Cliente iniciou com "${truncate(first.text, 48)}". Pendência atual: "${truncate(last.text, 48)}".`;
  return { text, source: "mock" };
}

export const mockCopilotProvider: ICopilotProvider = {
  async getPanelData(conversationId: ID): Promise<ICopilotPanelData> {
    const conversation = await mockConversationsProvider.get(conversationId);
    const messages = (
      await mockMessagesProvider.list({ conversationId, pageSize: 500, orderDir: "asc" })
    ).data;
    const customer = conversation.customerId
      ? await mockCustomersProvider.get(conversation.customerId)
      : undefined;
    const escalation = await mockSdrEscalationsProvider.getByConversation(conversationId);
    const now = new Date();

    const suggestions = runCopilotRules({ conversation, messages, customer, now });
    const briefing = customer ? buildBriefing(customer, now) : undefined;
    const summary = escalation
      ? summaryFromSdr(escalation.contextSummary)
      : mockSummaryFromMessages(messages);

    return { conversationId, briefing, summary, suggestions };
  },

  async dismissSuggestion(_id: ID): Promise<void> {
    // Fase 1: o estado de dispensa é local na sessão (useCopilotPanel).
    // Gancho para auditoria visual (PRD-006) / persistência na Fase 2.
  },
};
