import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Regression guard for the vercel.json SPA rewrite (issue #430).
 *
 * The catch-all rewrite used to send EVERY unmatched path to /index.html, so a
 * missing static asset answered 200 text/html instead of 404 — the root cause
 * of the 09/08 production lockout and the 17/08 browser-cache poisoning (HTML
 * cached under a .js URL for 4h). The fix is a negative-lookahead exclusion of
 * every static prefix/file so a missing asset 404s for real.
 *
 * NOTE: this approximates Vercel's path-to-regexp matcher with a plain RegExp.
 * The `source` syntax used here (single group, alternation of literals, no
 * nested groups) is intentionally kept within the subset where both engines
 * agree — keep it that way when editing the rewrite.
 */

interface IVercelConfig {
  rewrites: Array<{ source: string; destination: string }>;
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
}

const vercelJsonUrl = new URL("../../../../vercel.json", import.meta.url);
const config = JSON.parse(readFileSync(fileURLToPath(vercelJsonUrl), "utf-8")) as IVercelConfig;

const catchAll = config.rewrites.find((r) => r.destination === "/index.html");
const catchAllRe = catchAll ? new RegExp(`^${catchAll.source}$`) : null;

/** Paths that MUST keep falling back to the SPA shell (deep links). */
const SPA_ROUTES = [
  "/",
  "/app/inicio",
  "/app/gestao/ranking/abc-123",
  "/app/configuracoes/papeis",
  "/auth/login",
  "/loja",
  "/loja/produto/turbina-volvo-fh",
  "/portal/pedidos",
  "/pwa/conversas",
  // dynamic params containing dots must still deep-link into the SPA
  "/app/clientes/12.345.678",
];

/** Static paths that MUST bypass the rewrite (missing file ⇒ real 404). */
const STATIC_PATHS = [
  "/assets/main-BuwNQQpI.js",
  "/assets/app.inicio-DRequvqc.js",
  "/assets/sub/dir/chunk-abc.css",
  "/version.json",
  "/CHANGELOG.md",
  "/sw.js",
  "/manifest.webmanifest",
  "/atendimento.webmanifest",
  "/favicon.ico",
  "/favicon.svg",
  "/favicon-32x32.png",
  "/apple-touch-icon.png",
  "/android-chrome-192x192.png",
  "/atendimento-icon-192.png",
  "/atendimento-icon-maskable-512.png",
  "/atendimento-badge-96.png",
  "/atendimento-apple-touch-icon.png",
  "/logos/qualquer.svg",
  "/social/og-image.png",
];

describe("vercel.json SPA rewrite (issue #430)", () => {
  it("keeps the /atendimento rewrites ahead of the SPA catch-all", () => {
    const destinations = config.rewrites.map((r) => r.destination);
    expect(destinations.indexOf("/atendimento.html")).toBeGreaterThanOrEqual(0);
    expect(destinations.lastIndexOf("/atendimento.html")).toBeLessThan(
      destinations.indexOf("/index.html"),
    );
  });

  it("still routes every SPA deep link to the shell", () => {
    expect(catchAllRe).not.toBeNull();
    for (const path of SPA_ROUTES) {
      expect(catchAllRe!.test(path), `${path} deveria cair no shell SPA`).toBe(true);
    }
  });

  it("lets missing static assets 404 instead of answering HTML", () => {
    expect(catchAllRe).not.toBeNull();
    for (const path of STATIC_PATHS) {
      expect(catchAllRe!.test(path), `${path} NÃO deveria ser reescrito para HTML`).toBe(false);
    }
  });

  it("keeps the no-store headers for the update-notification data files", () => {
    const sources = config.headers.map((h) => h.source);
    expect(sources).toContain("/version.json");
    expect(sources).toContain("/sw.js");
    for (const rule of config.headers) {
      if (["/version.json", "/sw.js"].includes(rule.source)) {
        const cc = rule.headers.find((h) => h.key === "Cache-Control");
        expect(cc?.value).toContain("no-store");
      }
    }
  });

  it("serves hashed /assets as immutable", () => {
    // Safe ONLY because Vercel attaches this rule to 200s and NOT to 404s on
    // the same path — verified on a preview deployment before shipping (see the
    // evidence table in the PR that introduced this rule). If that ever changes,
    // a 404 caught in a deploy's alias-swap window would be browser-cached for a
    // year, recreating the 17/08 lockout in a far worse form.
    const rule = config.headers.find((h) => h.source === "/assets/(.*)");
    expect(rule, "faltou a regra de cache para /assets/(.*)").toBeDefined();
    const cc = rule!.headers.find((h) => h.key === "Cache-Control")?.value ?? "";
    expect(cc).toContain("immutable");
    expect(cc).toContain("max-age=31536000");
    expect(cc).not.toContain("no-store");
  });

  it("never marks a non-hashed path as immutable", () => {
    // index.html, sw.js, version.json and the webmanifests keep their names
    // across deploys — an immutable rule on any of them would pin a stale shell.
    const MUTABLE = ["/version.json", "/sw.js", "/(.*).webmanifest"];
    for (const rule of config.headers) {
      if (!MUTABLE.includes(rule.source)) continue;
      const cc = rule.headers.find((h) => h.key === "Cache-Control")?.value ?? "";
      expect(cc, `${rule.source} não pode ser immutable`).not.toContain("immutable");
    }
  });
});
