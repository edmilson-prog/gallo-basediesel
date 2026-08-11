import { useEffect } from "react";

const PWA_MANIFEST_HREF = "/atendimento.webmanifest";
/** Matches `background_color`/`theme_color` in atendimento.webmanifest. */
const PWA_THEME_COLOR = "#141011";

/**
 * The static defaults written in `index.html` — the external seller PWA's.
 *
 * They are restored by name rather than captured on mount: since the inline
 * head script started choosing the manifest by pathname, a direct load of
 * /atendimento already finds `/atendimento.webmanifest` in the document, so
 * "put back what was there" would have put back the atendimento manifest and
 * left the rest of the CRM declaring a manifest whose scope it is outside of.
 */
const DEFAULT_MANIFEST_HREF = "/manifest.webmanifest";
const DEFAULT_THEME_COLOR = "#16a34a";

function findOrCreateMeta(name: string): HTMLMetaElement {
  const existing = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (existing) return existing;
  const created = document.createElement("meta");
  created.name = name;
  document.head.appendChild(created);
  return created;
}

/**
 * Keep the document pointed at the atendimento manifest while this app is mounted.
 *
 * The SPA ships a single `index.html` whose default manifest belongs to the
 * external seller PWA (`scope: /pwa`), so a second installable app on the same
 * origin has to declare its own.
 *
 * This hook covers only the SPA case — arriving at /atendimento through a
 * client-side navigation, where no document load happens. **A direct load is
 * handled by the inline script in `index.html`**, and it has to be: the browser
 * evaluates installability at load, against the manifest linked at that moment.
 * Swapping here alone was the bug behind "the install banner never appears" —
 * by the time React mounts, the browser has already decided the page is not
 * installable.
 */
export function usePwaManifest(): void {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const themeMeta = findOrCreateMeta("theme-color");

    link?.setAttribute("href", PWA_MANIFEST_HREF);
    themeMeta.setAttribute("content", PWA_THEME_COLOR);

    return () => {
      link?.setAttribute("href", DEFAULT_MANIFEST_HREF);
      themeMeta.setAttribute("content", DEFAULT_THEME_COLOR);
    };
  }, []);
}
