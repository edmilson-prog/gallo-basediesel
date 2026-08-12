import type { ConversationChannel, ConversationStatus } from "@/shared/types";

export type PwaStatusDotShape = "filled" | "outline" | "check";

export interface IPwaStatusMeta {
  label: string;
  /** Tailwind text colour class — semantic tokens only. */
  toneClass: string;
  /** Matching background class for the 3px rail on a list row. */
  railClass: string;
  dot: PwaStatusDotShape;
  icon: string;
}

/**
 * Status presentation for the phone.
 *
 * Deliberate divergence from the desktop, carried over from the kit review:
 * `em_andamento` renders **white**, not gold. Gold is reserved for the primary
 * action and the outgoing bubble's rail, so the parent brand stays monochrome.
 */
export const PWA_STATUS_META: Record<ConversationStatus, IPwaStatusMeta> = {
  aguardando: {
    label: "Aguardando",
    toneClass: "text-primary",
    railClass: "bg-primary",
    dot: "filled",
    icon: "mdi:clock-outline",
  },
  em_andamento: {
    label: "Em atendimento",
    toneClass: "text-foreground",
    railClass: "bg-foreground",
    dot: "filled",
    icon: "mdi:message-outline",
  },
  aguardando_cliente: {
    label: "Aguardando cliente",
    toneClass: "text-severity-info",
    railClass: "bg-severity-info",
    dot: "outline",
    icon: "mdi:account-outline",
  },
  resolvida: {
    label: "Resolvida",
    toneClass: "text-severity-success",
    railClass: "bg-severity-success/50",
    dot: "check",
    icon: "mdi:check",
  },
  arquivada: {
    label: "Arquivada",
    toneClass: "text-muted-foreground",
    railClass: "bg-muted-foreground/40",
    dot: "outline",
    icon: "mdi:archive-outline",
  },
};

/** Statuses offered in the status sheet — archiving is not part of this app. */
export const PWA_STATUS_ORDER: ConversationStatus[] = [
  "aguardando",
  "em_andamento",
  "aguardando_cliente",
  "resolvida",
];

export interface IPwaChannelMeta {
  label: string;
  icon: string;
  toneClass: string;
}

export const PWA_CHANNEL_META: Record<ConversationChannel, IPwaChannelMeta> = {
  whatsapp: { label: "WhatsApp", icon: "mdi:whatsapp", toneClass: "text-severity-success" },
  ecommerce: { label: "E-commerce", icon: "mdi:package-variant", toneClass: "text-severity-info" },
  phone: { label: "Telefone", icon: "mdi:phone", toneClass: "text-severity-warning" },
  site: { label: "Site", icon: "mdi:web", toneClass: "text-severity-info" },
};

/** Two-letter monogram for the avatar — first letters of the first two words. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const [first, second] = words;
  if (!first) return "?";
  if (!second) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + second.charAt(0)).toUpperCase();
}

/**
 * Display label for a contact: the part before the first separator, so
 * "PAWIMAC · Antonello Terraplanagem" reads as "PAWIMAC" on a narrow screen —
 * **in caixa alta**.
 *
 * The names arrive from the WhatsApp address book and from imports, so the list
 * mixes "EDER BATISTA", "Marcelo Viana" and "raimannbuenodiego" on consecutive
 * rows. Normalising here rather than with `text-transform` keeps the three
 * surfaces that show a contact — lista, cabeçalho da conversa e mídias — reading
 * from one rule, and keeps the shortening and the casing in the same place.
 * The stored name is untouched: this is a label, not a migration.
 */
export function shortNameOf(name: string): string {
  const [head] = name.split(/\s+[·|—-]\s+/);
  const label = (head ?? name).trim() || name;
  return label.toLocaleUpperCase("pt-BR");
}
