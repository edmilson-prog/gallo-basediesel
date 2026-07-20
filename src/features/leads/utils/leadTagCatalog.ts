import type { IConversationTag } from "@/shared/types";

/**
 * Lead tags reuse the store's curated conversation-tag catalog as their
 * vocabulary. Tags are stored on the lead as label strings (non-destructive:
 * legacy labels survive, and lead→customer conversion keeps copying labels);
 * these helpers resolve a stored label to its catalog entry for colouring and
 * toggle selections case-insensitively (pt-BR).
 */

function key(label: string): string {
  return label.trim().toLocaleLowerCase("pt-BR");
}

/** Case-insensitive (pt-BR) match of a lead tag label to a catalog entry. */
export function matchCatalogTag(
  label: string,
  catalog: IConversationTag[],
): IConversationTag | undefined {
  const k = key(label);
  if (!k) return undefined;
  return catalog.find((t) => key(t.label) === k);
}

/** True when `label` is already selected (case-insensitive). */
export function hasTag(tags: string[], label: string): boolean {
  const k = key(label);
  return tags.some((t) => key(t) === k);
}

/** Removes `label` from `tags` (case-insensitive). */
export function removeTag(tags: string[], label: string): string[] {
  const k = key(label);
  return tags.filter((t) => key(t) !== k);
}

/** Toggles `label`: removes if present, else appends the catalog's exact label. */
export function toggleTag(tags: string[], label: string): string[] {
  return hasTag(tags, label) ? removeTag(tags, label) : [...tags, label];
}
