/**
 * Data-layer entry point for the asset library provider (PRD-027 D-15). The
 * interface lives in `@/shared/types/quickSend`; this file re-exports it so the
 * contracts barrel and factory can register the `assetLibrary` slice.
 */
export type { IAssetLibraryProvider, IAssetLibraryListParams } from "@/shared/types";
