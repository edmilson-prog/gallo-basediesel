import type { ICustomer } from "@/shared/types";
import { CUSTOMER_STRINGS } from "../i18n/pt-BR";

const COPY = CUSTOMER_STRINGS.detail.alerts;

/** Tabs an alert can deep-link into (keys of the consolidated tab strip). */
export type CustomerAlertTarget = "comercial" | "frota" | "cadastro" | "notas";

/**
 * Severity of a customer alert. Critical is reserved for things that block or
 * lose money — never for "no data yet". See the spec's severity contract.
 */
export type CustomerAlertSeverity = "critical" | "warning" | "info";

export interface ICustomerAlert {
  /** Stable across renders — safe as a React key. */
  id: string;
  severity: CustomerAlertSeverity;
  /** Iconify glyph. */
  icon: string;
  title: string;
  detail: string;
  cta: string;
  target: CustomerAlertTarget;
}

export interface IBuildCustomerAlertsInput {
  customer: ICustomer;
  /** Quotes in `rascunho` or `enviado`, resolved by the caller. */
  openQuotes: number;
  /** Vehicles with `cadastroStatus === "pendente"`, resolved by the caller. */
  pendingVehicles: number;
  /** Unresolved recommendations, resolved by the caller. */
  unseenRecommendations: number;
  /** Injectable for deterministic tests. */
  now?: Date;
}

/** Recency beyond this multiple of the average buying interval counts as overdue. */
const OVERDUE_INTERVAL_FACTOR = 1.5;
/** A contact younger than this is simply new, not neglected. */
const FIRST_QUOTE_GRACE_DAYS = 30;

const SEVERITY_ORDER: Record<CustomerAlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const MS_PER_DAY = 86_400_000;

function daysBetween(iso: string, now: Date): number | null {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((now.getTime() - then) / MS_PER_DAY);
}

function documentOf(customer: ICustomer): string {
  return customer.type === "B2B" ? customer.cnpj : customer.cpf;
}

/** Joins fragments the way pt-BR reads them: "a, b e c". */
function joinPtBR(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

function missingRegistrationFields(customer: ICustomer): string[] {
  const missing: string[] = [];
  if (!documentOf(customer)?.trim()) missing.push(COPY.missingDocument);
  if (!customer.email?.trim()) missing.push(COPY.missingEmail);
  if (!customer.address) missing.push(COPY.missingAddress);
  return missing;
}

/**
 * Derive the customer's pending items, ordered critical → warning → info.
 *
 * Pure: every count comes in already resolved, so this never touches a
 * provider and stays trivially testable. An empty array means the alert band
 * is not rendered at all — the refactor deliberately drops the "Tudo em dia"
 * placeholder card.
 */
export function buildCustomerAlerts({
  customer,
  openQuotes,
  pendingVehicles,
  unseenRecommendations,
  now = new Date(),
}: IBuildCustomerAlertsInput): ICustomerAlert[] {
  const alerts: ICustomerAlert[] = [];

  if (pendingVehicles > 0) {
    alerts.push({
      id: "vehicles-pending",
      severity: "critical",
      icon: "mdi:truck-alert-outline",
      title: COPY.vehiclesTitle(pendingVehicles),
      detail: COPY.vehiclesDetail,
      cta: COPY.vehiclesCta,
      target: "frota",
    });
  }

  const overdueDays = resolveOverdueDays(customer, now);
  if (overdueDays !== null) {
    alerts.push({
      id: "overdue-repurchase",
      severity: "critical",
      icon: "mdi:clock-alert-outline",
      title: COPY.overdueTitle(overdueDays),
      detail: COPY.overdueDetail,
      cta: COPY.overdueCta,
      target: "comercial",
    });
  }

  if (openQuotes > 0) {
    alerts.push({
      id: "open-quotes",
      severity: "warning",
      icon: "mdi:file-clock-outline",
      title: COPY.openQuotesTitle(openQuotes),
      detail: COPY.openQuotesDetail,
      cta: COPY.openQuotesCta,
      target: "comercial",
    });
  }

  const idleDays = resolveFirstQuoteIdleDays(customer, openQuotes, now);
  if (idleDays !== null) {
    alerts.push({
      id: "no-first-quote",
      severity: "warning",
      icon: "mdi:file-document-plus-outline",
      title: COPY.firstQuoteTitle(idleDays),
      detail: COPY.firstQuoteDetail,
      cta: COPY.firstQuoteCta,
      target: "comercial",
    });
  }

  if (unseenRecommendations > 0) {
    alerts.push({
      id: "unseen-recommendations",
      severity: "warning",
      icon: "mdi:lightbulb-on-outline",
      title: COPY.recommendationsTitle(unseenRecommendations),
      detail: COPY.recommendationsDetail,
      cta: COPY.recommendationsCta,
      target: "notas",
    });
  }

  const missing = missingRegistrationFields(customer);
  if (missing.length > 0) {
    alerts.push({
      id: "incomplete-registration",
      severity: "info",
      icon: "mdi:card-account-details-outline",
      title: COPY.incompleteTitle,
      detail: COPY.incompleteDetail(joinPtBR(missing)),
      cta: COPY.incompleteCta,
      target: "cadastro",
    });
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/**
 * Days since the last purchase, but only when that exceeds
 * {@link OVERDUE_INTERVAL_FACTOR}× the customer's own average buying interval.
 * Returns `null` for customers without enough history to have an interval.
 */
function resolveOverdueDays(customer: ICustomer, now: Date): number | null {
  if (!customer.lastPurchaseAt) return null;
  const orderCount12m = customer.purchaseStats?.orderCount12m ?? 0;
  if (orderCount12m <= 0) return null;
  const recency = daysBetween(customer.lastPurchaseAt, now);
  if (recency === null) return null;
  const averageInterval = 365 / orderCount12m;
  return recency > averageInterval * OVERDUE_INTERVAL_FACTOR ? recency : null;
}

/**
 * Days since the contact was created, for contacts that never bought and have
 * no quote in flight. Silent during the grace window — a contact created
 * yesterday is new, not neglected.
 */
function resolveFirstQuoteIdleDays(
  customer: ICustomer,
  openQuotes: number,
  now: Date,
): number | null {
  if (openQuotes > 0) return null;
  if (customer.lastPurchaseAt || customer.firstPurchaseAt) return null;
  if (customer.dintecLastPurchaseAt || customer.dintecFirstPurchaseAt) return null;
  const age = daysBetween(customer.createdAt, now);
  if (age === null || age <= FIRST_QUOTE_GRACE_DAYS) return null;
  return age;
}
