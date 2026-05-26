import type { IDistributionSettings } from "@/shared/types";

/**
 * MVP defaults — hybrid mode (carteira sagrada, restante via SDR-first), full
 * cascade enabled, business hours Mon-Fri 8h-18h + Saturday 8h-12h.
 *
 * Keywords reflect the heavy-truck part vocabulary the seeded conversations
 * already exercise (PRD-004), so the simulator surfaces realistic matches.
 */
export const DEFAULT_DISTRIBUTION_SETTINGS: IDistributionSettings = {
  mode: "hybrid",
  criteriaEnabled: {
    carteira: true,
    especialidade: true,
    round_robin: true,
    carga: true,
    fallback: true,
  },
  criteriaOrder: ["carteira", "especialidade", "round_robin", "carga", "fallback"],
  businessHours: [
    { weekday: 0, openAt: "08:00", closeAt: "18:00", enabled: false },
    { weekday: 1, openAt: "08:00", closeAt: "18:00", enabled: true },
    { weekday: 2, openAt: "08:00", closeAt: "18:00", enabled: true },
    { weekday: 3, openAt: "08:00", closeAt: "18:00", enabled: true },
    { weekday: 4, openAt: "08:00", closeAt: "18:00", enabled: true },
    { weekday: 5, openAt: "08:00", closeAt: "18:00", enabled: true },
    { weekday: 6, openAt: "08:00", closeAt: "12:00", enabled: true },
  ],
  offHoursMessage:
    "Oi! Recebemos sua mensagem fora do nosso horário comercial. Vamos te responder assim que abrirmos (seg-sex 8h-18h, sáb 8h-12h). Se quiser, conte aqui o que precisa que já adianto o atendimento.",
  queueTimeoutMinutes: 30,
  lastAssignedSellerId: null,
  specialtyKeywords: [
    "volvo",
    "scania",
    "mercedes",
    "ford",
    "iveco",
    "freio",
    "motor",
    "embreagem",
    "filtro",
    "turbo",
    "injetor",
  ],
};
