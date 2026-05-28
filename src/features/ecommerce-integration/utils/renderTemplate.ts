import type { IOrder } from "@/shared/types";
import { formatBRL } from "@/shared/utils/format";

export interface ITemplateVars {
  customerName?: string;
  orderNumber?: string;
  total?: string;
  paymentMethod?: string;
  reason?: string;
}

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX",
  boleto: "Boleto",
  cartao: "Cartão",
  prazo: "A prazo",
  outro: "Outro",
};

/**
 * Substitute `{variable}` tokens in a notification template (PRD-067 RF-003).
 * Unknown tokens are left untouched so the Owner can spot typos in settings.
 */
export function renderTemplate(template: string, vars: ITemplateVars): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = (vars as Record<string, string | undefined>)[key];
    return value ?? match;
  });
}

/** Build the template variables from an order + customer display name. */
export function orderTemplateVars(order: IOrder, customerName: string): ITemplateVars {
  return {
    customerName,
    orderNumber: order.number ?? order.id,
    total: formatBRL(order.total),
    paymentMethod: order.paymentMethod ? (PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod) : "—",
  };
}
