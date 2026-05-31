/**
 * Derived-condition logic shared between PRD-014 (manager dashboard alerts) and
 * the PRD-008 reconciler. Extracted verbatim from the original `useActiveAlerts`
 * hook so both consumers compute the exact same conditions from a data snapshot:
 * the dashboard renders the resulting IActiveAlert[] directly, while the
 * reconciler maps each alert into a derived INotification.
 *
 * Keep these pure (no React, no storage) — they are the single source of truth
 * for the three derived conditions.
 */
import type { IConversation, ICustomer, ID, ISeller } from "@/shared/types";

export type AlertSeverity = "critical" | "high" | "medium";
export type AlertKind = "cliente-a-dormente" | "vendedor-sobrecarregado" | "conversa-sem-resposta";

export interface IActiveAlert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  /** Specific text already localized (pt-BR). */
  message: string;
  /** Stable hash used to persist dismissals across reloads. */
  hash: string;
  /** Navigation target — `to` path and optional search params. */
  view: { to: string; search?: Record<string, string> };
}

export function buildClienteADormenteAlerts(customers: ICustomer[], now: number): IActiveAlert[] {
  const alerts: IActiveAlert[] = [];
  for (const c of customers) {
    if (c.abcClass !== "A" || c.status !== "dormente") continue;
    const name = c.type === "B2B" ? c.nomeFantasia : c.fullName;
    const since = c.lastPurchaseAt ? new Date(c.lastPurchaseAt).getTime() : null;
    const days = since !== null ? Math.max(1, Math.round((now - since) / (24 * 3600_000))) : 0;
    alerts.push({
      id: `cliente-a-dormente-${c.id}`,
      kind: "cliente-a-dormente",
      severity: "high",
      message: `Cliente A dormente: ${name} — ${days} dia${days === 1 ? "" : "s"} sem compra`,
      hash: `cliente-a-dormente-${c.id}`,
      view: { to: "/app/clientes/$id", search: {} },
    });
  }
  return alerts;
}

export function buildVendedorSobrecarregadoAlerts(
  sellers: ISeller[],
  loadBySeller: Map<ID, number>,
  threshold: number,
): IActiveAlert[] {
  const alerts: IActiveAlert[] = [];
  for (const seller of sellers) {
    const load = loadBySeller.get(seller.id) ?? 0;
    if (load <= threshold) continue;
    alerts.push({
      id: `vendedor-sobrecarregado-${seller.id}`,
      kind: "vendedor-sobrecarregado",
      severity: "medium",
      message: `${seller.fullName} está sobrecarregado — ${load} conversas ativas (limite ${threshold})`,
      hash: `vendedor-sobrecarregado-${seller.id}`,
      view: { to: "/app/atendimento", search: { assignment: seller.id } },
    });
  }
  return alerts;
}

export function buildConversaSemRespostaAlerts(
  conversations: IConversation[],
  thresholdHours: number,
  now: number,
): IActiveAlert[] {
  const cutoff = now - thresholdHours * 3600_000;
  const stale = conversations.filter(
    (c) => c.status === "aguardando" && new Date(c.lastMessageAt).getTime() < cutoff,
  );
  if (stale.length === 0) return [];
  return [
    {
      id: `conversa-sem-resposta-${thresholdHours}h`,
      kind: "conversa-sem-resposta",
      severity: "critical",
      message: `${stale.length} conversa${stale.length === 1 ? "" : "s"} sem resposta há mais de ${thresholdHours}h`,
      hash: `conversa-sem-resposta`,
      view: { to: "/app/atendimento", search: { status: "aguardando", sort: "waiting" } },
    },
  ];
}
