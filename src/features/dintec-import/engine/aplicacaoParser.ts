import type { IPartCrossReference } from "@/shared/types";

/**
 * Splits a DINTEC `APLICACAO` free-text field into the vehicle-fitment
 * prose and, when present, the trailing "COD. SEMELHANTES: X / Y / Z"
 * cross-reference list — the only structured piece worth extracting (the
 * fitment prose itself stays raw; see the design spec's "fora de escopo").
 */
export function parseAplicacaoText(raw: string): {
  applicationNotes: string | undefined;
  crossReferences: IPartCrossReference[];
} {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-") {
    return { applicationNotes: undefined, crossReferences: [] };
  }
  const marker = "COD. SEMELHANTES:";
  const markerIndex = trimmed.indexOf(marker);
  if (markerIndex === -1) {
    return { applicationNotes: trimmed, crossReferences: [] };
  }
  const notes = trimmed.slice(0, markerIndex).trim();
  const codesRaw = trimmed.slice(markerIndex + marker.length);
  const crossReferences = codesRaw
    .split("/")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((code) => ({ brand: "DINTEC (equivalente)", code }));
  return { applicationNotes: notes || undefined, crossReferences };
}
