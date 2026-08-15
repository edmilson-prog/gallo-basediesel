import { useEffect } from "react";

/**
 * The head tags that say *which app this document is*.
 *
 * Two installable apps share one `index.html`, so these four tags are the only
 * thing telling them apart. They must move together: the inline script in
 * `index.html` swaps all four on a direct load, and this hook has to cover the
 * same four on a client-side navigation. Handling a subset is what put the
 * atendimento icon on the seller's "Add to Home Screen" sheet — iOS reads the
 * `apple-touch-icon` link and ignores the manifest icons, so an un-restored
 * icon outlives the manifest that was restored beside it.
 *
 * The ids match `index.html`; `installContract.test.ts` fails if the two ever
 * disagree about which tags exist or what they should hold.
 */
interface IAppIdentity {
  manifest: string;
  themeColor: string;
  iosTitle: string;
  appleIcon: string;
}

const ATENDIMENTO: IAppIdentity = {
  manifest: "/atendimento.webmanifest",
  themeColor: "#141011",
  iosTitle: "GALLO Atendimento",
  appleIcon: "/atendimento-apple-touch-icon.png",
};

/**
 * The static defaults written in `index.html` — the external seller PWA's.
 *
 * Restored by name rather than captured on mount: since the inline head script
 * started choosing by pathname, a direct load of /atendimento already finds the
 * atendimento values in the document, so "put back what was there" would have
 * put them back and left the rest of the CRM wearing them.
 */
const SELLER: IAppIdentity = {
  manifest: "/manifest.webmanifest",
  themeColor: "#16a34a",
  iosTitle: "GALLO Vendedor",
  appleIcon: "/apple-touch-icon.png",
};

/** Prefers the id from `index.html`, falls back to the tag itself. */
function tag(id: string, selector: string): Element | null {
  return document.getElementById(id) ?? document.querySelector(selector);
}

function apply(identity: IAppIdentity): void {
  tag("app-manifest", 'link[rel="manifest"]')?.setAttribute("href", identity.manifest);
  tag("app-theme-color", 'meta[name="theme-color"]')?.setAttribute("content", identity.themeColor);
  tag("app-ios-title", 'meta[name="apple-mobile-web-app-title"]')?.setAttribute(
    "content",
    identity.iosTitle,
  );
  tag("app-apple-icon", 'link[rel="apple-touch-icon"]')?.setAttribute("href", identity.appleIcon);
}

/**
 * Keep the document identified as the atendimento app while it is mounted.
 *
 * This hook covers only the SPA case — arriving through a client-side
 * navigation, where no document load happens. **A direct load is handled by the
 * inline script in `index.html`**, and it has to be: the browser judges
 * installability at load, against the manifest linked at that moment. Swapping
 * here alone was the bug behind "the install banner never appears".
 */
export function usePwaManifest(): void {
  useEffect(() => {
    apply(ATENDIMENTO);
    return () => apply(SELLER);
  }, []);
}
