/**
 * Mirrors the runtime-agnostic WhatsApp layer into the Edge Functions tree
 * (PRD-114 — layout decision from PRD-112).
 *
 *   src/providers/whatsapp/**  →  supabase/functions/_shared/whatsapp/**
 *
 * The source files use only Web APIs and relative imports, so the ONLY
 * transform applied is appending the `.ts` extension to relative import
 * specifiers (Deno requires explicit extensions). Everything else is
 * byte-identical. Excluded: tests, the app-side factory/index barrels.
 *
 * Run after ANY change under src/providers/whatsapp/:
 *   bun run scripts/sync-whatsapp-shared.ts
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const SRC = join(import.meta.dirname ?? ".", "..", "src", "providers", "whatsapp");
const DEST = join(import.meta.dirname ?? ".", "..", "supabase", "functions", "_shared", "whatsapp");

const EXCLUDED = new Set(["factory.ts", "index.ts"]);

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collect(full));
      continue;
    }
    if (!entry.name.endsWith(".ts")) continue;
    if (entry.name.endsWith(".test.ts")) continue;
    if (EXCLUDED.has(relative(SRC, full).replace(/\\/g, "/"))) continue;
    out.push(full);
  }
  return out;
}

function addTsExtensions(source: string): string {
  // from "./x" | from "../x" → from "./x.ts" (skip specifiers with extension)
  return source.replace(
    /(from\s+")(\.{1,2}\/[^"]+)(")/g,
    (whole, prefix: string, specifier: string, suffix: string) =>
      specifier.endsWith(".ts") ? whole : `${prefix}${specifier}.ts${suffix}`,
  );
}

rmSync(DEST, { recursive: true, force: true });
let count = 0;
for (const file of collect(SRC)) {
  const rel = relative(SRC, file);
  const target = join(DEST, rel);
  mkdirSync(dirname(target), { recursive: true });
  const banner = `// AUTO-GENERATED MIRROR — DO NOT EDIT.\n// Source: src/providers/whatsapp/${rel.replace(/\\/g, "/")} (sync: bun run scripts/sync-whatsapp-shared.ts)\n\n`;
  writeFileSync(target, banner + addTsExtensions(readFileSync(file, "utf8")));
  count++;
}
console.log(`synced ${count} files → supabase/functions/_shared/whatsapp/`);
