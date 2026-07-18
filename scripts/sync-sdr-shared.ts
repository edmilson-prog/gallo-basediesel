/**
 * Mirrors the pure SDR escalation engine into the Edge Functions tree, so
 * sdr-respond (Deno) can reuse chooseHumanSeller/buildContextSummary/
 * escalateToHuman/render* without duplicating them by hand.
 *
 *   src/features/sdr-escalation/engine/**     →  supabase/functions/_shared/sdr-escalation/engine/**
 *   src/features/sdr-escalation/templates/**  →  supabase/functions/_shared/sdr-escalation/templates/**
 *
 * Source files only use `import type` from "@/shared/types" (erased at
 * transpile time — harmless for Deno, which never resolves type-only
 * imports at runtime) plus relative imports between themselves. The only
 * transform applied is appending `.ts` to relative import specifiers
 * (same transform as scripts/sync-whatsapp-shared.ts). Excluded: tests.
 *
 * Run after ANY change under src/features/sdr-escalation/{engine,templates}/:
 *   bun run scripts/sync-sdr-shared.ts
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = join(import.meta.dirname ?? ".", "..");
const SUBDIRS = ["engine", "templates"];
const SRC = join(ROOT, "src", "features", "sdr-escalation");
const DEST = join(ROOT, "supabase", "functions", "_shared", "sdr-escalation");

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
    out.push(full);
  }
  return out;
}

function addTsExtensions(source: string): string {
  return source.replace(
    /(from\s+")(\.{1,2}\/[^"]+)(")/g,
    (whole, prefix: string, specifier: string, suffix: string) =>
      specifier.endsWith(".ts") ? whole : `${prefix}${specifier}.ts${suffix}`,
  );
}

rmSync(DEST, { recursive: true, force: true });
let count = 0;
for (const subdir of SUBDIRS) {
  const srcDir = join(SRC, subdir);
  for (const file of collect(srcDir)) {
    const rel = join(subdir, relative(srcDir, file));
    const target = join(DEST, rel);
    mkdirSync(dirname(target), { recursive: true });
    const banner = `// AUTO-GENERATED MIRROR — DO NOT EDIT.\n// Source: src/features/sdr-escalation/${rel.replace(/\\/g, "/")} (sync: bun run scripts/sync-sdr-shared.ts)\n\n`;
    writeFileSync(target, banner + addTsExtensions(readFileSync(file, "utf8")));
    count++;
  }
}
console.log(`synced ${count} files → supabase/functions/_shared/sdr-escalation/`);
