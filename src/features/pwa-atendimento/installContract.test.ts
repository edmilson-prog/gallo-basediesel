import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The contract that makes /atendimento installable.
 *
 * None of it is reachable from a unit test of a component: the decision is made
 * by the browser, at load, against static files. It shipped broken three times —
 * first the document declared the seller's manifest, then only half the head
 * tags were restored on navigation, and finally the swap-at-runtime approach
 * turned out to be unfixable on iOS: WebKit ties a web app's identity to the
 * manifest present when the document loads and never re-reads a mutated href.
 * Chrome does re-read it, which is why every desktop measurement passed while
 * the iPhone kept offering "GALLO Vendedor".
 *
 * So the two apps now own two documents, and these assertions guard the seam.
 */

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const read = (relative: string) => readFileSync(repoRoot + relative, "utf8");

const sellerHtml = read("index.html");
const atendimentoHtml = read("atendimento.html");

interface IManifest {
  name?: string;
  short_name?: string;
  start_url?: string;
  scope?: string;
  display?: string;
  theme_color?: string;
  icons?: { src?: string; sizes?: string; type?: string; purpose?: string }[];
}

const manifests: Record<string, IManifest> = {
  "/atendimento.webmanifest": JSON.parse(read("public/atendimento.webmanifest")) as IManifest,
  "/manifest.webmanifest": JSON.parse(read("public/manifest.webmanifest")) as IManifest,
};

describe.each(Object.entries(manifests))("manifest %s", (_href, manifest) => {
  it("names the app", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
  });

  it("asks for a standalone window", () => {
    // iOS only treats a Home Screen entry as a web app when the manifest says
    // standalone (or fullscreen) — otherwise it is a bookmark with no push.
    expect(manifest.display).toBe("standalone");
  });

  it("starts inside its own scope", () => {
    expect(manifest.scope).toBeTruthy();
    expect(manifest.start_url?.startsWith(manifest.scope ?? "")).toBe(true);
  });

  it("ships the two icon sizes the browser requires", () => {
    const sizes = (manifest.icons ?? []).map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("keeps an icon usable as-is", () => {
    const anyPurpose = (manifest.icons ?? []).filter((icon) =>
      (icon.purpose ?? "any").split(/\s+/).includes("any"),
    );
    expect(anyPurpose.length).toBeGreaterThan(0);
  });

  it("points at icon files that exist", () => {
    for (const icon of manifest.icons ?? []) {
      expect(() => read("public" + icon.src)).not.toThrow();
    }
  });
});

describe("atendimento.html", () => {
  it("declares its manifest statically, never by script", () => {
    // The whole point of the separate document: the correct manifest is in the
    // markup the parser sees, so WebKit latches the right identity.
    expect(atendimentoHtml).toContain('<link rel="manifest" href="/atendimento.webmanifest" />');
    expect(atendimentoHtml).not.toMatch(/getElementById\(["']app-manifest/);
  });

  it("carries the whole iOS identity, which the manifest alone does not cover", () => {
    // iOS reads apple-touch-icon and apple-mobile-web-app-title, not the
    // manifest icons — leaving them out puts the seller's face on the shortcut.
    expect(atendimentoHtml).toContain(
      '<link rel="apple-touch-icon" href="/atendimento-apple-touch-icon.png" />',
    );
    expect(atendimentoHtml).toContain(
      '<meta name="apple-mobile-web-app-title" content="GALLO Atendimento" />',
    );
    expect(atendimentoHtml).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(() => read("public/atendimento-apple-touch-icon.png")).not.toThrow();
  });

  it("uses the theme colour its own manifest declares", () => {
    const themeColor = manifests["/atendimento.webmanifest"]?.theme_color;
    expect(atendimentoHtml).toContain(`<meta name="theme-color" content="${themeColor}" />`);
  });

  it("boots the same bundle as the CRM", () => {
    expect(atendimentoHtml).toContain('src="/src/main.tsx"');
    expect(atendimentoHtml).toContain('id="root"');
  });

  it("never declares the seller app", () => {
    // Comments are stripped first: this file explains the history in prose, and
    // the check is about what the parser acts on, not about what it documents.
    const markup = atendimentoHtml.replace(/<!--[\s\S]*?-->/g, "");
    expect(markup).not.toContain("/manifest.webmanifest");
    expect(markup).not.toContain("GALLO Vendedor");
  });
});

describe("index.html", () => {
  it("belongs to the seller app alone", () => {
    expect(sellerHtml).toContain('href="/manifest.webmanifest"');
    expect(sellerHtml).toContain(`content="${manifests["/manifest.webmanifest"]?.theme_color}"`);
    expect(sellerHtml).toContain('content="GALLO Vendedor"');
  });

  it("no longer swaps the manifest at runtime", () => {
    // Removed deliberately: it worked on Chrome, never on iOS, and its presence
    // invited the next person to "just add one more tag to the swap".
    expect(sellerHtml).not.toContain("atendimento.webmanifest");
  });

  it("keeps the ids the SPA navigation path targets", () => {
    for (const id of ["app-manifest", "app-theme-color", "app-ios-title", "app-apple-icon"]) {
      expect(sellerHtml).toContain(`id="${id}"`);
    }
  });
});

describe("routing", () => {
  const vercel = JSON.parse(read("vercel.json")) as {
    rewrites: { source: string; destination: string }[];
  };
  const sources = vercel.rewrites.map((rule) => rule.source);

  it("sends /atendimento and everything under it to its own document", () => {
    for (const source of ["/atendimento", "/atendimento/(.*)"]) {
      const rule = vercel.rewrites.find((entry) => entry.source === source);
      expect(rule?.destination).toBe("/atendimento.html");
    }
  });

  it("keeps those rules above the catch-all, which would swallow them", () => {
    const catchAll = sources.indexOf("/(.*)");
    expect(catchAll).toBe(sources.length - 1);
    expect(sources.indexOf("/atendimento")).toBeLessThan(catchAll);
    expect(sources.indexOf("/atendimento/(.*)")).toBeLessThan(catchAll);
  });

  it("builds both documents, or the rewrite points at nothing", () => {
    const config = read("vite.config.ts");
    expect(config).toContain("./index.html");
    expect(config).toContain("./atendimento.html");
  });
});

describe("atendimento icons", () => {
  const manifest = manifests["/atendimento.webmanifest"] as IManifest;
  const purposes = (manifest.icons ?? []).map((icon) => icon.purpose);

  it("ships a dedicated maskable set, not one image wearing both hats", () => {
    // Android crops a maskable icon to a circle of 80% diameter. Artwork drawn
    // to fill the square loses its edges there, so "any maskable" on a single
    // file is always wrong for one of the two.
    expect(purposes).toContain("any");
    expect(purposes).toContain("maskable");
    expect(purposes).not.toContain("any maskable");
  });

  it("uses its own artwork, not the seller app's", () => {
    const sellerIcons = new Set(
      (manifests["/manifest.webmanifest"]?.icons ?? []).map((icon) => icon.src),
    );
    for (const icon of manifest.icons ?? []) {
      expect(sellerIcons.has(icon.src)).toBe(false);
    }
  });

  it("keeps the notification assets the service worker points at", () => {
    const sw = read("public/sw.js");
    for (const asset of ["/atendimento-icon-192.png", "/atendimento-badge-96.png"]) {
      expect(sw).toContain(asset);
      expect(() => read("public" + asset)).not.toThrow();
    }
  });
});

describe("the two apps on this origin", () => {
  it("do not overlap, so the browser can tell them apart", () => {
    const [a = "", b = ""] = Object.values(manifests).map((manifest) => manifest.scope ?? "");
    expect(a).not.toBe(b);
    expect(a.startsWith(b) || b.startsWith(a)).toBe(false);
  });
});

describe("usePwaManifest", () => {
  const source = read("src/features/pwa-atendimento/hooks/usePwaManifest.ts");

  /** Reads one field out of an identity object literal in the hook. */
  const field = (constant: string, key: string) => {
    const block = new RegExp(`${constant}[^=]*=\\s*\\{([^}]*)\\}`).exec(source)?.[1] ?? "";
    return new RegExp(`${key}:\\s*"([^"]+)"`).exec(block)?.[1] ?? null;
  };

  // Only reachable through a client-side navigation into /atendimento, which
  // stays inside index.html. Installability is already settled by then — this
  // is about the tab not lying about which app it is showing.
  it.each(["app-manifest", "app-theme-color", "app-ios-title", "app-apple-icon"])(
    "handles #%s, so the identity moves as one piece",
    (id) => {
      expect(source).toContain(id);
    },
  );

  it("applies the atendimento identity that atendimento.html ships", () => {
    for (const key of ["manifest", "themeColor", "iosTitle", "appleIcon"]) {
      const value = field("ATENDIMENTO", key);
      expect(value).toBeTruthy();
      expect(atendimentoHtml).toContain(value);
    }
  });

  it("restores exactly what index.html ships as the seller default", () => {
    expect(sellerHtml).toContain(`href="${field("SELLER", "manifest")}"`);
    expect(sellerHtml).toContain(`content="${field("SELLER", "themeColor")}"`);
    expect(sellerHtml).toContain(`content="${field("SELLER", "iosTitle")}"`);
    expect(sellerHtml).toContain(`href="${field("SELLER", "appleIcon")}"`);
  });

  it("points the seller default at an icon that exists", () => {
    expect(() => read("public" + field("SELLER", "appleIcon"))).not.toThrow();
  });
});
