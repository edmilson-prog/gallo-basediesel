import { useEffect } from "react";

/**
 * Forces the `data-theme="parts"` attribute on `<html>` while the storefront
 * is mounted. Reverts to the user's previously-active theme on unmount so the
 * `/app` sub-app keeps its own identity (default `diesel`).
 *
 * The mode (light/dark) is preserved — only the theme dimension is overridden.
 */
export function useStorefrontTheme(): void {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const html = document.documentElement;
    const previous = html.getAttribute("data-theme");
    html.setAttribute("data-theme", "parts");
    return () => {
      if (previous) html.setAttribute("data-theme", previous);
      else html.removeAttribute("data-theme");
    };
  }, []);
}
