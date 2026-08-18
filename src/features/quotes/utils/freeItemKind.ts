// src/features/quotes/utils/freeItemKind.ts

/**
 * Shortcuts for the usual off-catalog lines. `quote_items` has explicit columns
 * — there is no `kind` field to write to — so the kind lives in the description
 * the customer reads, and nothing is lost when the quote is reopened.
 */
export const FREE_ITEM_KINDS: ReadonlyArray<{ id: string; label: string; icon: string }> = [
  { id: "servico", label: "Serviço", icon: "mdi:wrench-outline" },
  { id: "mao", label: "Mão de obra", icon: "mdi:account-hard-hat-outline" },
  { id: "taxa", label: "Taxa", icon: "mdi:receipt-text-outline" },
  { id: "peca", label: "Peça sob encomenda", icon: "mdi:package-variant-closed" },
];

/** What separates the kind from the rest of the description. */
const SEPARATOR = " — ";

/** The description with a leading kind (if any) removed. */
function withoutKind(name: string): string {
  const trimmed = name.trim();
  for (const { label } of FREE_ITEM_KINDS) {
    if (trimmed === label) return "";
    if (trimmed.startsWith(label + SEPARATOR)) {
      return trimmed.slice(label.length + SEPARATOR.length).trim();
    }
  }
  return trimmed;
}

/**
 * Picking a kind prefixes the description instead of replacing it — what the
 * seller typed is the part that matters, and picking a second kind swaps the
 * prefix rather than stacking one on top of the other.
 */
export function applyFreeItemKind(name: string, label: string): string {
  const rest = withoutKind(name);
  return rest ? `${label}${SEPARATOR}${rest}` : label;
}

/** Whether the description currently carries this kind as its prefix. */
export function isFreeItemKindActive(name: string, label: string): boolean {
  const trimmed = name.trim();
  return trimmed === label || trimmed.startsWith(label + SEPARATOR);
}
