import type { IMediaAsset, IMediaClassification } from "@/shared/types";

export interface IClassifyMediaInput {
  kind: IMediaAsset["kind"];
  mimeType: string;
  fileName?: string;
  ocrText?: string;
  /** Explicit hint baked by the mock generator — wins over heuristics. */
  mockMarker?: IMediaClassification;
}

/** Ordered keyword markers; first match wins (most specific first). */
const MARKERS: { value: IMediaClassification; patterns: RegExp[] }[] = [
  { value: "nota_fiscal", patterns: [/\bnf[-\s]?\d/, /nota[-\s]?fiscal/, /danfe/, /nota fiscal/] },
  { value: "comprovante", patterns: [/comprovante/, /\brecibo/, /\bpix\b/, /transfer[eê]ncia/, /\bboleto/] },
  { value: "chassi_placa", patterns: [/\bchassi/, /\bplaca\b/, /plaqueta/] },
  { value: "catalogo", patterns: [/cat[aá]logo/, /tabela[-\s]?aplica/] },
  { value: "peca", patterns: [/\bpe[çc]a/, /pastilha/, /\bturbo/, /embreagem/, /\bfiltro/, /bosch/] },
];

/**
 * Deterministic heuristic classification (Fase 1 — no AI). Priority:
 * explicit mock marker → fileName/ocr keyword markers → kind-based default.
 * Pure, total. Spec §8.
 */
export function classifyMedia(input: IClassifyMediaInput): IMediaClassification {
  if (input.mockMarker) return input.mockMarker;
  const haystack = `${input.fileName ?? ""} ${input.ocrText ?? ""}`.toLowerCase();
  for (const marker of MARKERS) {
    if (marker.patterns.some((re) => re.test(haystack))) return marker.value;
  }
  // Kind-based fallback: a photo is most likely a part; everything else "outro".
  if (input.kind === "image") return "peca";
  return "outro";
}
