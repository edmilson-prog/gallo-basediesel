/**
 * Mirrors the pure engines the offline-rescue tick needs into the Edge
 * Functions tree, so conversation-rescue-tick (Deno) can reuse them without
 * duplicating them by hand. Same discipline as scripts/sync-sdr-shared.ts.
 *
 *   src/features/conversation-rescue/engine/**  →  supabase/functions/_shared/conversation-rescue/engine/**
 *   src/features/access/engine/workSchedule.ts  →  supabase/functions/_shared/access/workSchedule.ts
 *   src/features/admin-settings/utils/accessRecipients.ts  →  supabase/functions/_shared/access/accessRecipients.ts
 *
 * Source files only use `import type` from "@/shared/types" (erased at
 * transpile time — harmless for Deno) plus relative imports between
 * themselves. Excluded: tests.
 *
 * Run after ANY change to those source files:
 *   bun run scripts/sync-conversation-rescue-shared.ts
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = join(import.meta.dirname ?? ".", "..");

function addTsExtensions(source: string): string {
  return source.replace(
    /(from\s+")(\.{1,2}\/[^"]+)(")/g,
    (whole, prefix: string, specifier: string, suffix: string) =>
      specifier.endsWith(".ts") ? whole : `${prefix}${specifier}.ts${suffix}`,
  );
}

function banner(sourceRelPath: string): string {
  return `// AUTO-GENERATED MIRROR — DO NOT EDIT.\n// Source: ${sourceRelPath} (sync: bun run scripts/sync-conversation-rescue-shared.ts)\n\n`;
}

function writeMirrored(srcAbs: string, destAbs: string, sourceRelPath: string): void {
  mkdirSync(dirname(destAbs), { recursive: true });
  writeFileSync(destAbs, banner(sourceRelPath) + addTsExtensions(readFileSync(srcAbs, "utf8")));
}

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
      continue;
    }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
    out.push(full);
  }
  return out;
}

let count = 0;

// 1) whole engine directory
const ENGINE_SRC = join(ROOT, "src", "features", "conversation-rescue", "engine");
const ENGINE_DEST = join(ROOT, "supabase", "functions", "_shared", "conversation-rescue", "engine");
rmSync(ENGINE_DEST, { recursive: true, force: true });
for (const file of collectTsFiles(ENGINE_SRC)) {
  const rel = relative(ENGINE_SRC, file);
  const dest = join(ENGINE_DEST, rel);
  writeMirrored(file, dest, `src/features/conversation-rescue/engine/${rel.replace(/\\/g, "/")}`);
  count++;
}

// 2) single-file mirrors
const SINGLE_FILES: Array<[string, string]> = [
  [
    join(ROOT, "src", "features", "access", "engine", "workSchedule.ts"),
    join(ROOT, "supabase", "functions", "_shared", "access", "workSchedule.ts"),
  ],
  [
    join(ROOT, "src", "features", "admin-settings", "utils", "accessRecipients.ts"),
    join(ROOT, "supabase", "functions", "_shared", "access", "accessRecipients.ts"),
  ],
];
for (const [srcAbs, destAbs] of SINGLE_FILES) {
  const rel = relative(ROOT, srcAbs).replace(/\\/g, "/");
  writeMirrored(srcAbs, destAbs, rel);
  count++;
}

console.log(`synced ${count} files → supabase/functions/_shared/{conversation-rescue,access}/`);
