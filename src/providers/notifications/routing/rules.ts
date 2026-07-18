/**
 * Routing rules (PRD-008, Anexo A). Maps each domain event to its category,
 * severity, target channels and a recipient resolver. The router
 * (routing/router.ts) reads this table at emit time to fan out one
 * INotification per recipient, crossing channels with per-recipient
 * preferences and recording external channels as `deferred` until the Onda 8
 * providers (PRD-141+) go live.
 *
 * Recipient model: emitters provide concrete ids in the payload; each rule
 * picks the ids the Anexo A "Destinatário" column requires. Role-based fan-out
 * (gestor/owner) uses ids from the payload when present, falling back to the
 * optional context resolvers supplied by the router.
 *
 * @see ../../../../docs/prds/PRD-008-fundacao-notificacoes.md (Anexo A)
 */
import type {
  ID,
  NotificationCategory,
  NotificationChannel,
  NotificationRecipientType,
  NotificationSeverity,
} from "@/shared/types";
import type { NotificationEventType } from "../events";

/** A single resolved recipient of a notification. */
export interface IRecipientRef {
  recipientId: ID;
  recipientType: NotificationRecipientType;
  storeId?: ID;
}

/**
 * Loose payload contract carried by a domain event. Emitters fill the ids
 * relevant to the event; each rule reads only the fields its recipients need.
 * `title`/`body`/`data` feed the snapshot text built by the router.
 */
export interface IRoutingPayload {
  sellerId?: ID;
  /** Gestores of the relevant store (role-based fan-out). */
  managerIds?: ID[];
  /** Platform owner(s). */
  ownerIds?: ID[];
  customerId?: ID;
  storeId?: ID;
  entityId?: ID;
  entityType?: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
}

/**
 * Optional role resolvers supplied by the router so rules can expand
 * gestor/owner recipients when the payload does not carry their ids. In Fase 1
 * both are optional and rules fall back to payload-provided ids.
 */
export interface IRoutingContext {
  resolveManagers?(storeId?: ID): IRecipientRef[];
  resolveOwners?(): IRecipientRef[];
}

export interface IRoutingRule {
  category: NotificationCategory;
  severity: NotificationSeverity;
  /** Phase-1 target channels. External channels are recorded `deferred` by the router. */
  channels: NotificationChannel[];
  resolveRecipients(payload: IRoutingPayload, ctx: IRoutingContext): IRecipientRef[];
}

// --- recipient helpers -------------------------------------------------------

/** Collapse duplicate recipients (one notification per recipient per event). */
const uniq = (refs: IRecipientRef[]): IRecipientRef[] => {
  const seen = new Map<ID, IRecipientRef>();
  for (const r of refs) {
    if (!seen.has(r.recipientId)) seen.set(r.recipientId, r);
  }
  return [...seen.values()];
};

const sellerOf = (p: IRoutingPayload): IRecipientRef[] =>
  p.sellerId ? [{ recipientId: p.sellerId, recipientType: "seller", storeId: p.storeId }] : [];

const customerOf = (p: IRoutingPayload): IRecipientRef[] =>
  p.customerId
    ? [{ recipientId: p.customerId, recipientType: "customer", storeId: p.storeId }]
    : [];

const managersOf = (p: IRoutingPayload, ctx: IRoutingContext): IRecipientRef[] => {
  if (p.managerIds?.length) {
    return p.managerIds.map((id) => ({
      recipientId: id,
      recipientType: "seller",
      storeId: p.storeId,
    }));
  }
  return ctx.resolveManagers?.(p.storeId) ?? [];
};

const ownersOf = (p: IRoutingPayload, ctx: IRoutingContext): IRecipientRef[] => {
  if (p.ownerIds?.length) {
    return p.ownerIds.map((id) => ({ recipientId: id, recipientType: "seller" }));
  }
  return ctx.resolveOwners?.() ?? [];
};

/** Internal staff (vendedor + gestores + owners) — used by system-wide events. */
const internalOf = (p: IRoutingPayload, ctx: IRoutingContext): IRecipientRef[] =>
  uniq([...sellerOf(p), ...managersOf(p, ctx), ...ownersOf(p, ctx)]);

// --- routing table (Anexo A) -------------------------------------------------

export const ROUTING_RULES: Record<NotificationEventType, IRoutingRule> = {
  // Atendimento
  "conversa.atribuida": {
    category: "operational",
    severity: "info",
    channels: ["inApp", "toast"],
    resolveRecipients: (p) => sellerOf(p),
  },
  "conversa.colaboradorAdicionado": {
    category: "operational",
    severity: "info",
    channels: ["inApp"],
    resolveRecipients: (p) => sellerOf(p),
  },
  "conversa.semResposta": {
    category: "operational",
    severity: "warning",
    channels: ["inApp"],
    resolveRecipients: (p, ctx) => uniq([...sellerOf(p), ...managersOf(p, ctx)]),
  },
  // conversa.ociosa (spec 2026-07-16): the real per-row severity ('warning' at
  // level 2, 'critical' at level 3) is decided server-side by the reconciler
  // (reconcile_derived_notifications()). This entry exists only so the
  // client-side router can type/route the event — 'warning' here is a
  // placeholder default, never the value actually persisted for this event.
  "conversa.ociosa": {
    category: "operational",
    severity: "warning",
    channels: ["inApp", "toast"],
    resolveRecipients: (p) => sellerOf(p),
  },
  "conversa.resgatada": {
    category: "operational",
    severity: "info",
    channels: ["inApp"],
    resolveRecipients: (p) => sellerOf(p),
  },
  "sdr.escalonou": {
    category: "operational",
    severity: "warning",
    channels: ["inApp", "toast"],
    resolveRecipients: (p, ctx) => uniq([...sellerOf(p), ...managersOf(p, ctx)]),
  },
  "sdr.escalonouSemResposta": {
    category: "operational",
    severity: "critical",
    channels: ["inApp", "toast"],
    resolveRecipients: (p, ctx) => uniq([...sellerOf(p), ...managersOf(p, ctx)]),
  },
  // Carteira
  "carteira.transferenciaRecebida": {
    category: "operational",
    severity: "info",
    channels: ["inApp", "toast"],
    resolveRecipients: (p) => sellerOf(p),
  },
  "carteira.autoRevertAgendado": {
    category: "operational",
    severity: "info",
    channels: ["inApp"],
    resolveRecipients: (p) => sellerOf(p),
  },
  "carteira.autoRevertExecutado": {
    category: "operational",
    severity: "info",
    channels: ["inApp"],
    resolveRecipients: (p) => sellerOf(p),
  },
  // Leads
  "lead.novo": {
    category: "commercial",
    severity: "info",
    channels: ["inApp", "toast"],
    resolveRecipients: (p) => sellerOf(p),
  },
  "lead.esfriando": {
    category: "commercial",
    severity: "warning",
    channels: ["inApp"],
    resolveRecipients: (p) => sellerOf(p),
  },
  "lead.perdido": {
    category: "commercial",
    severity: "info",
    channels: ["inApp"],
    resolveRecipients: (p, ctx) => uniq([...sellerOf(p), ...managersOf(p, ctx)]),
  },
  // Metas
  "meta.atingidaParcial": {
    category: "gamification",
    severity: "info",
    channels: ["inApp", "toast"],
    resolveRecipients: (p) => sellerOf(p),
  },
  "meta.batida": {
    category: "gamification",
    severity: "success",
    channels: ["inApp", "toast"],
    resolveRecipients: (p, ctx) => uniq([...sellerOf(p), ...managersOf(p, ctx)]),
  },
  // Gamificação
  "badge.conquistado": {
    category: "gamification",
    severity: "success",
    channels: ["inApp", "toast"],
    resolveRecipients: (p) => sellerOf(p),
  },
  "ranking.mudouPosicao": {
    category: "gamification",
    severity: "info",
    channels: ["inApp"],
    resolveRecipients: (p) => sellerOf(p),
  },
  // Comercial / Operacional
  "cliente.dormente": {
    category: "commercial",
    severity: "warning",
    channels: ["inApp"],
    resolveRecipients: (p, ctx) => uniq([...sellerOf(p), ...managersOf(p, ctx)]),
  },
  "vendedor.sobrecarregado": {
    category: "operational",
    severity: "warning",
    channels: ["inApp"],
    resolveRecipients: (p, ctx) => uniq([...managersOf(p, ctx), ...ownersOf(p, ctx)]),
  },
  "positivacao.emRisco": {
    category: "commercial",
    severity: "warning",
    channels: ["inApp"],
    resolveRecipients: (p) => sellerOf(p),
  },
  "abc.clienteMudouClasse": {
    category: "commercial",
    severity: "info",
    channels: ["inApp"],
    resolveRecipients: (p) => sellerOf(p),
  },
  // Vendas
  "pedido.criado": {
    category: "transactional",
    severity: "info",
    channels: ["inApp", "email", "whatsapp"],
    resolveRecipients: (p) => uniq([...sellerOf(p), ...customerOf(p)]),
  },
  "pedido.statusMudou": {
    category: "transactional",
    severity: "info",
    channels: ["inApp"],
    resolveRecipients: (p) => uniq([...sellerOf(p), ...customerOf(p)]),
  },
  "pedido.confirmado": {
    category: "transactional",
    severity: "success",
    channels: ["inApp"],
    resolveRecipients: (p) => uniq([...sellerOf(p), ...customerOf(p)]),
  },
  "nf.emitida": {
    category: "transactional",
    severity: "info",
    channels: ["inApp"],
    resolveRecipients: (p) => customerOf(p),
  },
  // E-commerce
  "ecom.pedidoRecebido": {
    category: "transactional",
    severity: "success",
    channels: ["inApp"],
    resolveRecipients: (p) => customerOf(p),
  },
  "ecom.pagamentoConfirmado": {
    category: "transactional",
    severity: "success",
    channels: ["inApp"],
    resolveRecipients: (p) => customerOf(p),
  },
  "ecom.pedidoEnviado": {
    category: "transactional",
    severity: "info",
    channels: ["inApp"],
    resolveRecipients: (p) => customerOf(p),
  },
  "ecom.carrinhoAbandonado": {
    category: "marketing",
    severity: "info",
    channels: ["email"],
    resolveRecipients: (p) => customerOf(p),
  },
  // Portal B2B
  "portal.orcamentoAprovado": {
    category: "transactional",
    severity: "success",
    channels: ["inApp"],
    resolveRecipients: (p) => customerOf(p),
  },
  "portal.faturaDisponivel": {
    category: "transactional",
    severity: "info",
    channels: ["inApp"],
    resolveRecipients: (p) => customerOf(p),
  },
  "portal.creditoProximoLimite": {
    category: "commercial",
    severity: "warning",
    channels: ["inApp"],
    resolveRecipients: (p) => customerOf(p),
  },
  // Sistema
  "sistema.manutencao": {
    category: "system",
    severity: "warning",
    channels: ["inApp", "toast"],
    resolveRecipients: (p, ctx) => uniq([...internalOf(p, ctx), ...customerOf(p)]),
  },
  "sistema.novoRecurso": {
    category: "system",
    severity: "info",
    channels: ["inApp"],
    resolveRecipients: (p, ctx) => uniq([...internalOf(p, ctx), ...customerOf(p)]),
  },
};
