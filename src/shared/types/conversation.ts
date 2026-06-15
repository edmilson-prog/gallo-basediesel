import type { ID, ISO8601 } from "./common";

/** Communication channel of a conversation. */
export type ConversationChannel = "whatsapp" | "ecommerce" | "phone" | "site";

/** Status flow of a conversation in the inbox. */
export type ConversationStatus =
  | "aguardando"
  | "em_andamento"
  | "aguardando_cliente"
  | "resolvida"
  | "arquivada";

/**
 * Conversation — a thread of messages with a customer or lead.
 *
 * Semantic invariant: exactly one of `customerId` or `leadId` is set.
 * The type leaves both optional; the rule is enforced at the mock / service layer.
 *
 * @see ../../../docs/glossario.md#inbox
 */
export interface IConversation {
  id: ID;
  storeId: ID;
  /** Customer participant — mutually exclusive with `leadId`. */
  customerId?: ID;
  /** Lead participant — mutually exclusive with `customerId`. */
  leadId?: ID;
  /** Seller currently assigned to this conversation. */
  assignedSellerId?: ID;
  channel: ConversationChannel;
  /** WhatsApp account this conversation is bound to (when channel is whatsapp). */
  whatsappAccountId?: ID;
  status: ConversationStatus;
  /** Whether the SDR agent is currently driving this conversation. */
  isSdrActive: boolean;
  tags: string[];
  /**
   * Order this conversation was opened to follow up (PRD-067 RF-006). Set when
   * the conversation is auto-created from an e-commerce order; drives the
   * "Conversa criada via E-commerce" banner and the order deep-link.
   */
  linkedOrderId?: ID;
  lastMessageAt: ISO8601;
  unreadCount: number;
  createdAt: ISO8601;
}

/** Direction of a message relative to the company. */
export type MessageDirection = "in" | "out";

/** Who authored a message. */
export type MessageAuthorType = "customer" | "seller" | "sdr" | "system";

/** Provider that delivered or originated a message. */
export type MessageProvider = "meta" | "evolution" | "mock";

/**
 * Delivery status reported by the provider.
 * `queued` is transient (persist-before-send, PRD-115) — it can surface in the
 * UI briefly via Realtime before the dispatch settles into sent/failed.
 */
export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";

/** Media payload kind, when present. */
export type MessageMediaType = "image" | "audio" | "video" | "document" | "sticker";

/**
 * Message — a single utterance inside an `IConversation`.
 *
 * @see ../../../docs/glossario.md#janela-de-24h-whatsapp
 */
export interface IMessage {
  id: ID;
  conversationId: ID;
  direction: MessageDirection;
  authorType: MessageAuthorType;
  /** Author identifier when relevant (sellerId, sdrId, customerId). */
  authorId?: ID;
  provider: MessageProvider;
  /** Plain text body. Empty when the message is media-only. */
  text: string;
  mediaType?: MessageMediaType;
  mediaUrl?: string;
  status: MessageStatus;
  /**
   * When the customer actually sent the message — the original WhatsApp
   * `messageTimestamp` for inbound. For outbound it is our send time.
   */
  sentAt: ISO8601;
  /**
   * When our server received/persisted the message (the row's `created_at`).
   * For inbound this can lag `sentAt` (reconnection backlog, history import);
   * for outbound it is written alongside `sentAt`, so the gap is ~zero.
   * Optional: legacy/mock rows may omit it, and the UI degrades gracefully.
   */
  receivedAt?: ISO8601;
  deliveredAt?: ISO8601;
  readAt?: ISO8601;
  /** Human-readable reason of a failed dispatch (PRD-114/118). */
  failureReason?: string;
  /** Semantic provider error code of a failed dispatch (e.g. "131026"). */
  failureCode?: string;
}

/** WhatsApp provider engine. */
export type WhatsAppProviderName = "meta" | "evolution";

/** Connection status of a WhatsApp account. */
export type WhatsAppAccountStatus = "connected" | "disconnected" | "pending";

/** Health state maintained by the monitoring tick + manual action (PRD-120). */
export type WhatsAppAccountHealthState = "healthy" | "degraded" | "down" | "paused";

/** Failover policy of an account (PRD-120). */
export type WhatsAppFailoverPolicy = "disabled" | "manual" | "automatic";

/** Finalidade de uma instância: caixa de atendimento, disparo de campanha, ou ambos. */
export type WhatsAppAccountPurpose = "atendimento" | "campanha" | "ambos";

/** Regra OU de acesso a uma instância (Camada 1, multi-instância). */
export interface IWhatsAppAccountAccessRule {
  id: ID;
  whatsappAccountId: ID;
  kind: "seller" | "role" | "store";
  /** seller uuid | role claim cru (ex. 'seller_internal') | store uuid */
  targetValue: string;
  createdAt: ISO8601;
}

/** Co-responsável de uma conversa (Camada 2, multi-instância). */
export interface IConversationParticipant {
  conversationId: ID;
  sellerId: ID;
  addedBy?: ID;
  addedAt: ISO8601;
}

/**
 * Capability matrix advertised by a WhatsApp provider.
 * UI adapts based on these flags (e.g. hide HSM templates when Evolution is selected).
 *
 * @see ../../../docs/glossario.md#capabilities
 */
export interface IWhatsAppCapabilities {
  supportsTemplatesHsm: boolean;
  supportsInteractiveButtons: boolean;
  supportsLists: boolean;
  supportsReactions: boolean;
  supportsProactiveMessaging: boolean;
  supportsReadStatusInGroups: boolean;
}

/**
 * Non-secret engine configuration of a WhatsApp account (PRD-111/119).
 * Which fields apply depends on {@link IWhatsAppAccount.provider}: Meta uses
 * `phoneNumberId`/`businessAccountId`; Evolution uses `baseUrl`/`instanceName`.
 * Secrets NEVER live here — they are Edge Function secrets named by the
 * `credentialsRef` prefix.
 */
export interface IWhatsAppProviderConfig {
  /** Meta Cloud API — WhatsApp Business phone number id. */
  phoneNumberId?: string;
  /** Meta Cloud API — WhatsApp Business Account (WABA) id. */
  businessAccountId?: string;
  /** Evolution — base URL of the Evolution API instance host. */
  baseUrl?: string;
  /** Evolution — instance name within the host. */
  instanceName?: string;
}

/**
 * WhatsApp account configured per store.
 * `credentialsRef` is **always** an obfuscated reference — never the raw credential.
 * Secrets live in a vault (Fase 2) and are dereferenced server-side.
 */
export interface IWhatsAppAccount {
  id: ID;
  storeId: ID;
  label: string;
  phoneNumber: string;
  provider: WhatsAppProviderName;
  /** Opaque reference to the credential stored in a vault. Never the secret itself. */
  credentialsRef: string;
  status: WhatsAppAccountStatus;
  capabilities: IWhatsAppCapabilities;
  /** Non-secret engine config (PRD-111). `undefined` while unconfigured. */
  providerConfig?: IWhatsAppProviderConfig;
  /** Health state from the monitoring tick (PRD-120). Default `healthy`. */
  currentState: WhatsAppAccountHealthState;
  /** Last state transition. */
  stateChangedAt?: ISO8601;
  /** Failover policy (PRD-120). Default `disabled`. */
  failoverPolicy: WhatsAppFailoverPolicy;
  /** Backup account for NEW outbound while failover is active. */
  failoverAccountId?: ID;
  /** True while outbound is being routed through the backup account. */
  isFailoverActive: boolean;
  createdAt: ISO8601;
  /** Finalidade da instância (multi-instância). Default 'atendimento'. */
  purpose: WhatsAppAccountPurpose;
}
