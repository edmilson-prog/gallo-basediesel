/**
 * Title-cases a supplier-sheet description the same way the existing 151
 * real `parts` rows were seeded (e.g. "Chave para desmontagem de filtro" →
 * "Chave Para Desmontagem De Filtro") — keeps new rows visually consistent
 * with the enriched ones.
 */
export function titleCaseName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1).toLocaleLowerCase("pt-BR"))
    .join(" ");
}
