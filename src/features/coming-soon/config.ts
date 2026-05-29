// src/features/coming-soon/config.ts

/** Valores configuráveis da página "Em Breve". Placeholders — ajustar quando houver dados reais. */
export const COMING_SOON = {
  /** Data-alvo do countdown (ISO 8601 com offset). */
  launchDate: "2026-07-15T12:00:00-03:00",
  /** Percentual exibido na barra de progresso (0–100). */
  progressPercent: 75,
  contacts: {
    whatsapp: "https://wa.me/5500000000000",
    instagram: "https://instagram.com/gallobasediesel",
    email: "contato@gallobasediesel.com.br",
    phone: "(55) 0000-0000",
  },
} as const;
