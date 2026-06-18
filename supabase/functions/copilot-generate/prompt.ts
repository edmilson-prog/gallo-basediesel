/**
 * Pure prompt builder for the conversation copilot reply (Sub-projeto 1).
 * Runtime-agnostic: NO Deno imports — unit-testable under Vitest (node).
 * The system prompt is supplied separately by the routing config; this builds
 * the USER prompt (recent transcript + a final formatting instruction).
 */

export interface PromptMessage {
  direction: "in" | "out";
  authorType: string; // "customer" | "seller" | "sdr" | "system"
  text: string;
  sentAt: string;
}

export interface PromptCustomer {
  name?: string;
  type?: string; // "B2B" | "B2C"
  status?: string;
}

const DEFAULT_MAX_MESSAGES = 30;
const DEFAULT_MAX_CHARS = 8000;

const INSTRUCTION =
  "Escreva UMA resposta curta e objetiva, em português do Brasil, no tom de um " +
  "vendedor cordial da GALLO, pronta para enviar ao cliente pelo WhatsApp. " +
  "Responda apenas com o texto da mensagem — sem saudações genéricas repetidas, " +
  "sem assinatura e sem aspas.";

function speaker(m: PromptMessage): string {
  if (m.authorType === "customer" || m.direction === "in") return "Cliente";
  if (m.authorType === "sdr") return "SDR";
  return "Vendedor";
}

export function buildReplyPrompt(opts: {
  messages: PromptMessage[];
  customer?: PromptCustomer;
  maxMessages?: number;
  maxChars?: number;
}): string {
  const maxMessages = opts.maxMessages ?? DEFAULT_MAX_MESSAGES;
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;

  const usable = opts.messages.filter((m) => m.text && m.text.trim().length > 0);
  if (usable.length === 0) return "";
  const hasCustomer = usable.some((m) => m.authorType === "customer" || m.direction === "in");
  if (!hasCustomer) return "";

  const recent = usable.slice(-maxMessages);
  let transcript = recent.map((m) => `${speaker(m)}: ${m.text.trim()}`).join("\n");
  if (transcript.length > maxChars) transcript = transcript.slice(transcript.length - maxChars);

  const header: string[] = [];
  if (opts.customer?.name) {
    const tipo = opts.customer.type === "B2B" ? " (empresa)" : "";
    header.push(`Cliente: ${opts.customer.name}${tipo}.`);
  }

  return [
    header.join(" "),
    "Conversa recente (mais antiga no topo):",
    transcript,
    "",
    INSTRUCTION,
  ]
    .filter((s) => s.length > 0)
    .join("\n");
}
