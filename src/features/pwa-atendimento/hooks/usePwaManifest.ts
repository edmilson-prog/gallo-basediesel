import { useEffect } from "react";

const PWA_MANIFEST_HREF = "/atendimento.webmanifest";
/** Matches `background_color`/`theme_color` in atendimento.webmanifest. */
const PWA_THEME_COLOR = "#141011";

function findOrCreateMeta(name: string): HTMLMetaElement {
  const existing = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (existing) return existing;
  const created = document.createElement("meta");
  created.name = name;
  document.head.appendChild(created);
  return created;
}

/**
 * Point the document at the atendimento manifest while this app is mounted.
 *
 * The SPA ships a single `index.html`, and its manifest belongs to the external
 * seller PWA (`scope: /pwa`). A second installable app on the same origin needs
 * its own manifest with a non-overlapping scope, so the route swaps the `href`
 * on entry and restores it on exit — otherwise "add to home screen" from
 * /atendimento would install the seller app instead.
 */
export function usePwaManifest(): void {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const themeMeta = findOrCreateMeta("theme-color");

    const previousHref = link?.getAttribute("href") ?? null;
    const previousTheme = themeMeta.getAttribute("content");

    link?.setAttribute("href", PWA_MANIFEST_HREF);
    themeMeta.setAttribute("content", PWA_THEME_COLOR);

    return () => {
      if (link && previousHref !== null) link.setAttribute("href", previousHref);
      if (previousTheme !== null) themeMeta.setAttribute("content", previousTheme);
      else themeMeta.remove();
    };
  }, []);
}
