import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The contract that makes /atendimento installable.
 *
 * None of it is reachable from a unit test of a component: the decision is made
 * by the browser, at load, against static files. It shipped broken once —
 * `index.html` declared the seller's manifest (scope /pwa) while the atendimento
 * app swapped it only after React mounted — and `bun run build` + `bun run test`
 * both passed. These assertions are what would have caught it.
 */

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const read = (relative: string) => readFileSync(repoRoot + relative, "utf8");

const html = read("index.html");

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

describe.each(Object.entries(manifests))("manifest %s", (href, manifest) => {
  it("names the app", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
  });

  it("asks for a standalone window", () => {
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
    // A manifest whose icons are all `maskable` fails the install check: the
    // browser needs at least one it can draw unmodified.
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

describe("index.html", () => {
  const idsUsedByScript = ["app-manifest", "app-theme-color", "app-ios-title", "app-apple-icon"];
  const scriptStart = html.indexOf("Pick the manifest for the app being opened");

  it("carries the head script that picks the manifest", () => {
    expect(scriptStart).toBeGreaterThan(-1);
  });

  it.each(idsUsedByScript)("declares #%s above the script that reads it", (id) => {
    const tagAt = html.indexOf(`id="${id}"`);
    expect(tagAt).toBeGreaterThan(-1);
    // `getElementById` in the head only finds what the parser has already seen.
    expect(tagAt).toBeLessThan(scriptStart);
  });

  it("runs the script at parse time, not deferred", () => {
    // `defer` or `type="module"` would push it past the browser's decision.
    const tag = html.slice(html.lastIndexOf("<script", scriptStart), scriptStart);
    expect(tag).not.toMatch(/\bdefer\b/);
    expect(tag).not.toMatch(/type\s*=\s*"module"/);
  });

  it("switches to the atendimento manifest for that path only", () => {
    const script = html.slice(scriptStart, html.indexOf("</script>", scriptStart));
    expect(script).toContain('"/atendimento"');
    expect(script).toContain('"/atendimento.webmanifest"');
  });

  it("swaps the iOS icon, which ignores the manifest and reads this link", () => {
    const script = html.slice(scriptStart, html.indexOf("</script>", scriptStart));
    expect(script).toContain("/atendimento-apple-touch-icon.png");
    expect(() => read("public/atendimento-apple-touch-icon.png")).not.toThrow();
  });

  it("applies the atendimento theme colour declared in its manifest", () => {
    const script = html.slice(scriptStart, html.indexOf("</script>", scriptStart));
    expect(script).toContain(manifests["/atendimento.webmanifest"]?.theme_color);
  });

  it("defaults to the seller app, which owns the static tags", () => {
    const head = html.slice(0, scriptStart);
    expect(head).toContain('href="/manifest.webmanifest"');
    expect(head).toContain(`content="${manifests["/manifest.webmanifest"]?.theme_color}"`);
  });
});

describe("usePwaManifest", () => {
  const source = read("src/features/pwa-atendimento/hooks/usePwaManifest.ts");
  const scriptStart = html.indexOf("Pick the manifest for the app being opened");
  const script = html.slice(scriptStart, html.indexOf("</script>", scriptStart));

  /** Reads one field out of an identity object literal in the hook. */
  const field = (constant: string, key: string) => {
    const block = new RegExp(`${constant}[^=]*=\\s*\\{([^}]*)\\}`).exec(source)?.[1] ?? "";
    return new RegExp(`${key}:\\s*"([^"]+)"`).exec(block)?.[1] ?? null;
  };

  // The asymmetry this locks: the head script swapped four tags and the hook
  // restored two, so leaving the app left the seller's page wearing the
  // atendimento icon — and iOS reads that link, not the manifest icons.
  it.each(["app-manifest", "app-theme-color", "app-ios-title", "app-apple-icon"])(
    "handles #%s, the same tag the head script swaps",
    (id) => {
      expect(script).toContain(id);
      expect(source).toContain(id);
    },
  );

  it("applies exactly the atendimento values the head script applies", () => {
    for (const key of ["manifest", "themeColor", "iosTitle", "appleIcon"]) {
      const value = field("ATENDIMENTO", key);
      expect(value).toBeTruthy();
      expect(script).toContain(value);
    }
  });

  it("keeps the theme colour tied to the manifest that declares it", () => {
    expect(field("ATENDIMENTO", "themeColor")).toBe(
      manifests["/atendimento.webmanifest"]?.theme_color,
    );
  });

  it("restores exactly what index.html ships as the seller default", () => {
    // Restoring "whatever was there on mount" reads the atendimento values on a
    // direct load — and leaves the rest of the CRM wearing them.
    const head = html.slice(0, scriptStart);
    expect(head).toContain(`href="${field("SELLER", "manifest")}"`);
    expect(head).toContain(`content="${field("SELLER", "themeColor")}"`);
    expect(head).toContain(`content="${field("SELLER", "iosTitle")}"`);
    expect(head).toContain(`href="${field("SELLER", "appleIcon")}"`);
  });

  it("points the seller default at an icon that exists", () => {
    expect(() => read("public" + field("SELLER", "appleIcon"))).not.toThrow();
  });
});
