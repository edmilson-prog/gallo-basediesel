import type { VehicleCadastroStatus } from "@/shared/types";

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
