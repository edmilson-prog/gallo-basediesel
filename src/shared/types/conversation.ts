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

/** Delivery status reported by the provider. */
export type MessageStatus = "sent" | "delivered" | "read" | "failed";

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
  sentAt: ISO8601;
  deliveredAt?: ISO8601;
  readAt?: ISO8601;
}

/** WhatsApp provider engine. */
export type WhatsAppProviderName = "meta" | "evolution";

/** Connection status of a WhatsApp account. */
export type WhatsAppAccountStatus = "connected" | "disconnected" | "pending";

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
  createdAt: ISO8601;
}
