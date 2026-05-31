import type { IQuote } from "@/shared/types";
import type { IDetailStat, IStepperStep, IStepperTerminal, StatTone } from "@/shared/detail-views";
import {
  formatBRL,
  formatDateBR,
  formatPercent,
  formatRelativeTimeBR,
} from "@/shared/utils/format";
import { daysUntil, validityBucket } from "./quoteTotals";

const sumQty = (q: IQuote): number => q.items.reduce((acc, it) => acc + it.quantity, 0);

/** The 5 KPI cells for the quote detail page. `now` injected for deterministic validity. */
export function quoteDetailStats(quote: IQuote, now: Date): IDetailStat[] {
  const bucket = validityBucket(quote.validUntil, now);
  const days = daysUntil(quote.validUntil, now);
  const validityValue =
    bucket === "expired" ? "Vencido" : days <= 3 ? `Vence em ${days}d` : "Válido";
  const validityTone: StatTone =
    bucket === "expired" ? "bad" : bucket === "critical" || bucket === "warning" ? "warn" : "good";

  const discountShare = quote.subtotal > 0 ? quote.discount / quote.subtotal : null;

  const approvalValue = quote.requiresApproval
    ? "Pendente"
    : quote.approvedAt
      ? "Aprovado"
      : "Não requer";
  const approvalTone: StatTone = quote.requiresApproval
    ? "warn"
    : quote.approvedAt
      ? "good"
      : "default";

  const lineCount = quote.items.length;

  return [
    {
      icon: "mdi:clock-outline",
      label: "Validade",
      value: validityValue,
      sub: formatDateBR(quote.validUntil),
      tone: validityTone,
    },
    {
      icon: "mdi:format-list-numbered",
      label: "Itens",
      value: `${sumQty(quote)} peças`,
      sub: `${lineCount} ${lineCount === 1 ? "linha" : "linhas"}`,
    },
    {
      icon: "mdi:sale",
      label: "Desconto",
      value: formatBRL(quote.discount),
      sub: discountShare != null ? `${formatPercent(discountShare, 1)} do subtotal` : undefined,
      tone: quote.requiresApproval ? "warn" : "default",
    },
    {
      icon: "mdi:shield-check-outline",
      label: "Aprovação",
      value: approvalValue,
      tone: approvalTone,
    },
    {
      icon: "mdi:calendar-plus",
      label: "Criado",
      value: formatRelativeTimeBR(quote.createdAt, now),
      sub: formatDateBR(quote.createdAt),
    },
  ];
}

const QUOTE_STEP_LABELS: Record<"rascunho" | "enviado" | "aceito" | "convertido", string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  aceito: "Aceito",
  convertido: "Convertido",
};

/** Stepper steps for the Operacional layout. Off-path terminal: recusado / expirado. */
export function quoteStepperSteps(quote: IQuote): {
  steps: IStepperStep[];
  terminal: IStepperTerminal | null;
} {
  if (quote.status === "recusado") {
    return { steps: [], terminal: { label: "Orçamento recusado", tone: "bad" } };
  }
  if (quote.status === "expirado") {
    return { steps: [], terminal: { label: "Orçamento expirado", tone: "warn" } };
  }
  const flow = ["rascunho", "enviado", "aceito", "convertido"] as const;
  const currentIdx = flow.indexOf(quote.status as (typeof flow)[number]);
  const steps: IStepperStep[] = flow.map((s, i) => ({
    key: s,
    label: QUOTE_STEP_LABELS[s],
    state: i < currentIdx ? "done" : i === currentIdx ? "current" : "todo",
  }));
  return { steps, terminal: null };
}
