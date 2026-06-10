/**
 * PRD-109 — Storage backup of critical buckets (RF-040).
 *
 * Downloads every object from the critical buckets (fiscal documents have a
 * legal retention obligation; whatsapp-media holds customer conversation
 * assets) into a local directory tree:
 *
 *   <outDir>/<bucket>/<object path>
 *
 * Usage (CI or local):
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service role key> \
 *   bun run scripts/dr/backup-storage.ts [outDir]
 *
 * The service role key is required because the buckets are private. It must
 * NEVER be exposed to the browser — in CI it lives in GitHub Secrets; locally
 * in `.env.local` (gitignored). Restore procedure:
 * docs/infra/runbooks/restore-storage.md
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const CRITICAL_BUCKETS = ["fiscal-documents", "whatsapp-media"];
const PAGE_SIZE = 100;

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY environment variables.",
  );
  process.exit(1);
}

const outDir = process.argv[2] ?? "./storage-backup";
// Ensure the output directory exists even when a bucket has zero objects,
// so the compression step downstream never fails on a missing directory.
await mkdir(outDir, { recursive: true });
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

/** Recursively lists every file path in a bucket (folders have null id). */
async function listAllFiles(bucket: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        // Folder (path prefix) — recurse into it.
        files.push(...(await listAllFiles(bucket, path)));
      } else {
        files.push(path);
      }
    }
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return files;
}

async function downloadFile(bucket: string, path: string): Promise<number> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`download ${bucket}/${path}: ${error?.message ?? "empty body"}`);
  }
  const target = join(outDir, bucket, path);
  await mkdir(dirname(target), { recursive: true });
  const bytes = new Uint8Array(await data.arrayBuffer());
  await writeFile(target, bytes);
  return bytes.byteLength;
}

let totalFiles = 0;
let totalBytes = 0;
let failures = 0;

for (const bucket of CRITICAL_BUCKETS) {
  console.log(`Backing up bucket "${bucket}"...`);
  const files = await listAllFiles(bucket);
  console.log(`  ${files.length} object(s) found.`);
  for (const path of files) {
    try {
      const size = await downloadFile(bucket, path);
      totalFiles += 1;
      totalBytes += size;
    } catch (err) {
      failures += 1;
      console.error(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

console.log(
  `Done. ${totalFiles} file(s), ${(totalBytes / 1024 / 1024).toFixed(2)} MiB, ${failures} failure(s).`,
);
if (failures > 0) process.exit(1);
