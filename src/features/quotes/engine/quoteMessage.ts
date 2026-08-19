// src/features/quotes/engine/quoteMessage.ts

/**
 * The quote as the customer reads it, in the two shapes it is delivered in:
 * a WhatsApp body and an e-mail. Pure on purpose — the same figures must reach
 * both channels, and the editor, the ficha and the Edge Function all build the
 * message from here instead of writing their own.
 */
export interface IQuoteMessageItem {
  partName: string;
  quantity: number;
  /** Line total, discount already applied. */
  total: number;
}

export interface IQuoteMessageInput {
  number: string;
  customerName?: string;
  storeName?: string;
  items: IQuoteMessageItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  /** ISO timestamp of the validity limit. */
  validUntil: string;
  /**
   * The seller's own note. Opens the e-mail in place of the default line; the
   * WhatsApp body ignores it because the composer puts it ahead of the quote.
   */
  message?: string;
}

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

const DEFAULT_STORE = "GALLO BASE DIESEL";

function formatValidUntil(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : date.format(d);
}

/** Escapes the five characters that would otherwise be markup in the e-mail. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** WhatsApp body — plain text, one line per item. */
export function buildQuoteWhatsAppText(input: IQuoteMessageInput): string {
  const lines = [
    `🧾 Orçamento ${input.storeName ?? DEFAULT_STORE}`,
    `Número: #${input.number}`,
    input.customerName ? `Cliente: ${input.customerName}` : "",
    "",
    "Itens:",
    ...input.items.map(
      (item) => `• ${item.partName} (qtd ${item.quantity}) — ${money.format(item.total)}`,
    ),
    "",
    `Subtotal: ${money.format(input.subtotal)}`,
    input.discount > 0 ? `Desconto: -${money.format(input.discount)}` : "",
    `Frete: ${money.format(input.shipping)}`,
    `Total: ${money.format(input.total)}`,
    "",
    `Válido até: ${formatValidUntil(input.validUntil)}`,
  ];
  return lines.filter(Boolean).join("\n");
}

/** Plain-text alternative of the e-mail — the same body the WhatsApp carries. */
export function buildQuoteEmailText(input: IQuoteMessageInput): string {
  return buildQuoteWhatsAppText(input);
}

export function buildQuoteEmailSubject(input: IQuoteMessageInput): string {
  return `Orçamento #${input.number} — ${input.storeName ?? DEFAULT_STORE}`;
}

/**
 * E-mail body. Table layout and inline styles because that is what mail
 * clients render reliably — no external stylesheet survives the trip.
 */
export function buildQuoteEmailHtml(input: IQuoteMessageInput): string {
  const store = escapeHtml(input.storeName ?? DEFAULT_STORE);
  const opening =
    input.message?.trim() ||
    (input.customerName ? `Olá, ${input.customerName} — segue o orçamento solicitado.` : "");
  const rows = input.items
    .map(
      (item) => `<tr class="item" style="border-bottom:1px solid #e5e5e5">
      <td style="padding:8px 0;font-size:14px;color:#231F20">${escapeHtml(item.partName)}</td>
      <td style="padding:8px 0;text-align:right;font-size:14px;color:#565658">${item.quantity}</td>
      <td style="padding:8px 0;text-align:right;font-size:14px;color:#231F20;font-weight:600">${money.format(item.total)}</td>
    </tr>`,
    )
    .join("\n");

  const totalRow = (label: string, value: string, strong = false) =>
    `<tr>
      <td style="padding:3px 0;font-size:13px;color:#565658">${label}</td>
      <td style="padding:3px 0;text-align:right;font-size:${strong ? "18px" : "13px"};color:#231F20;font-weight:${strong ? "800" : "600"}">${value}</td>
    </tr>`;

  return `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#f6f6f7;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:10px;padding:24px">
    <p style="margin:0;font-size:20px;font-weight:800;text-transform:uppercase;color:#231F20">${store}</p>
    <p style="margin:4px 0 0;font-size:13px;color:#767678">Orçamento #${escapeHtml(input.number)} · válido até ${formatValidUntil(input.validUntil)}</p>
    ${opening ? `<p style="margin:16px 0 0;font-size:14px;color:#231F20;line-height:1.6;white-space:pre-line">${escapeHtml(opening)}</p>` : ""}

    <table style="width:100%;border-collapse:collapse;margin-top:20px">
      <thead>
        <tr style="border-bottom:2px solid #231F20">
          <th style="text-align:left;padding:6px 0;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#767678">Peça</th>
          <th style="text-align:right;padding:6px 0;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#767678">Qtd</th>
          <th style="text-align:right;padding:6px 0;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#767678">Subtotal</th>
        </tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>

    <table style="width:220px;margin:16px 0 0 auto;border-collapse:collapse">
      ${totalRow("Subtotal", money.format(input.subtotal))}
      ${input.discount > 0 ? totalRow("Desconto", `- ${money.format(input.discount)}`) : ""}
      ${totalRow("Frete", money.format(input.shipping))}
      ${totalRow("Total", money.format(input.total), true)}
    </table>

    <p style="margin:24px 0 0;font-size:11px;color:#767678;line-height:1.6">
      Valores sujeitos a alteração após a validade. Disponibilidade sujeita a confirmação de estoque no momento do pedido.
    </p>
  </div>
</body>
</html>`;
}
