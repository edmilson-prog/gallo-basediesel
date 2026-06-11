/**
 * Contract for embedded media storage (PRD-026).
 *
 * The interface itself lives in `@/shared/types/media` (D-15 — dedicated type
 * for cohesion); this file is the data-layer entry point and re-exports it so
 * the contracts barrel and factory can register the `media` slice.
 *
 * @see ../../../mocks/api/media.ts
 * @see ../../../../docs/provider-pattern.md
 */
export type { IMediaStorageProvider, IMediaUploadInput, IListMediaParams } from "@/shared/types";
