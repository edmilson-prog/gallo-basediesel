/**
 * Mirrors the pure business-hours calculation into the Edge Functions tree,
 * so sdr-backstop-tick (Deno) can reuse isWithinBusinessHours without
 * duplicating it by hand.
 *
 *   src/features/distribution/engine/businessHours.ts
 *     → supabase/functions/_shared/distribution/engine/businessHours.ts
 *
 * Single-file mirror (not a whole-directory copy like sync-sdr-shared.ts) —
 * the rest of src/features/distribution/engine/ (seller-selection cascade)
 * is not needed server-side and is deliberately not dragged along.
 *
 * Run after ANY change to src/features/distribution/engine/businessHours.ts:
 *   bun run scripts/sync-business-hours-shared.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dirname ?? ".", "..");
const SRC = join(ROOT, "src", "features", "distribution", "engine", "businessHours.ts");
const DEST = join(
  ROOT,
  "supabase",
  "functions",
  "_shared",
  "distribution",
  "engine",
  "businessHours.ts",
);

const banner =
  "// AUTO-GENERATED MIRROR — DO NOT EDIT.\n" +
  "// Source: src/features/distribution/engine/businessHours.ts (sync: bun run scripts/sync-business-hours-shared.ts)\n\n";

mkdirSync(dirname(DEST), { recursive: true });
writeFileSync(DEST, banner + readFileSync(SRC, "utf8"));
console.log("synced 1 file → supabase/functions/_shared/distribution/engine/businessHours.ts");
