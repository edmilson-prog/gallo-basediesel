import type { CarteiraTransferStatus, CarteiraTransferType } from "@/shared/types";

const TYPE_BADGE_VARIANT: Record<
  CarteiraTransferType,
  "default" | "secondary" | "outline" | "destructive"
> = {
  temporary: "secondary",
  permanent_individual: "default",
  permanent_batch: "outline",
};

const STATUS_BADGE_VARIANT: Record<
  CarteiraTransferStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  active: "default",
  reverted: "outline",
  expired: "secondary",
};

const TYPE_LABEL: Record<CarteiraTransferType, string> = {
  temporary: "Temporária",
  permanent_individual: "Permanente individual",
  permanent_batch: "Permanente em lote",
};

const STATUS_LABEL: Record<CarteiraTransferStatus, string> = {
  active: "Ativa",
  reverted: "Revertida",
  expired: "Expirada",
};

const TYPE_ICON: Record<CarteiraTransferType, string> = {
  temporary: "mdi:clock-time-five-outline",
  permanent_individual: "mdi:account-arrow-right-outline",
  permanent_batch: "mdi:account-group-outline",
};

export function transferTypeLabel(type: CarteiraTransferType): string {
  return TYPE_LABEL[type];
}

export function transferTypeBadgeVariant(type: CarteiraTransferType) {
  return TYPE_BADGE_VARIANT[type];
}

export function transferStatusLabel(status: CarteiraTransferStatus): string {
  return STATUS_LABEL[status];
}

export function transferStatusBadgeVariant(status: CarteiraTransferStatus) {
  return STATUS_BADGE_VARIANT[status];
}

export function transferTypeIcon(type: CarteiraTransferType): string {
  return TYPE_ICON[type];
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatPeriod(start?: string, end?: string): string {
  if (!start && !end) return "—";
  if (start && end) return `${formatDate(start)} → ${formatDate(end)}`;
  if (start) return `desde ${formatDate(start)}`;
  return `até ${formatDate(end)}`;
}

/**
 * Tempo restante até a reversão automática (formato curto).
 */
export function timeUntil(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const target = new Date(iso).getTime();
  const diff = target - now.getTime();
  if (diff <= 0) return "iminente";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `em ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `em ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `em ${days} d`;
  const months = Math.floor(days / 30);
  return `em ${months} m`;
}

export function dateInputValue(iso: string | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function dateInputToISO(value: string, endOfDay = false): string | undefined {
  if (!value) return undefined;
  const date = new Date(value + (endOfDay ? "T23:59:59" : "T00:00:00"));
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}
