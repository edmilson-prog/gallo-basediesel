/** Visualization modes for the vehicle "Peças compatíveis" section (PRD-016). */
export const COMPATIBLE_PARTS_VIEWS = ["curadoria", "catalogo", "kit"] as const;
export type CompatiblePartsView = (typeof COMPATIBLE_PARTS_VIEWS)[number];

export const DEFAULT_COMPATIBLE_PARTS_VIEW: CompatiblePartsView = "curadoria";
export const COMPATIBLE_PARTS_VIEW_STORAGE_KEY = "gallo-compat-view";

/** Top-N shown per subsection in the "curadoria" mode before "ver todas". */
export const CURADORIA_TOP_N = 12;
/** Page size for the full "catalogo" mode. */
export const CATALOGO_PAGE_SIZE = 20;
