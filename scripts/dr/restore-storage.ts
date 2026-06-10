/**
 * PRD-109 — Restore Storage objects from a local backup tree.
 *
 * Mirror of scripts/dr/backup-storage.ts: walks a local directory tree shaped
 * as <srcDir>/<bucket>/<object path> and uploads every file back to the
 * corresponding bucket (upsert — safe to re-run).
 *
 * Usage:
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service role key> \
 *   bun run scripts/dr/restore-storage.ts [srcDir]
 *
 * Buckets must already exist (they are created by the storage_106 migration
 * replay). Runbook: docs/infra/runbooks/restore-storage.md
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY environment variables.",
  );
  process.exit(1);
}

const srcDir = process.argv[2] ?? "./storage-backup";
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

/** Recursively collects every file path under a directory. */
async function walk(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) {
      files.push(...(await walk(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

let totalFiles = 0;
let failures = 0;

const buckets = await readdir(srcDir);
for (const bucket of buckets) {
  const bucketDir = join(srcDir, bucket);
  if (!(await stat(bucketDir)).isDirectory()) continue;
  const files = await walk(bucketDir);
  console.log(`Restoring ${files.length} object(s) into bucket "${bucket}"...`);
  for (const file of files) {
    // Object paths always use forward slashes, regardless of host OS.
    const objectPath = relative(bucketDir, file).split("\\").join("/");
    try {
      const body = await readFile(file);
      const { error } = await supabase.storage
        .from(bucket)
        .upload(objectPath, body, { upsert: true });
      if (error) throw new Error(error.message);
      totalFiles += 1;
    } catch (err) {
      failures += 1;
      console.error(
        `  FAILED ${bucket}/${objectPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

console.log(`Done. ${totalFiles} file(s) restored, ${failures} failure(s).`);
if (failures > 0) process.exit(1);
