/**
 * GALLO Theme configuration.
 * Codinomes UI são amigáveis (mostrados na interface).
 * Nomes técnicos (`diesel`, `parts`, etc.) são usados em CSS / código.
 */

export type ThemeName = "diesel" | "parts" | "service" | "industrial";
export type ThemeMode = "light" | "dark" | "auto";
export type ResolvedMode = "light" | "dark";

export const THEME_NAMES: ThemeName[] = ["diesel", "parts", "service", "industrial"];
export const MODES: ThemeMode[] = ["light", "dark", "auto"];

export const DEFAULT_THEME: ThemeName = "diesel";
export const DEFAULT_MODE: ThemeMode = "auto";

export const LOCALSTORAGE_KEYS = {
  theme: "gallo-theme",
  mode: "gallo-mode",
} as const;

export interface IThemeMeta {
  name: ThemeName;
  brand: string;
  codename: string;
  uiLabel: string;
  description: string;
  accentHex: string;
}

export const THEMES: Record<ThemeName, IThemeMeta> = {
  diesel: {
    name: "diesel",
    brand: "GALLO Diesel",
    codename: "Black Gold",
    uiLabel: "GALLO Diesel · Black Gold",
    description: "Tema padrão — preto técnico + dourado óleo diesel",
    accentHex: "#C9A24A",
  },
  parts: {
    name: "parts",
    brand: "GALLO Parts",
    codename: "Forest",
    uiLabel: "GALLO Parts · Forest",
    description: "Submarca de peças — verde RS",
    accentHex: "#1E7A3C",
  },
  service: {
    name: "service",
    brand: "GALLO Service",
    codename: "Crimson",
    uiLabel: "GALLO Service · Crimson",
    description: "Submarca de serviço — vermelho RS",
    accentHex: "#C8262C",
  },
  industrial: {
    name: "industrial",
    brand: "GALLO Industrial",
    codename: "Amber",
    uiLabel: "GALLO Industrial · Amber",
    description: "Submarca industrial — amarelo RS",
    accentHex: "#C79C2C",
  },
};
