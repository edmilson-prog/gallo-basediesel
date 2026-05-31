import type { NotificationSeverity, NotificationCategory } from "@/providers/notifications";

/** Tonal severity treatment → Tailwind utility classes (see src/styles.css --severity-*). */
export const SEVERITY_TONE: Record<
  NotificationSeverity,
  { text: string; bg: string; border: string }
> = {
  info: {
    text: "text-severity-info",
    bg: "bg-severity-info/15",
    border: "border-severity-info",
  },
  success: {
    text: "text-severity-success",
    bg: "bg-severity-success/15",
    border: "border-severity-success",
  },
  warning: {
    text: "text-severity-warning",
    bg: "bg-severity-warning/15",
    border: "border-severity-warning",
  },
  critical: {
    text: "text-severity-critical",
    bg: "bg-severity-critical/15",
    border: "border-severity-critical",
  },
};

/** Category → Iconify mdi icon (PRD-009 Anexo A). */
export const CATEGORY_ICON: Record<NotificationCategory, string> = {
  transactional: "mdi:receipt-text",
  commercial: "mdi:account-clock",
  operational: "mdi:alert-circle",
  gamification: "mdi:trophy",
  system: "mdi:cog",
  marketing: "mdi:bullhorn",
};

/** Category → pt-BR display label. */
export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  transactional: "Transacional",
  commercial: "Comercial",
  operational: "Operacional",
  gamification: "Gamificação",
  system: "Sistema",
  marketing: "Marketing",
};

/** Severity → pt-BR display label. */
export const SEVERITY_LABEL: Record<NotificationSeverity, string> = {
  info: "Informação",
  success: "Sucesso",
  warning: "Atenção",
  critical: "Crítico",
};
