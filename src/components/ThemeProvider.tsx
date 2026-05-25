import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_MODE,
  DEFAULT_THEME,
  LOCALSTORAGE_KEYS,
  THEME_NAMES,
  type ResolvedMode,
  type ThemeMode,
  type ThemeName,
} from "@/config/themes";
import { ThemeContext } from "@/hooks/useTheme";

function safeGet(key: string): string | null {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    if (typeof window !== "undefined") localStorage.setItem(key, value);
  } catch {
    /* private mode — ignore */
  }
}

function readInitialTheme(): ThemeName {
  const raw = safeGet(LOCALSTORAGE_KEYS.theme);
  if (raw && (THEME_NAMES as string[]).includes(raw)) return raw as ThemeName;
  return DEFAULT_THEME;
}
function readInitialMode(): ThemeMode {
  const raw = safeGet(LOCALSTORAGE_KEYS.mode);
  if (raw === "light" || raw === "dark" || raw === "auto") return raw;
  return DEFAULT_MODE;
}
function resolveMode(mode: ThemeMode): ResolvedMode {
  if (mode !== "auto") return mode;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => readInitialTheme());
  const [mode, setModeState] = useState<ThemeMode>(() => readInitialMode());
  const [resolvedMode, setResolvedMode] = useState<ResolvedMode>(() =>
    resolveMode(readInitialMode()),
  );

  // Aplica atributos no <html>
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-theme", theme);
    html.setAttribute("data-mode", resolvedMode);
    html.classList.toggle("dark", resolvedMode === "dark");
  }, [theme, resolvedMode]);

  // Observa mudança do SO quando em modo "auto"
  useEffect(() => {
    if (mode !== "auto") {
      setResolvedMode(mode);
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setResolvedMode(mq.matches ? "dark" : "light");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [mode]);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    safeSet(LOCALSTORAGE_KEYS.theme, next);
  }, []);
  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    safeSet(LOCALSTORAGE_KEYS.mode, next);
  }, []);

  const value = useMemo(
    () => ({ theme, mode, resolvedMode, setTheme, setMode }),
    [theme, mode, resolvedMode, setTheme, setMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
