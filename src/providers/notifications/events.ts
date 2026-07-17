/**
 * Domain event catalogue (PRD-008, Anexo A). Single source of truth for the
 * notification system's event vocabulary. Features emit these via the
 * notificationBus; routing rules (routing/rules.ts) map each event to a
 * category, severity, recipients and target channels.
 *
 * `lifecycle: 'derived'` events are NOT emitted by features — they are produced
 * exclusively by the reconciler (RF-024+). They are listed in DERIVED_EVENTS.
 *
 * @see ../../../docs/prds/PRD-008-fundacao-notificacoes.md (Anexo A)
 */

export type NotificationEventType =
  // Atendimento (conversations / SDR)
  | "conversa.atribuida"
  | "conversa.semResposta"
  | "conversa.colaboradorAdicionado"
  | "sdr.escalonou"
  | "sdr.escalonouSemResposta"
  // Carteira (wallet transfers)
  | "carteira.transferenciaRecebida"
  | "carteira.autoRevertAgendado"
  | "carteira.autoRevertExecutado"
  // Leads
  | "lead.novo"
  | "lead.esfriando"
  | "lead.perdido"
  // Metas (goals)
  | "meta.atingidaParcial"
  | "meta.batida"
  // Gamificação
  | "badge.conquistado"
  | "ranking.mudouPosicao"
  // Comercial / Operacional
  | "cliente.dormente"
  | "vendedor.sobrecarregado"
  | "positivacao.emRisco"
  | "abc.clienteMudouClasse"
  // Vendas (orders / invoices)
  | "pedido.criado"
  | "pedido.statusMudou"
  | "pedido.confirmado"
  | "nf.emitida"
  // E-commerce
  | "ecom.pedidoRecebido"
  | "ecom.pagamentoConfirmado"
  | "ecom.pedidoEnviado"
  | "ecom.carrinhoAbandonado"
  // Portal B2B
  | "portal.orcamentoAprovado"
  | "portal.faturaDisponivel"
  | "portal.creditoProximoLimite"
  // Sistema
  | "sistema.manutencao"
  | "sistema.novoRecurso";

/**
 * Derived events (`lifecycle: 'derived'`) are produced exclusively by the
 * reconciler (RF-024+), never emitted manually by features. Listed here so the
 * router and reconciler can distinguish them from event-lifecycle notifications.
 */
export const DERIVED_EVENTS: readonly NotificationEventType[] = [
  "conversa.semResposta",
  "lead.esfriando",
  "cliente.dormente",
  "vendedor.sobrecarregado",
  "positivacao.emRisco",
  "portal.creditoProximoLimite",
] as const;
