// Copies the root CHANGELOG.md into public/ so it's served as a static asset.
// Invoked by `predev` and `prebuild` hooks in package.json.
// Cross-platform (Node fs APIs, no shell-specific commands).
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const src = resolve(root, "CHANGELOG.md");
const dest = resolve(root, "public", "CHANGELOG.md");

if (!existsSync(src)) {
  console.error(`[copy-changelog] source not found: ${src}`);
  process.exit(1);
}

await mkdir(dirname(dest), { recursive: true });
await copyFile(src, dest);
console.log(`[copy-changelog] copied → ${dest}`);
