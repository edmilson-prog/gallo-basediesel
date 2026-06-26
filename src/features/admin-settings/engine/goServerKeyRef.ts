/**
 * Generates a unique, env-style `apiKeyRef` for an Evolution Go server. The ref
 * names the server's single Vault secret (`{ref}` holds the global key), so it
 * must match `^[A-Z][A-Z0-9_]{2,64}$`. Pure: the random suffix is injected by
 * the caller so the result is testable.
 */

function slugUpper(name: string): string {
  const slug = name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return slug || "SERVIDOR";
}

export function generateGoServerKeyRef(
  name: string,
  existingRefs: string[],
  suffix: string,
): string {
  const suf = suffix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16) || "X";
  const base = `WA_GO_SERVER_${slugUpper(name)}_${suf}`;
  let candidate = base;
  let n = 1;
  while (existingRefs.includes(candidate)) {
    candidate = `${base}_${n++}`;
  }
  return candidate;
}
