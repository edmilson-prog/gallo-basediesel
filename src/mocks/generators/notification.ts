import type {
  INotification,
  INotificationAction,
  NotificationCategory,
  NotificationSeverity,
  NotificationStatus,
  ID,
} from "@/shared/types";
import { SEED_STORE_ID } from "../data";
import { daysAgo, randomISO, pickWeighted, type ISeededContext } from "./utils";

// ---------------------------------------------------------------------------
// Weight tables
// ---------------------------------------------------------------------------

const STATUS_WEIGHTS = [
  { value: "unread" as const, weight: 50 },
  { value: "read" as const, weight: 35 },
  { value: "archived" as const, weight: 15 },
];

const SEVERITY_WEIGHTS = [
  { value: "info" as const, weight: 40 },
  { value: "success" as const, weight: 25 },
  { value: "warning" as const, weight: 25 },
  { value: "critical" as const, weight: 10 },
];

const CATEGORY_WEIGHTS = [
  { value: "transactional" as const, weight: 30 },
  { value: "commercial" as const, weight: 25 },
  { value: "operational" as const, weight: 20 },
  { value: "gamification" as const, weight: 10 },
  { value: "system" as const, weight: 10 },
  { value: "marketing" as const, weight: 5 },
];

// ---------------------------------------------------------------------------
// Snapshot content per category (pt-BR)
// ---------------------------------------------------------------------------

interface IContentTemplate {
  type: string;
  title: string;
  body: string;
  groupKeySuffix?: string;
  hasEntityRef?: boolean;
  entityRefType?: string;
  hasActions?: boolean;
  actions?: INotificationAction[];
}

const TEMPLATES: Record<NotificationCategory, IContentTemplate[]> = {
  transactional: [
    {
      type: "conversa.atribuida",
      title: "Nova conversa atribuída",
      body: "Uma conversa foi atribuída a você. Clique para visualizar.",
      groupKeySuffix: "atribuicao",
      hasEntityRef: true,
      entityRefType: "conversation",
      hasActions: true,
      actions: [
        { id: "ver-conversa", label: "Ver conversa", type: "navigate", target: "/app/conversations" },
      ],
    },
    {
      type: "conversa.atribuida",
      title: "Pedido criado com sucesso",
      body: "O pedido foi registrado e está aguardando confirmação de pagamento.",
      hasEntityRef: true,
      entityRefType: "order",
      hasActions: true,
      actions: [
        { id: "ver-pedido", label: "Ver pedido", type: "navigate", target: "/app/orders" },
      ],
    },
    {
      type: "conversa.atribuida",
      title: "Cotação aprovada pelo cliente",
      body: "O cliente aprovou a cotação. Gere o pedido para dar continuidade.",
      hasEntityRef: true,
      entityRefType: "quote",
      hasActions: true,
      actions: [
        { id: "gerar-pedido", label: "Gerar pedido", type: "mutation", target: "convertQuoteToOrder" },
        { id: "ver-cotacao", label: "Ver cotação", type: "navigate", target: "/app/quotes" },
      ],
    },
    {
      type: "conversa.atribuida",
      title: "Pagamento confirmado",
      body: "O pagamento do pedido foi confirmado. Emita a NF para concluir.",
      hasEntityRef: true,
      entityRefType: "order",
    },
    {
      type: "conversa.atribuida",
      title: "Fatura disponível no portal",
      body: "Uma nova fatura foi disponibilizada no portal do cliente.",
      hasEntityRef: true,
      entityRefType: "invoice",
    },
  ],

  commercial: [
    {
      type: "conversa.atribuida",
      title: "Novo lead chegou",
      body: "Um novo lead foi adicionado à sua carteira. Faça o primeiro contato.",
      groupKeySuffix: "novos-leads",
      hasEntityRef: true,
      entityRefType: "lead",
      hasActions: true,
      actions: [
        { id: "ver-lead", label: "Ver lead", type: "navigate", target: "/app/leads" },
      ],
    },
    {
      type: "conversa.atribuida",
      title: "Transferência de carteira recebida",
      body: "Você recebeu clientes de uma transferência de carteira.",
      groupKeySuffix: "transferencias",
      hasEntityRef: true,
      entityRefType: "transfer",
    },
    {
      type: "conversa.atribuida",
      title: "Lead esfriando",
      body: "Este lead está sem movimentação há mais de 5 dias. Retome o contato.",
      hasEntityRef: true,
      entityRefType: "lead",
      hasActions: true,
      actions: [
        { id: "contatar-lead", label: "Contatar agora", type: "navigate", target: "/app/leads" },
      ],
    },
    {
      type: "conversa.atribuida",
      title: "Cliente próximo ao limite de crédito",
      body: "O cliente utilizou mais de 80% do limite de crédito disponível.",
      hasEntityRef: true,
      entityRefType: "customer",
    },
    {
      type: "conversa.atribuida",
      title: "Recomendação de reativação",
      body: "Cliente sem compras recentes. Considere uma abordagem de reativação.",
      hasEntityRef: true,
      entityRefType: "customer",
      hasActions: true,
      actions: [
        { id: "ver-cliente", label: "Ver cliente", type: "navigate", target: "/app/customers" },
      ],
    },
  ],

  operational: [
    {
      type: "conversa.atribuida",
      title: "Conversa sem resposta",
      body: "A conversa está aguardando resposta há mais de 2 horas.",
      groupKeySuffix: "sem-resposta",
      hasEntityRef: true,
      entityRefType: "conversation",
      hasActions: true,
      actions: [
        { id: "responder", label: "Responder", type: "navigate", target: "/app/conversations" },
      ],
    },
    {
      type: "conversa.atribuida",
      title: "Cliente dormente identificado",
      body: "Este cliente não realiza compras há mais de 90 dias.",
      groupKeySuffix: "dormentes",
      hasEntityRef: true,
      entityRefType: "customer",
    },
    {
      type: "conversa.atribuida",
      title: "Você está com muitas conversas abertas",
      body: "Sua fila tem mais de 15 conversas ativas. Considere reorganizar prioridades.",
      groupKeySuffix: "sobrecarga",
    },
    {
      type: "conversa.atribuida",
      title: "Positivação em risco",
      body: "A meta de positivação mensal pode não ser atingida no ritmo atual.",
    },
    {
      type: "conversa.atribuida",
      title: "Escalada do SDR pendente",
      body: "Uma escalada do agente SDR aguarda sua atenção.",
      hasEntityRef: true,
      entityRefType: "sdrEscalation",
      hasActions: true,
      actions: [
        { id: "ver-escalada", label: "Ver escalada", type: "navigate", target: "/app/conversations" },
      ],
    },
  ],

  gamification: [
    {
      type: "conversa.atribuida",
      title: "Meta atingida! 🏆",
      body: "Parabéns! Você bateu a meta de vendas deste mês.",
      hasEntityRef: true,
      entityRefType: "goal",
    },
    {
      type: "conversa.atribuida",
      title: "Nova medalha conquistada",
      body: "Você ganhou uma nova medalha de desempenho. Veja seu perfil.",
      hasEntityRef: true,
      entityRefType: "badge",
      hasActions: true,
      actions: [
        { id: "ver-medalha", label: "Ver medalha", type: "navigate", target: "/app/gamification" },
      ],
    },
    {
      type: "conversa.atribuida",
      title: "Você subiu no ranking",
      body: "Você avançou posições no ranking de vendas da semana.",
    },
    {
      type: "conversa.atribuida",
      title: "Meta 80% concluída",
      body: "Você está a 20% de atingir a meta mensal. Continue assim!",
    },
  ],

  system: [
    {
      type: "conversa.atribuida",
      title: "Manutenção programada",
      body: "O sistema entrará em manutenção no domingo às 02:00. Duração estimada: 30 min.",
    },
    {
      type: "conversa.atribuida",
      title: "Integração WhatsApp reconectada",
      body: "A conta WhatsApp foi reconectada com sucesso e está operacional.",
    },
    {
      type: "conversa.atribuida",
      title: "Nova versão disponível",
      body: "Uma nova versão da plataforma foi publicada. Atualize para acessar os novos recursos.",
    },
    {
      type: "conversa.atribuida",
      title: "Backup concluído",
      body: "O backup automático dos dados foi concluído com sucesso.",
    },
  ],

  marketing: [
    {
      type: "conversa.atribuida",
      title: "Nova campanha ativa",
      body: "A campanha de peças Volvo está ativa. Veja os materiais disponíveis.",
      hasActions: true,
      actions: [
        { id: "ver-campanha", label: "Ver campanha", type: "navigate", target: "/app" },
      ],
    },
    {
      type: "conversa.atribuida",
      title: "Promoção de peças encerra amanhã",
      body: "A promoção de filtros e correias encerra amanhã à meia-noite.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Severity override per category (bias the distribution realistically)
// ---------------------------------------------------------------------------

const SEVERITY_BY_CATEGORY: Record<NotificationCategory, typeof SEVERITY_WEIGHTS> = {
  transactional: [
    { value: "info", weight: 35 },
    { value: "success", weight: 40 },
    { value: "warning", weight: 15 },
    { value: "critical", weight: 10 },
  ],
  commercial: [
    { value: "info", weight: 45 },
    { value: "success", weight: 15 },
    { value: "warning", weight: 30 },
    { value: "critical", weight: 10 },
  ],
  operational: [
    { value: "info", weight: 25 },
    { value: "success", weight: 10 },
    { value: "warning", weight: 40 },
    { value: "critical", weight: 25 },
  ],
  gamification: [
    { value: "info", weight: 20 },
    { value: "success", weight: 70 },
    { value: "warning", weight: 8 },
    { value: "critical", weight: 2 },
  ],
  system: [
    { value: "info", weight: 50 },
    { value: "success", weight: 20 },
    { value: "warning", weight: 20 },
    { value: "critical", weight: 10 },
  ],
  marketing: [
    { value: "info", weight: 60 },
    { value: "success", weight: 30 },
    { value: "warning", weight: 8 },
    { value: "critical", weight: 2 },
  ],
};

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface IGenerateNotificationInput {
  sequence: number;
  recipientId: ID;
  recipientType: "seller" | "customer";
  now?: Date;
}

export function generateNotification(
  ctx: ISeededContext,
  input: IGenerateNotificationInput,
): INotification {
  const id: ID = `notif-${String(input.sequence + 1).padStart(4, "0")}`;
  const now = input.now ?? new Date();

  const category = pickWeighted(ctx, CATEGORY_WEIGHTS);
  const severity: NotificationSeverity = pickWeighted(ctx, SEVERITY_BY_CATEGORY[category]);
  const status: NotificationStatus = pickWeighted(ctx, STATUS_WEIGHTS);

  const templates = TEMPLATES[category];
  const template = ctx.pick(templates);

  // createdAt: random within the last 30 days
  const windowStart = daysAgo(30, now);
  const createdAt = randomISO(ctx, windowStart, now);

  // readAt only when status is "read" or "archived"
  const readAt =
    status !== "unread"
      ? randomISO(ctx, new Date(createdAt), now)
      : undefined;

  // expiresAt: ~30% of notifications expire
  const expiresAt = ctx.bool(0.3)
    ? new Date(new Date(createdAt).getTime() + ctx.int(3, 30) * 24 * 60 * 60 * 1000).toISOString()
    : undefined;

  // dedupeKey: type + recipient + day bucket
  const dayBucket = Math.floor(new Date(createdAt).getTime() / (24 * 60 * 60 * 1000));
  const dedupeKey = `${template.type}:${input.recipientId}:${dayBucket}:${input.sequence}`;

  // entityRef
  const entityRef =
    template.hasEntityRef && template.entityRefType
      ? {
          type: template.entityRefType,
          id: `${template.entityRefType}-${String(ctx.int(1, 999)).padStart(4, "0")}`,
        }
      : undefined;

  // actions — only attach when template defines them
  const actions = template.hasActions && template.actions ? template.actions : undefined;

  // groupKey — attach when template defines a suffix
  const groupKey = template.groupKeySuffix
    ? `group:${category}:${template.groupKeySuffix}:${input.recipientId}`
    : undefined;

  return {
    id,
    dedupeKey,
    lifecycle: "event",
    type: "conversa.atribuida", // placeholder type; full catalogue added in Phase 3
    category,
    severity,
    recipientId: input.recipientId,
    recipientType: input.recipientType,
    storeId: SEED_STORE_ID,
    title: template.title,
    body: template.body,
    entityRef,
    actions,
    status,
    channels: ["inApp"],
    groupKey,
    source: "rule",
    createdAt,
    readAt,
    expiresAt,
  };
}
