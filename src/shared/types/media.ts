import type { ID, ISO8601, IPaginatedResult } from "./common";
import type { IMessage } from "./conversation";

/** Assisted classification of a media asset (heuristic on Fase 1). */
export type IMediaClassification =
  | "nota_fiscal"
  | "peca"
  | "chassi_placa"
  | "comprovante"
  | "catalogo"
  | "outro";

/**
 * A single annotation drawn over an image asset. Coordinates are normalized
 * 0..1 so they survive resize / zoom / DPR changes (RF-020, D normalize).
 */
export interface IMediaAnnotation {
  id: ID;
  type: "point" | "arrow" | "text";
  /** Normalized 0..1 anchor. */
  x: number;
  y: number;
  /** Normalized 0..1 arrow tip (only when type === "arrow"). */
  x2?: number;
  y2?: number;
  /** Annotation text (a11y: every mark carries a label). */
  label?: string;
  /**
   * Severity TOKEN NAME — one of "critical" | "warning" | "info" (NOT a raw
   * hex and NOT a CSS var). The UI maps the token to a Tailwind utility class
   * (e.g. "critical" → text-severity-critical / border-severity-critical),
   * never `var(--severity-*)` (undefined; the design system exposes
   * `--color-severity-*` consumed via the `severity-*` utilities). D-14.
   */
  color: string;
  createdBy: ID;
  createdAt: ISO8601;
}

/**
 * Archived media asset — the source of truth for inbound/outbound media.
 * Multi-store from the model (`storeId`). `storageRef` is always an obfuscated
 * reference, never a real URL/credential (RNF-008).
 */
export interface IMediaAsset {
  id: ID;
  storeId: ID;
  conversationId?: ID;
  customerId?: ID;
  messageId?: ID;
  kind: "image" | "audio" | "document" | "video";
  mimeType: string;
  sizeBytes: number;
  fileName?: string;
  authorType: "customer" | "seller" | "sdr" | "system";
  direction: "in" | "out";
  createdAt: ISO8601;
  /** Obfuscated reference — never a real URL/credential (RNF-008). */
  storageRef: string;
  /** False while not yet archived. */
  persisted: boolean;
  /** Simulated Meta URL expiry (D-3). */
  sourceExpiresAt?: ISO8601;
  /** Dedup key. */
  contentHash?: string;
  classification?: IMediaClassification;
  linkedVehicleId?: ID;
  linkedOrderId?: ID;
  linkedPartId?: ID;
  /** Mock on Fase 1 — search already works against these. */
  ocrText?: string;
  transcription?: string;
  sensitivity: "normal" | "sensitive";
  annotations?: IMediaAnnotation[];
  /** original=1; saving an annotation bumps to 2 (minimal history). */
  version?: number;
}

/**
 * Caller-facing upload payload. `storeId` is injected by the provider
 * (`withCreateStoreId`), never supplied by the caller.
 */
export interface IMediaUploadInput {
  kind: IMediaAsset["kind"];
  mimeType: string;
  sizeBytes: number;
  fileName?: string;
  conversationId?: ID;
  customerId?: ID;
  messageId?: ID;
  authorType: IMediaAsset["authorType"];
  direction: "in" | "out";
  sourceExpiresAt?: ISO8601;
  contentHash?: string;
  ocrText?: string;
  transcription?: string;
}

/** Filter accepted by the `list` op. Store-scoped by the provider. */
export interface IListMediaParams {
  storeId?: ID;
  conversationId?: ID;
  customerId?: ID;
  kind?: IMediaAsset["kind"];
  classification?: IMediaClassification;
  authorType?: IMediaAsset["authorType"];
  from?: ISO8601;
  to?: ISO8601;
  search?: string;
}

/**
 * Embedded media storage contract (PRD-026). The 5 "storage" ops are the
 * surface that Supabase Storage replaces in Fase 2 (RNF-007); the catalog ops
 * (`ensureFromMessage`, `update`) hit the table, not the bucket.
 */
export interface IMediaStorageProvider {
  upload(input: IMediaUploadInput): Promise<IMediaAsset>;
  get(assetId: ID): Promise<IMediaAsset | null>;
  /** RBAC-gated (D-4): redacted placeholder ref for sensitive-without-permission. */
  getSignedUrl(assetId: ID): Promise<string>;
  /** Audited. */
  delete(assetId: ID): Promise<IMediaAsset>;
  /** Store-scoped. */
  list(filter: IListMediaParams): Promise<IPaginatedResult<IMediaAsset>>;
  /** Dedup by messageId/contentHash (D-3). */
  ensureFromMessage(message: IMessage): Promise<IMediaAsset>;
  /** Audited classification/link/sensitivity/persisted/annotations patch. */
  update(assetId: ID, patch: Partial<IMediaAsset>): Promise<IMediaAsset>;
}
