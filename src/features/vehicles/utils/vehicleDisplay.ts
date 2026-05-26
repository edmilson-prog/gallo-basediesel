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
  aprovado:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-300",
  pendente:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-300",
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
