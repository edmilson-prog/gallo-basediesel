import { createContext, useContext } from "react";
import type { ThemeName, ThemeMode, ResolvedMode } from "@/config/themes";

export interface IThemeContext {
  theme: ThemeName;
  mode: ThemeMode;
  resolvedMode: ResolvedMode;
  setTheme: (theme: ThemeName) => void;
  setMode: (mode: ThemeMode) => void;
}

export const ThemeContext = createContext<IThemeContext | null>(null);

export function useTheme(): IThemeContext {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}
