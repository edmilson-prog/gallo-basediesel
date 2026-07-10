// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/waha/sessionName.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/** Pure, deterministic-modulo-randomness WAHA session name generator. */

function slugify(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function randomSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** `<slug(label)>-<6 hex chars>`, retried until it avoids `existingNames`. */
export function generateWahaSessionName(label: string, existingNames: string[]): string {
  const slug = slugify(label) || "waha";
  const taken = new Set(existingNames);
  let candidate = `${slug}-${randomSuffix()}`;
  while (taken.has(candidate)) {
    candidate = `${slug}-${randomSuffix()}`;
  }
  return candidate;
}
