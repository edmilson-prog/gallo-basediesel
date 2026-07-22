import type {
  ICustomer,
  ICopilotBriefing,
  ICopilotPanelData,
  ICopilotSummary,
  ID,
  ILead,
  IMessage,
  ISdrContextSummary,
  LeadOrigin,
} from "@/shared/types";
import type { ICopilotProvider, ICopilotPanelOptions } from "../../contracts/copilot";
import { mockConversationsProvider } from "./conversations";
import { mockMessagesProvider } from "./messages";
import { mockCustomersProvider } from "./customers";
import { mockLeadsProvider } from "./leads";
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
    kind: "customer",
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

const LEAD_ORIGIN_LABELS: Record<LeadOrigin, string> = {
  whatsapp: "WhatsApp",
  ecommerce: "E-commerce",
  indicacao: "Indicação",
  google: "Google",
  outro: "Outro",
  import: "Importação",
};

/** Briefing for a lead-anchored conversation: no purchase history exists, so
 *  the header shows pipeline stage and origin instead of lifecycle/ABC/ticket. */
function buildLeadBriefing(lead: ILead): ICopilotBriefing {
  return {
    kind: "lead",
    customerName: lead.name,
    leadStage: lead.stage.name,
    leadOrigin: LEAD_ORIGIN_LABELS[lead.origin],
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
      : `Últimas mensagens: "${truncate(first.text, 48)}". Pendência atual: "${truncate(last.text, 48)}".`;
  return { text, source: "mock" };
}

export const mockCopilotProvider: ICopilotProvider = {
  async getPanelData(
    conversationId: ID,
    options?: ICopilotPanelOptions,
  ): Promise<ICopilotPanelData> {
    const conversation = await mockConversationsProvider.get(conversationId);
    const window = Math.min(200, Math.max(1, Math.floor(options?.messageWindow ?? 40)));
    const messages = (
      await mockMessagesProvider.list({
        conversationId,
        page: 1,
        pageSize: window,
        orderDir: "desc",
      })
    ).data
      .slice()
      .reverse();
    const customer = conversation.customerId
      ? await mockCustomersProvider.get(conversation.customerId)
      : undefined;
    const escalation = await mockSdrEscalationsProvider.getByConversation(conversationId);
    const now = new Date();

    const suggestions = runCopilotRules({ conversation, messages, customer, now });
    const lead =
      !customer && conversation.leadId
        ? await mockLeadsProvider.get(conversation.leadId).catch(() => null)
        : null;
    const briefing = customer
      ? buildBriefing(customer, now)
      : lead
        ? buildLeadBriefing(lead)
        : undefined;
    const summary = escalation
      ? summaryFromSdr(escalation.contextSummary)
      : mockSummaryFromMessages(messages);

    return { conversationId, briefing, summary, suggestions };
  },

  async dismissSuggestion(_id: ID): Promise<void> {
    // Fase 1: o estado de dispensa é local na sessão (useCopilotPanel).
    // Gancho para auditoria visual (PRD-006) / persistência na Fase 2.
  },

  async generateReply(conversationId: ID): Promise<string> {
    // Mock has no LLM: fabricate a deterministic draft from the last customer line.
    const messages = (
      await mockMessagesProvider.list({ conversationId, pageSize: 500, orderDir: "asc" })
    ).data;
    const lastInbound = [...messages]
      .reverse()
      .find((m) => m.direction === "in" && m.authorType === "customer" && m.text.trim());
    if (!lastInbound) return "Olá! Como posso ajudar você hoje?";
    const topic = lastInbound.text.trim().slice(0, 60);
    return `Claro! Sobre "${topic}", já verifico aqui e retorno com a melhor condição. 👍`;
  },

  async isReplyGenerationEnabled(): Promise<boolean> {
    // Demo sempre disponível (sem custo): o mock não chama LLM.
    return true;
  },
};
