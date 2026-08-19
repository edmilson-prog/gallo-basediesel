import type { ID, ISO8601 } from "./common";
import type { LeadTemperature } from "./lead";

/** Communication channel of a conversation. */
export type ConversationChannel = "whatsapp" | "ecommerce" | "phone" | "site";

/** Normalized WhatsApp ad/post referral — present only when the conversation
 *  began (or most recently resumed) via a Click-to-WhatsApp ad or a post
 *  with a WhatsApp button. Mirrors (but is deliberately NOT imported from)
 *  the provider-layer `IAdReferral` in src/providers/whatsapp/types.ts. */
export interface IAdReferral {
  sourceId?: string;
  sourceUrl?: string;
  sourceType?: string;
  headline?: string;
  body?: string;
  mediaType?: "image" | "video";
  mediaUrl?: string;
}

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
  /**
   * The PERSON on the other side — an Agenda contact. Orthogonal to
   * `customerId`/`leadId`, which say WHICH COMPANY (or which lead record) the
   * thread belongs to: a company speaks through several people, and this is the
   * one typing. Absent when it could not be resolved without guessing.
   */
  contactId?: ID;
  /** Seller currently assigned to this conversation. */
  assignedSellerId?: ID;
  channel: ConversationChannel;
  /** WhatsApp account this conversation is bound to (when channel is whatsapp). */
  whatsappAccountId?: ID;
  status: ConversationStatus;
  /**
   * Instant the conversation entered a terminal status (`resolvida`/`arquivada`),
   * mirroring the `conversations.closed_at` column the timeline RPC reads. Cleared
   * when the conversation is reopened. Absent while it is still open.
   */
  closedAt?: ISO8601;
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
  /**
   * Instant the conversation entered (or re-entered) the manual-distribution
   * queue. Set/cleared by a DB trigger (migration 20260703140000) mirroring
   * `isQueuedConversation`; absent/null when the conversation is not queued.
   * Drives the Inbox wait-time counter.
   */
  queuedAt?: ISO8601;
  /** Set by the webhook when this conversation began (or most recently
   *  resumed) via a WhatsApp ad/post referral. */
  adReferral?: IAdReferral;
  /**
   * Set only when this conversation came from `IConversationsProvider.searchMessages`
   * (the dedicated "search inside messages" action) — the representative matching
   * message (most recent one that matched) plus how many others also matched.
   * Absent for regular `list()` results.
   */
  matchedMessage?: IConversationMessageMatch;
  /**
   * True when the CURRENT seller is a collaborator (not the assignee) on this
   * conversation. Populated only by `IConversationsProvider.searchMessages`/
   * the Inbox search path (`search_conversations` RPC) — undefined elsewhere
   * (plain `get`/`list` never compute it). Drives the "Colaborando" tag.
   */
  isCollaborator?: boolean;
  /**
   * Only present on rows returned by the `search_conversations` RPC: false when
   * the current user can FIND this conversation (search metadata) but cannot
   * OPEN it (assigned to another seller — 2026-07-16 metadata-visibility spec).
   * Undefined elsewhere; treat undefined as accessible.
   */
  isAccessible?: boolean;
  /**
   * Only present on rows returned by the `search_conversations` RPC: contact
   * identity resolved server-side so a metadata-only (locked) search result
   * still shows who the conversation is with. Undefined elsewhere — the inbox
   * resolves contacts via the gated conversation_contacts RPC.
   */
  searchContact?: { name: string; phone: string };
}

/** Kind of attendance-lifecycle event (mirrors the SQL trigger derivation).
 *  `participant_add`/`participant_remove` carry the collaborator in `toSellerId`
 *  and who did it in `actorId` (see conversation_participant_activity_capture). */
export type AttendanceActivityType =
  | "created"
  | "status"
  | "assignment"
  | "reopen"
  | "participant_add"
  | "participant_remove";

/**
 * One append-only entry in a conversation's attendance history
 * (`conversation_activity`). One row per transition, carrying both the status
 * and the owner delta; `actorId == null` (with `actorKind === 'system'`) means
 * the system caused it (e.g. reopen-on-inbound from the webhook).
 */
export interface IConversationActivityEvent {
  id: ID;
  conversationId: ID;
  customerId?: ID;
  leadId?: ID;
  storeId: ID;
  type: AttendanceActivityType;
  fromStatus?: ConversationStatus | null;
  toStatus?: ConversationStatus | null;
  fromSellerId?: ID | null;
  toSellerId?: ID | null;
  actorId?: ID | null;
  actorKind: "seller" | "system";
  createdAt: ISO8601;
  /** Denormalized conversation metadata for the timeline card header. */
  conversationChannel: ConversationChannel;
  conversationStatus: ConversationStatus;
  conversationCreatedAt: ISO8601;
}

/**
 * Owner-managed catalog entry for CONVERSATION tags (distinct from customer
 * tags in IPlatformSettings.tagSuggestions). `conversations.tags` stores the
 * IDs of these entries — renaming/recoloring never rewrites conversations.
 */
export interface IConversationTag {
  id: ID;
  storeId: ID;
  label: string;
  /** Curated palette color id (e.g. "teal") — resolved to hex at render time. */
  color: string;
  /** Archived tags disappear from pickers but keep rendering on old conversations. */
  archived: boolean;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/** Representative message match for the message-content search (see `IConversation.matchedMessage`). */
export interface IConversationMessageMatch {
  text: string;
  sentAt: ISO8601;
  direction: "in" | "out";
  /** Other messages in the same conversation that also matched the search term. */
  extraMatchCount: number;
}

/**
 * Display-ready contact info for a conversation, resolved server-side for the
 * Inbox list + header. Sourced from the `conversation_contacts` RPC (SECURITY
 * DEFINER, gated by can_access_conversation) so a non-staff seller sees the real
 * name of a POOL conversation they can access — WITHOUT widening the customers
 * RLS (the per-row widening was reverted for tripping statement_timeout on bulk
 * customer scans). The mock resolves it directly from the in-memory store.
 */
export interface IConversationContact {
  conversationId: ID;
  /** Customer or lead id — seeds the avatar's stable hue. */
  refId: ID;
  isLead: boolean;
  /**
   * The PERSON on the other side: the linked Agenda contact's name, falling
   * back to the lead's and finally to the company's. A company speaks through
   * several people, so its name is context (see `companyName`) and must never
   * stand in for whoever is actually typing.
   */
  name: string;
  phone: string;
  avatarUrl?: string;
  /** Lead temperature when the contact is a lead; null/absent for customers. */
  temperature?: LeadTemperature | null;
  /** Company this person speaks for — absent while the contact is loose. */
  companyId?: ID | null;
  companyName?: string | null;
  /** Job title on that company ("Compras", "Balcão"). */
  role?: string | null;
}

/** Direction of a message relative to the company. */
export type MessageDirection = "in" | "out";

/** Who authored a message. */
export type MessageAuthorType = "customer" | "seller" | "sdr" | "system";

/** Provider that delivered or originated a message. */
export type MessageProvider = "meta" | "evolution" | "evolution-go" | "waha" | "openwa" | "mock";

/**
 * Delivery status reported by the provider.
 * `queued` is transient (persist-before-send, PRD-115) — it can surface in the
 * UI briefly via Realtime before the dispatch settles into sent/failed.
 */
export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";

/**
 * Discriminator for a message's non-text content, when present.
 *
 * The first five are binary media (carry a `mediaUrl`). `location`, `contact`,
 * and `payment` are STRUCTURED content — no binary payload, no `mediaUrl`: their
 * data lives encoded in `text` (see `@/providers/whatsapp/contentFormat`). They
 * reuse this column purely as a render discriminator, so anything keyed on "has
 * binary media" (archival, signing, the media gallery) must exclude them explicitly.
 */
export type MessageMediaType =
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "payment";

/** One person's reaction to a message. */
export interface IMessageReaction {
  emoji: string;
  at: ISO8601;
}

/**
 * Reactions on a message, keyed by side. A 1:1 conversation has at most two
 * reactors, so fixed slots beat a list. `customer` is the other party — a
 * customer OR a lead.
 */
export interface IMessageReactions {
  customer?: IMessageReaction;
  seller?: IMessageReaction;
}

/**
 * Mensagem citada por outra (reply/quote).
 *
 * É um SNAPSHOT: o conteúdo é a cópia feita no momento da citação, não uma
 * leitura viva da mensagem original. Isso mantém a bolha renderizável sem
 * consulta extra, preserva o texto mesmo quando a original é apagada, e cobre
 * a citação de mensagem que nunca entrou no nosso histórico.
 */
export interface IMessageReplyRef {
  /** Nossa mensagem citada. Ausente quando ela não existe no histórico local —
   *  a citação ainda renderiza (pelo snapshot), mas não é clicável. */
  messageId?: ID;
  /** Id do provider da mensagem citada: serializado quando resolvemos a
   *  original; cru (só o hash, como o WAHA manda) quando não. */
  providerMessageId?: string;
  /** Trecho já truncado na gravação (ver QUOTED_TEXT_MAX). */
  text?: string;
  mediaType?: MessageMediaType;
  direction?: MessageDirection;
}

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
  /** Original filename of the media (documents) — falls back to the storage path tail when absent. */
  mediaFilename?: string;
  /** Mensagem que esta cita (reply/quote). Ausente na grande maioria. */
  replyTo?: IMessageReplyRef;
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
  /** Transcribed text of an inbound audio message (OpenRouter). Undefined until done. */
  transcription?: string;
  /** 'pending' while transcribing, 'done' when `transcription` is set, 'failed' on error/budget/disabled. Undefined = not applicable (non-audio, old message, or feature was off on arrival). */
  transcriptionStatus?: "pending" | "done" | "failed";
  /** Reactions attached to this message. Absent when nobody reacted. */
  reactions?: IMessageReactions;
}

/** WhatsApp provider engine. */
export type WhatsAppProviderName = "meta" | "evolution" | "evolution-go" | "waha" | "openwa";

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
  /** How this collaborator was added — drives the "via @menção" tag in the UI. */
  source: "manual" | "mention";
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
 * WAHA per-session settings surfaced in the UI (wizard "Avançado" + params
 * dialog). `chatFilters` are "process this type" booleans — the engine inverts
 * them into WAHA's `config.ignore`. `device` is shown read-only (no-op on GOWS).
 */
export interface IWahaSessionConfig {
  chatFilters: { groups: boolean; status: boolean; channels: boolean; broadcast: boolean };
  debug: boolean;
  proxy?: { server: string; username?: string; password?: string };
  device?: { name?: string; browser?: string };
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
  /** Evolution Go — server-generated instance id. Empty until first pairing. */
  instanceId?: string;
  /** OpenWA — server-generated session id (`POST /api/sessions`). Empty until first pairing. */
  sessionId?: string;
  /** Per-instance identity color (hex) for the origin dot/bar — falls back to a hash of the id. */
  accentColor?: string;
  /** WAHA — the created session name (provider='waha' rows). */
  sessionName?: string;
  /** WAHA — per-session settings (chat filters, debug, proxy). */
  waha?: IWahaSessionConfig;
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
  /** Evolution Go — server this instance belongs to (registry). Null for v2/Meta. */
  goServerId?: ID;
  /** WAHA — server this instance belongs to (registry). Null for v2/Meta/Evolution. */
  wahaServerId?: ID;
  /** OpenWA — server this instance belongs to (registry). Null for outros providers. */
  openwaServerId?: ID;
  /**
   * When true, disconnection/health alerts for this account are silenced:
   * the "Conexão perdida" card banner, the global disconnect banner, the
   * TopBar indicator AND the in-app notifications (connection trigger +
   * health tick) skip this account. Lets the Owner shelve an intentionally
   * offline instance. Default `false`.
   */
  alertsMuted: boolean;
  /**
   * SDR pilot opt-in for this specific WhatsApp number (Parte C). The
   * store-wide `sdr_settings.sdr_enabled` switch must ALSO be on — this is a
   * second, narrower gate, not a replacement. Default `false`: an instance
   * never receives the SDR until explicitly opted in.
   */
  sdrEnabled: boolean;
}

/**
 * Evolution Go server (whatsmeow). Platform-level infra registered once by the
 * Owner. Holds the friendly name, endpoint and a Vault POINTER to the global
 * key (`apiKeyRef`) — never the key itself. Go accounts reference it via
 * `IWhatsAppAccount.goServerId`.
 */
export interface IWhatsAppGoServer {
  id: ID;
  /** Friendly name (unique). */
  name: string;
  /** Endpoint, normalized (no trailing slash). */
  baseUrl: string;
  /** Vault secret name holding the server-wide global key. Matches `^[A-Z][A-Z0-9_]{2,64}$`. */
  apiKeyRef: string;
  createdAt: ISO8601;
  updatedAt?: ISO8601;
}

/**
 * WAHA server. Platform-level infra registered once by the Owner.
 * Holds the friendly name, endpoint and Vault POINTERs to credentials
 * (`apiKeyRef` for API authentication, `webhookHmacRef` for webhook signature).
 * WAHA accounts reference it via `IWhatsAppAccount.wahaServerId`.
 */
export interface IWahaServer {
  id: ID;
  /** Friendly name (unique). */
  name: string;
  /** Endpoint, normalized (no trailing slash). */
  baseUrl: string;
  /** Vault secret name holding the API key. Matches `^[A-Z][A-Z0-9_]{2,64}$`. */
  apiKeyRef: string;
  /** Vault secret name holding the webhook HMAC key (optional). Matches `^[A-Z][A-Z0-9_]{2,64}$`. */
  webhookHmacRef?: string;
  createdAt: ISO8601;
  updatedAt?: ISO8601;
}

/**
 * OpenWA server (self-hosted whatsapp-web.js). Platform-level infra registered
 * once by the Owner. Holds the friendly name, endpoint and a Vault POINTER to
 * the global key (`apiKeyRef`) — never the key itself. OpenWA accounts reference
 * it via `IWhatsAppAccount.openwaServerId`.
 */
export interface IWhatsAppOpenWaServer {
  id: ID;
  /** Friendly name (unique). */
  name: string;
  /** Endpoint, normalized (no trailing slash). */
  baseUrl: string;
  /** Vault secret name holding the server-wide global key. Matches `^[A-Z][A-Z0-9_]{2,64}$`. */
  apiKeyRef: string;
  createdAt: ISO8601;
  updatedAt?: ISO8601;
}

/** Idle-conversation summary (spec 2026-07-16) — read model of idle_conversations_summary(). */
export interface IIdleConversationEntry {
  conversationId: ID;
  contactName: string;
  lastInboundPreview: string | null;
  awaitingReplySince: ISO8601;
  businessSeconds: number;
  level: 1 | 2 | 3;
}
export interface IIdleSummary {
  /** Counts per level, computed over ALL entries (list capped at 500). */
  counts: { level1: number; level2: number; level3: number };
  /** Ordered worst-first: level desc, businessSeconds desc. */
  entries: IIdleConversationEntry[];
}

/** Absence classification driving the rescue broadcast (spec 2026-07-17). */
export type AbsenceKind = "schedule" | "temporary";

/** Lifecycle of a rescue broadcast row. */
export type ConversationRescueStatus = "broadcasting" | "claimed" | "forced" | "cancelled";

/** Rescue-broadcast record — one row per absence event needing coverage. */
export interface IConversationRescue {
  id: ID;
  conversationId: ID;
  storeId: ID;
  whatsappAccountId: ID | null;
  absentSellerId: ID;
  absenceKind: AbsenceKind;
  contactName: string;
  lastInboundPreview: string | null;
  status: ConversationRescueStatus;
  broadcastAt: ISO8601;
  claimedBySellerId?: ID;
  claimedAt?: ISO8601;
  forcedSellerId?: ID;
  forcedAt?: ISO8601;
  cancelledReason?: string;
  createdAt: ISO8601;
}

/** One note attached to a conversation, as returned by get_customer_timeline. */
export interface ICustomerTimelineNote {
  id: ID;
  at: string;
  authorId: ID | null;
  body: string;
}

/** A quote or order anchored to a conversation. */
export interface ICustomerTimelineDeal {
  id: ID;
  at: string;
  total: number;
  status?: string;
}

/** One conversation with everything the timeline needs to render it. */
export interface ICustomerTimelineConversation {
  id: ID;
  channel: ConversationChannel;
  status: ConversationStatus;
  createdAt: string;
  closedAt: string | null;
  assignedSellerId: ID | null;
  /** Born before the trigger existed — its beginning was never recorded. */
  preRegistro: boolean;
  messageCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  events: IConversationActivityEvent[];
  notes: ICustomerTimelineNote[];
  quotes: ICustomerTimelineDeal[];
  orders: ICustomerTimelineDeal[];
}

/** Full payload of get_customer_timeline. */
export interface ICustomerTimelinePayload {
  customerId: ID;
  generatedAt: string;
  conversations: ICustomerTimelineConversation[];
}
