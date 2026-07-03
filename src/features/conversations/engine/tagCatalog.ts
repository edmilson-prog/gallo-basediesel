import type { IConversationTag } from "@/shared/types";

/**
 * Curated identity palette for conversation tags. Follows the instanceAccent
 * rule: color encodes identity, never state — hues NEVER overlap the severity
 * tokens (pure success green / warning yellow / critical red) nor WhatsApp
 * green. Persist the `id`, resolve hex at render time.
 */
export interface ITagPaletteEntry {
  id: string;
  /** Human name shown in the swatch grid (pt-BR). */
  label: string;
  hex: string;
}

export const TAG_PALETTE: ITagPaletteEntry[] = [
  { id: "teal", label: "Verde-água", hex: "#2dd4bf" },
  { id: "violet", label: "Violeta", hex: "#a78bfa" },
  { id: "pink", label: "Rosa", hex: "#f472b6" },
  { id: "indigo", label: "Índigo", hex: "#818cf8" },
  { id: "orange", label: "Laranja", hex: "#fb923c" },
  { id: "sky", label: "Azul-céu", hex: "#38bdf8" },
  { id: "blue", label: "Azul", hex: "#3b82f6" },
  { id: "cyan", label: "Ciano", hex: "#22d3ee" },
  { id: "fuchsia", label: "Fúcsia", hex: "#e879f9" },
  { id: "slate", label: "Cinza-azulado", hex: "#94a3b8" },
];

/** Unknown color ids resolve to the last (neutral slate) entry. */
export function tagColorHex(colorId: string): string {
  const found = TAG_PALETTE.find((p) => p.id === colorId);
  return (found ?? TAG_PALETTE[TAG_PALETTE.length - 1]!).hex;
}

export const TAG_LABEL_MAX = 24;

/**
 * Canonical form of a conversation-tag label: trimmed, internal whitespace
 * collapsed, and UPPERCASED (pt-BR). Conversation tags are always stored and
 * displayed uppercase — normalization here is the single source of truth for
 * every create/rename path, so the DB value and every rendered chip agree.
 */
export function normalizeTagLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
}

export type TagLabelValidation =
  | { ok: true; label: string }
  | { ok: false; error: "empty" | "too_long" | "duplicate" };

export function validateTagLabel(raw: string, existingLabels: string[]): TagLabelValidation {
  const label = normalizeTagLabel(raw);
  if (label.length === 0) return { ok: false, error: "empty" };
  if (label.length > TAG_LABEL_MAX) return { ok: false, error: "too_long" };
  const key = label.toLocaleLowerCase("pt-BR");
  const clash = existingLabels.some((l) => l.toLocaleLowerCase("pt-BR").trim() === key);
  if (clash) return { ok: false, error: "duplicate" };
  return { ok: true, label };
}

/**
 * Resolves the id array stored on a conversation to catalog entries, keeping
 * the array order and silently dropping orphans (deleted catalog rows).
 * Archived tags ARE returned — history keeps rendering them.
 */
export function resolveConversationTags(
  ids: string[],
  catalog: IConversationTag[],
): IConversationTag[] {
  const byId = new Map(catalog.map((t) => [t.id, t]));
  const out: IConversationTag[] = [];
  for (const id of ids) {
    const tag = byId.get(id);
    if (tag) out.push(tag);
  }
  return out;
}

/** Caps chip rows (header: 3, inbox row: 2) with a "+N" overflow. */
export function splitVisibleTags<T>(
  items: T[],
  max: number,
): { visible: T[]; overflowCount: number; overflow: T[] } {
  if (items.length <= max) return { visible: items, overflowCount: 0, overflow: [] };
  return { visible: items.slice(0, max), overflowCount: items.length - max, overflow: items.slice(max) };
}
