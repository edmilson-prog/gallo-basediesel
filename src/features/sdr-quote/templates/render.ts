import type { ICustomer, IQuote, ISdrQuoteTemplates, IShippingResult } from "@/shared/types";

/**
 * Variables exposed to the SDR-quote templates. Optional values render as
 * empty strings — `cliente_nome_separador` is filled with `", "` when a name
 * is available so the templates can read naturally either way:
 *
 *   "Perfeito{{cliente_nome_separador}}{{cliente_nome}}!"
 *   → "Perfeito, João!"        (with name)
 *   → "Perfeito!"               (without name)
 */
export interface IQuoteTemplateVariables {
  cliente_nome?: string;
  peca_nome?: string;
  peca_codigo?: string;
  peca_tipo?: string;
  quantidade?: string;
  valor_unitario?: string;
  subtotal?: string;
  desconto?: string;
  frete_formatado?: string;
  total?: string;
  validade?: string;
}

function formatBrl(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function firstName(customer: ICustomer | undefined): string | undefined {
  if (!customer) return undefined;
  const raw = customer.type === "B2C" ? customer.fullName : customer.contactName;
  return raw.split(/\s+/)[0];
}

/**
 * Build the variable map for a freshly generated quote. Snapshots — never
 * derives from live `IPart`/`ICustomer` data later (the message must remain
 * stable even if those records change).
 */
export function buildQuoteVariables(
  quote: IQuote,
  customer: ICustomer | undefined,
  shipping: IShippingResult,
  options: { partTypeLabel?: string } = {},
): IQuoteTemplateVariables {
  const item = quote.items[0];
  const freteFmt = shipping.isToNegotiate
    ? "a combinar"
    : `R$ ${formatBrl(shipping.value ?? quote.shipping)}`;
  return {
    cliente_nome: firstName(customer),
    peca_nome: item?.partName,
    peca_codigo: item?.partSku,
    peca_tipo: options.partTypeLabel ?? "original",
    quantidade: item ? String(item.quantity) : undefined,
    valor_unitario: item ? formatBrl(item.unitPrice) : undefined,
    subtotal: formatBrl(quote.subtotal),
    desconto: quote.discount > 0 ? formatBrl(quote.discount) : undefined,
    frete_formatado: freteFmt,
    total: formatBrl(quote.total),
    validade: formatDate(quote.validUntil),
  };
}

/**
 * Render a single template string by substituting `{{variavel}}` placeholders
 * with the values in `vars`. Missing keys collapse to empty strings — keeps
 * the message readable when, for instance, the customer hasn't provided a
 * name yet.
 *
 * Auxiliary placeholders generated automatically:
 *   - `{{cliente_nome_separador}}` → `", "` when `cliente_nome` is set, else `""`.
 */
export function renderTemplate(
  template: string,
  vars: IQuoteTemplateVariables & Record<string, string | number | undefined>,
): string {
  const enriched: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    enriched[key] = value == null ? "" : String(value);
  }
  enriched.cliente_nome_separador = enriched.cliente_nome ? ", " : "";
  return template
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name: string) => enriched[name] ?? "")
    .trim();
}

/** High-level helper used by the SDR responder for the `generation` slot. */
export function renderQuoteMessage(
  quote: IQuote,
  customer: ICustomer | undefined,
  shipping: IShippingResult,
  templates: ISdrQuoteTemplates,
  options?: { partTypeLabel?: string },
): string {
  const vars = buildQuoteVariables(quote, customer, shipping, options);
  return renderTemplate(templates.generation, vars);
}

/** Render the post-acceptance prompt asking for payment & delivery. */
export function renderAcceptMessage(
  customer: ICustomer | undefined,
  templates: ISdrQuoteTemplates,
): string {
  return renderTemplate(templates.accept, { cliente_nome: firstName(customer) });
}

/** Render the rejection follow-up. */
export function renderRejectMessage(
  customer: ICustomer | undefined,
  templates: ISdrQuoteTemplates,
): string {
  return renderTemplate(templates.reject, { cliente_nome: firstName(customer) });
}

/** Render the escalation hand-off. */
export function renderEscalateMessage(
  customer: ICustomer | undefined,
  templates: ISdrQuoteTemplates,
): string {
  return renderTemplate(templates.escalate, { cliente_nome: firstName(customer) });
}
