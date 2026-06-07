/**
 * Snippet placeholder resolution (PRD-027 RF-012, D-6).
 *
 * Resolves `{{nome}}/{{peca}}/{{prazo}}` (and any extra key) from a flat
 * context. Unresolved placeholders are listed in `gaps` and rendered as
 * `[gap]` pills so the UI can paint amber, editable fields. `hasUnresolved`
 * is the double send-lock: it regex-rejects ANY remaining `{{...}}` or `[...]`
 * marker so a raw placeholder can never reach the wire.
 */

export interface IPlaceholderContext {
  nome?: string;
  peca?: string;
  prazo?: string;
  [k: string]: string | undefined;
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
// Any leftover {{...}} OR a [pill] (non-empty) signals an unresolved gap.
const UNRESOLVED_RE = /\{\{\s*[a-zA-Z0-9_]+\s*\}\}|\[[a-zA-Z0-9_]+\]/;

export function resolvePlaceholders(
  text: string,
  ctx: IPlaceholderContext,
): { resolved: string; gaps: string[] } {
  const gaps: string[] = [];
  const resolved = text.replace(PLACEHOLDER_RE, (_match, key: string) => {
    const value = ctx[key];
    if (value !== undefined && value !== "") return value;
    if (!gaps.includes(key)) gaps.push(key);
    return `[${key}]`;
  });
  return { resolved, gaps };
}

export function hasUnresolved(text: string): boolean {
  return UNRESOLVED_RE.test(text);
}
