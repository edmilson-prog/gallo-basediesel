import type { ISdrContextSummary, SdrEscalationMode, SdrEscalationReason } from "@/shared/types";

const SEPARATOR = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

const REASON_LABELS: Record<SdrEscalationReason, string> = {
  customer_requested: "Cliente solicitou atendimento humano",
  negotiation_detected: "Cliente em negociação",
  sdr_failed: "SDR não conseguiu entender a solicitação",
  complexity: "Complexidade alta — atendimento humano",
  out_of_scope: "Fora do escopo do SDR",
};

const MODE_LABELS: Record<SdrEscalationMode, string> = {
  urgent: "🔴 URGENTE",
  normal: "🟡 Normal",
  standard: "🟢 Padrão",
};

interface IRenderBubbleInput {
  summary: ISdrContextSummary;
  reason: SdrEscalationReason;
  mode: SdrEscalationMode;
}

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const DATE = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

function formatMoney(value: number): string {
  return BRL.format(value);
}

function formatDate(iso: string): string {
  try {
    return DATE.format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (minutes < 60) {
    return remSec > 0 ? `${minutes}m ${remSec}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
}

/**
 * Render the system bubble persisted at handoff time. The body is plain text
 * (no HTML / markdown) so the existing `SystemBubble` component can render it
 * without changes — the structure is delivered via separators + emoji icons.
 */
export function renderEscalationBubble(input: IRenderBubbleInput): string {
  const { summary, reason, mode } = input;
  const lines: string[] = [];
  lines.push(SEPARATOR);
  lines.push(`🤖 ESCALADO PELO SDR — ${MODE_LABELS[mode]}`);
  lines.push("");

  // Customer block — always rendered, even if data is sparse.
  const nameLine = summary.customerName
    ? summary.customerCompany
      ? `${summary.customerName} (${summary.customerCompany})`
      : summary.customerName
    : "Cliente novo, sem cadastro completo";
  lines.push(`👤 Cliente: ${nameLine}`);
  lines.push(`   📞 ${summary.customerPhone}`);
  lines.push(`   Tipo: ${summary.isB2B ? "B2B" : "B2C"}`);

  if (summary.vehicleIdentified) {
    lines.push("");
    const v = summary.vehicleIdentified;
    const segs = [
      v.brand,
      v.model,
      v.year ? `${v.year}` : null,
      v.engine ? `Motor ${v.engine}` : null,
    ]
      .filter(Boolean)
      .join(" — ");
    lines.push("🚛 Veículo identificado:");
    lines.push(`   ${segs}`);
  }

  if (summary.partIdentified) {
    lines.push("");
    lines.push("🔧 Peça solicitada:");
    const codeSegment = summary.partIdentified.oemCode
      ? ` (cód. ${summary.partIdentified.oemCode})`
      : "";
    lines.push(`   ${summary.partIdentified.name}${codeSegment}`);
    lines.push(`   ${summary.partIdentified.isOriginal ? "Original" : "Equivalente"}`);
  }

  if (summary.quoteGenerated) {
    lines.push("");
    lines.push("💰 Orçamento gerado:");
    const shippingNote = summary.quoteGenerated.shippingIsToNegotiate
      ? " (frete a combinar)"
      : " (incluindo frete)";
    lines.push(`   Total: ${formatMoney(summary.quoteGenerated.total)}${shippingNote}`);
    lines.push(`   Válido até: ${formatDate(summary.quoteGenerated.validUntil)}`);
    lines.push(`   Status: ${summary.quoteGenerated.status}`);
  }

  lines.push("");
  lines.push("❓ Motivo do escalonamento:");
  lines.push(`   ${summary.reasonText ?? REASON_LABELS[reason]}`);

  lines.push("");
  lines.push("⏱ Tempo em atendimento SDR:");
  lines.push(`   ${formatDuration(summary.timeInSdr)} (${summary.conversationLength} mensagens)`);

  if (!summary.partIdentified && !summary.quoteGenerated && !summary.vehicleIdentified) {
    lines.push("");
    lines.push("ℹ️ Cliente novo, sem dados completos coletados.");
  }

  lines.push(SEPARATOR);
  return lines.join("\n");
}

/**
 * Compact 1-2 line summary inserted into the customer-facing handoff message.
 * Falls back to "preciso conectar com vendedor" when nothing was captured.
 */
export function renderShortSummary(summary: ISdrContextSummary): string {
  const segments: string[] = [];
  if (summary.partIdentified) {
    segments.push(`• ${summary.partIdentified.name}`);
  }
  if (summary.vehicleIdentified) {
    const v = summary.vehicleIdentified;
    const desc = [v.brand, v.model, v.year ? `${v.year}` : null].filter(Boolean).join(" ");
    if (desc) segments.push(`• Veículo: ${desc}`);
  }
  if (summary.quoteGenerated) {
    segments.push(`• Orçamento: ${formatMoney(summary.quoteGenerated.total)}`);
  }
  if (segments.length === 0) {
    return "• Preciso conectar com nosso vendedor para continuar.";
  }
  return segments.join("\n");
}

/**
 * Render the message the SDR sends to the customer right before the handoff.
 * The template is editable on `IPlatformSettings.escalationCustomerHandoffTemplate`
 * and exposes two placeholders: `{{saudacao_nome}}` (", João" when known, "" otherwise)
 * and `{{resumo_curto}}` (compact bullet list from `renderShortSummary`).
 */
export function renderCustomerHandoff(template: string, summary: ISdrContextSummary): string {
  const saudacao = summary.customerName ? `, ${summary.customerName}` : "";
  return template
    .replace(/\{\{\s*saudacao_nome\s*\}\}/g, saudacao)
    .replace(/\{\{\s*nome\s*\}\}/g, summary.customerName ?? "amigo")
    .replace(/\{\{\s*resumo_curto\s*\}\}/g, renderShortSummary(summary));
}

export const ESCALATION_REASON_LABELS = REASON_LABELS;
export const ESCALATION_MODE_LABELS = MODE_LABELS;
