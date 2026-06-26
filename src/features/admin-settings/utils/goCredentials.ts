/**
 * Generates a unique, env-style `credentialsRef` for a new Evolution Go account.
 * The ref names the account's Vault secrets (`{ref}_API_KEY`,
 * `{ref}_INSTANCE_TOKEN`), so it must match `^[A-Z][A-Z0-9_]{2,64}$`. Pure: the
 * random suffix is injected by the caller so the result is testable.
 */

function slugUpper(label: string): string {
  const slug = label
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return slug || "INSTANCIA";
}

export function generateGoCredentialsRef(
  label: string,
  existingRefs: string[],
  suffix: string,
): string {
  const suf = suffix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16) || "X";
  const base = `WA_EVO_GO_${slugUpper(label)}_${suf}`;
  let candidate = base;
  let n = 1;
  while (existingRefs.includes(candidate)) {
    candidate = `${base}_${n++}`;
  }
  return candidate;
}
