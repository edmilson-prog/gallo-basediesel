// src/features/coming-soon/config.ts

/** Valores configuráveis da página "Em Breve". Dados reais — Turbo Diesel RS. */
export const COMING_SOON = {
  /** Data-alvo do countdown (ISO 8601 com offset). */
  launchDate: "2026-07-15T12:00:00-03:00",
  /** Percentual exibido na barra de progresso (0–100). */
  progressPercent: 75,
  contacts: {
    // Country code 55 + DDD 55 + mobile 99985-0110
    whatsapp: "https://wa.me/5555999850110",
    email: "turbodieselrs@gmail.com",
    phone: "(55) 99985-0110",
  },
} as const;
