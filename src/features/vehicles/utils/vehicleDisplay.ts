import type { VehicleCadastroStatus } from "@/shared/types";
import type { VehicleHealthStatus } from "./vehicleHealth";
import { VEHICLE_STRINGS } from "../i18n/pt-BR";

const HEALTH_COPY = VEHICLE_STRINGS.detail.health;

export const BRAND_ICON: Record<string, string> = {
  Volvo: "mdi:truck-fast",
  Scania: "mdi:truck-cargo-container",
  "Mercedes-Benz": "mdi:truck",
  Ford: "mdi:truck-outline",
  Iveco: "mdi:truck-delivery-outline",
};

export function iconForBrand(brand: string): string {
  return BRAND_ICON[brand] ?? "mdi:truck-outline";
}

export const STATUS_BADGE_CLASSES: Record<VehicleCadastroStatus, string> = {
  aprovado: "border-severity-success/30 bg-severity-success/10 text-severity-success",
  pendente: "border-severity-warning/30 bg-severity-warning/10 text-severity-warning",
  rejeitado: "border-destructive/30 bg-destructive/10 text-destructive dark:bg-destructive/15",
};

export const STATUS_LABEL: Record<VehicleCadastroStatus, string> = {
  aprovado: "Aprovado",
  pendente: "Pendente",
  rejeitado: "Rejeitado",
};

/** Label, color and icon for each health state — never color alone. */
export const HEALTH_STATUS_META: Record<
  VehicleHealthStatus,
  { label: string; text: string; dot: string; icon: string }
> = {
  unknown: {
    label: HEALTH_COPY.unknown,
    text: "text-muted-foreground",
    dot: "bg-muted-foreground/40",
    icon: "mdi:help-circle-outline",
  },
  ok: {
    label: HEALTH_COPY.ok,
    text: "text-severity-success",
    dot: "bg-severity-success",
    icon: "mdi:check-circle-outline",
  },
  attention: {
    label: HEALTH_COPY.attention,
    text: "text-severity-warning",
    dot: "bg-severity-warning",
    icon: "mdi:alert-circle-outline",
  },
  overdue: {
    label: HEALTH_COPY.overdue,
    text: "text-destructive",
    dot: "bg-destructive",
    icon: "mdi:alert-octagon-outline",
  },
};

export function formatKm(km?: number): string {
  if (typeof km !== "number") return "—";
  return `${km.toLocaleString("pt-BR")} km`;
}

export function formatPlate(plate?: string): string {
  if (!plate) return "—";
  return plate.toUpperCase();
}

export function maskVin(vin?: string): string {
  if (!vin) return "—";
  if (vin.length <= 6) return vin;
  return `${vin.slice(0, 3)}••••••${vin.slice(-3)}`;
}
