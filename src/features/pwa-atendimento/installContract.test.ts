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

describe("the two apps on this origin", () => {
  it("do not overlap, so the browser can tell them apart", () => {
    const [a = "", b = ""] = Object.values(manifests).map((manifest) => manifest.scope ?? "");
    expect(a).not.toBe(b);
    expect(a.startsWith(b) || b.startsWith(a)).toBe(false);
  });
});

describe("index.html", () => {
  const idsUsedByScript = ["app-manifest", "app-theme-color", "app-ios-title"];
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
  const constant = (name: string) =>
    new RegExp(`${name}\\s*=\\s*"([^"]+)"`).exec(source)?.[1] ?? null;

  it("restores the values index.html actually ships", () => {
    // Restoring "whatever was there on mount" reads the atendimento manifest on
    // a direct load — and leaves the rest of the CRM declaring it.
    expect(constant("DEFAULT_MANIFEST_HREF")).toBe("/manifest.webmanifest");
    expect(constant("DEFAULT_THEME_COLOR")).toBe(manifests["/manifest.webmanifest"]?.theme_color);
  });

  it("applies the atendimento manifest while the app is mounted", () => {
    expect(constant("PWA_MANIFEST_HREF")).toBe("/atendimento.webmanifest");
    expect(constant("PWA_THEME_COLOR")).toBe(manifests["/atendimento.webmanifest"]?.theme_color);
  });
});
