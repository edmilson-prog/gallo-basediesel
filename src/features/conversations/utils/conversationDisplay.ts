import type {
  ConversationChannel,
  ConversationStatus,
  IConversation,
  IConversationContact,
  ICustomer,
  ILead,
  IMessage,
  LeadTemperature,
} from "@/shared/types";
import { hashHue, initialsFrom, isPhoneLikeName } from "@/shared/utils/avatar";
import { decodeContact, decodeLocation } from "@/providers/whatsapp/contentFormat";
import { isContentFreeMessage } from "../engine/contentFreeMessage";
import { INBOX_STRINGS, STRUCTURED_PREVIEW_ICON } from "../i18n/pt-BR";

export interface IConversationDisplay {
  name: string;
  initials: string;
  /** Public URL of the contact's synced WhatsApp photo, when available. */
  avatarUrl?: string;
  /**
   * The display name is really just a phone number (unsaved WhatsApp contact) —
   * surfaces render a generic person icon instead of a useless `"+5"`.
   */
  isPhoneName: boolean;
  /** Stable color seed for the avatar fallback (0-360 hue). */
  hue: number;
  phone: string;
  isLead: boolean;
  temperature: LeadTemperature | null;
}

/** The "Lead anônimo" fallback — used when no contact could be resolved. */
function unknownDisplay(conversation: IConversation): IConversationDisplay {
  return {
    name: INBOX_STRINGS.unknownParticipant,
    initials: "?",
    isPhoneName: false,
    hue: hashHue(conversation.id),
    phone: "",
    isLead: true,
    temperature: null,
  };
}

export function getConversationDisplay(
  conversation: IConversation,
  customer: ICustomer | null,
  lead: ILead | null,
): IConversationDisplay {
  if (customer) {
    // A DINTEC-enriched B2B customer can land with an empty nomeFantasia — fall
    // back to razaoSocial then contactName so the header never shows a blank
    // name (the RPC path is hardened the same way in conversation_contacts).
    const name =
      customer.type === "B2B"
        ? customer.nomeFantasia || customer.razaoSocial || customer.contactName
        : customer.fullName;
    return {
      name,
      initials: initialsFrom(name),
      avatarUrl: customer.avatarUrl,
      isPhoneName: isPhoneLikeName(name),
      hue: hashHue(customer.id),
      phone: customer.phone,
      isLead: false,
      temperature: null,
    };
  }
  if (lead) {
    return {
      name: lead.name,
      initials: initialsFrom(lead.name),
      isPhoneName: isPhoneLikeName(lead.name),
      hue: hashHue(lead.id),
      phone: lead.phone,
      isLead: true,
      temperature: lead.temperature,
    };
  }
  return unknownDisplay(conversation);
}

/**
 * Display for a conversation from a server-resolved {@link IConversationContact}
 * — the pool-safe path. The `conversation_contacts` RPC returns a contact for any
 * conversation the caller can access (POOL included), so this reliably renders
 * the real name where the per-entity `customers.get()` would be RLS-blocked and
 * fall back to "Lead anônimo". A missing/empty contact still degrades to the
 * unknown fallback.
 */
export function displayFromContact(
  conversation: IConversation,
  contact: IConversationContact | null,
): IConversationDisplay {
  const name = contact?.name?.trim();
  if (!contact || !name) return unknownDisplay(conversation);
  return {
    name,
    initials: initialsFrom(name),
    avatarUrl: contact.avatarUrl,
    isPhoneName: isPhoneLikeName(name),
    hue: hashHue(contact.refId),
    phone: contact.phone,
    isLead: contact.isLead,
    temperature: contact.temperature ?? null,
  };
}

/** Short preview of the last message — handles media. */
export function getMessagePreview(message: IMessage | null): string {
  if (!message) return "";
  // Structured shares: decode the name from the canonical text so the list shows
  // WHO/WHERE (e.g. "👤 João Silva" / "📍 Oficina Central"), not a bare "👤 Contato"
  // — falls back to the generic label when no name was attached.
  if (message.mediaType === "contact") {
    const { name } = decodeContact(message.text);
    return name ? `${STRUCTURED_PREVIEW_ICON.contact} ${name}` : INBOX_STRINGS.mediaPreview.contact;
  }
  if (message.mediaType === "location") {
    const { name } = decodeLocation(message.text);
    return name ? `${STRUCTURED_PREVIEW_ICON.location} ${name}` : INBOX_STRINGS.mediaPreview.location;
  }
  if (message.mediaType) {
    return INBOX_STRINGS.mediaPreview[message.mediaType] ?? "📎 Anexo";
  }
  // Mirrors the thread's UnsupportedBubble: without this the Inbox row for a
  // conversation whose last message is content-free renders a blank preview.
  if (isContentFreeMessage(message)) {
    return INBOX_STRINGS.mediaPreview.unsupported;
  }
  return message.text;
}

/** Channel display metadata (icon, label, color token). */
export const CHANNEL_META: Record<
  ConversationChannel,
  { icon: string; label: string; tone: string }
> = {
  whatsapp: {
    icon: "mdi:whatsapp",
    label: "WhatsApp",
    tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  ecommerce: {
    icon: "mdi:cart-outline",
    label: "E-commerce",
    tone: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  },
  phone: {
    icon: "mdi:phone-outline",
    label: "Telefone",
    tone: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  },
  site: {
    icon: "mdi:web",
    label: "Site",
    tone: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  },
};

/** Indicator shape for a status dot: solid = "our turn", ring = "waiting on client". */
export type StatusShape = "filled" | "outline" | "check";

/**
 * Single source of truth for status visuals (icon, pill classes, list border,
 * dot shape). Text labels live in CONVERSATION_STRINGS.statusLabel /
 * statusAriaLabel — this map is visuals only. Colors come from semantic tokens
 * (severity-*, primary, muted); em_andamento uses `primary` (gold) to avoid
 * clashing with the WhatsApp channel green.
 */
export interface IStatusMeta {
  icon: string;
  /** Header pill (bg + text + border). */
  pillClass: string;
  /** 3px list border bar. */
  barClass: string;
  shape: StatusShape;
  /** Dot color/treatment used inside pills and segments. */
  dotClass: string;
}

export const STATUS_META: Record<ConversationStatus, IStatusMeta> = {
  aguardando: {
    icon: "mdi:account-clock-outline",
    pillClass: "bg-severity-warning/15 text-severity-warning border border-severity-warning/30",
    barClass: "bg-severity-warning",
    shape: "filled",
    dotClass: "bg-severity-warning",
  },
  em_andamento: {
    icon: "mdi:message-processing-outline",
    pillClass: "bg-primary/15 text-primary border border-primary/30",
    barClass: "bg-primary",
    shape: "filled",
    dotClass: "bg-primary",
  },
  aguardando_cliente: {
    icon: "mdi:account-arrow-left-outline",
    pillClass: "bg-severity-info/15 text-severity-info border border-severity-info/30",
    barClass: "bg-severity-info",
    shape: "outline",
    dotClass: "border-2 border-severity-info",
  },
  resolvida: {
    icon: "mdi:check-circle-outline",
    pillClass: "bg-severity-success/15 text-severity-success border border-severity-success/30",
    barClass: "bg-severity-success/50",
    shape: "check",
    dotClass: "bg-severity-success",
  },
  arquivada: {
    icon: "mdi:archive-outline",
    pillClass: "bg-muted text-muted-foreground border border-border",
    barClass: "bg-transparent",
    shape: "filled",
    dotClass: "bg-muted-foreground/40",
  },
};

export const TEMPERATURE_META: Record<
  LeadTemperature,
  { icon: string; label: string; tone: string }
> = {
  frio: {
    icon: "mdi:snowflake",
    label: "Frio",
    tone: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  morno: {
    icon: "mdi:weather-sunny",
    label: "Morno",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  quente: {
    icon: "mdi:fire",
    label: "Quente",
    tone: "bg-red-500/15 text-red-700 dark:text-red-300",
  },
};
