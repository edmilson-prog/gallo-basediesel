import type {
  ConversationChannel,
  ConversationStatus,
  IConversation,
  ICustomer,
  ILead,
  IMessage,
  LeadTemperature,
} from "@/shared/types";
import { hashHue, initialsFrom, isPhoneLikeName } from "@/shared/utils/avatar";
import { INBOX_STRINGS } from "../i18n/pt-BR";

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

export function getConversationDisplay(
  conversation: IConversation,
  customer: ICustomer | null,
  lead: ILead | null,
): IConversationDisplay {
  if (customer) {
    const name = customer.type === "B2B" ? customer.nomeFantasia : customer.fullName;
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

/** Short preview of the last message — handles media. */
export function getMessagePreview(message: IMessage | null): string {
  if (!message) return "";
  if (message.mediaType) {
    return INBOX_STRINGS.mediaPreview[message.mediaType] ?? "📎 Anexo";
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

/** Vertical status indicator (3px border) color per status. */
export const STATUS_BORDER: Record<ConversationStatus, string> = {
  aguardando: "bg-orange-500",
  em_andamento: "bg-emerald-500",
  aguardando_cliente: "bg-sky-400",
  resolvida: "bg-muted-foreground/40",
  arquivada: "bg-transparent",
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
