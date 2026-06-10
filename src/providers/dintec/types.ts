/**
 * GALLO BASE DIESEL — DINTEC import provider layer: shared types (PRD-121).
 *
 * The DINTEC ERP exposes no API and no database access (briefing v1.3 §10) —
 * the only viable MVP path is a manual CSV export uploaded by the GALLO
 * operator. This layer applies the Provider Pattern so the import engine
 * (PRD-123) and the entity syncs (PRDs 124-126) stay decoupled from the
 * source format: `CsvDintecProvider` (PRD-122) is the MVP implementation, and
 * a future `MirrorDbDintecProvider` / API provider can land without touching
 * any consumer.
 *
 * Contract guarantees consumers rely on (RNF-002 — changing these is a
 * downstream refactor across PRDs 122-126):
 * - `DintecRow.rawRecord` values are ALWAYS strings — type conversion is the
 *   engine's job, never the provider's (RF-004).
 * - `rawRecord` keys are ALWAYS normalized (lowercase snake_case, accents
 *   stripped) — layout variations are absorbed by the provider (RF-002).
 */

/**
 * Entities a DINTEC export can carry. `price` and `stock` are RESERVED for a
 * future wave — declared so the union is stable, but no MVP provider loads
 * them (PRD-121 "Decisões Pendentes").
 */
export type DintecImportEntityKind =
  | "customer"
  | "part"
  | "order"
  | "order_item"
  | "price"
  | "stock";

/** Engines this layer can resolve. Only `csv` ships in the MVP (PRD-122). */
export type DintecProviderName = "csv" | "mirror_db" | "api" | "mock";

/** Static feature matrix a provider declares up-front (RF-001). */
export interface DintecProviderCapabilities {
  /** `true` when the source can send diffs; `false` = always full snapshot. */
  supportsIncremental: boolean;
  /** Order CSVs are hard to export from DINTEC; some sources cannot. */
  supportsOrderImport: boolean;
  /** `true` when the provider auto-detects latin-1 vs utf-8. */
  encodingDetection: boolean;
  /** Hard cap per batch, in megabytes. */
  maxBatchSizeMB: number;
}

/**
 * Standard capabilities for the MVP CSV pipeline — shared by the mock and by
 * `CsvDintecProvider` (PRD-122) so consumers see one consistent matrix.
 */
export const DEFAULT_DINTEC_CAPABILITIES: DintecProviderCapabilities = {
  supportsIncremental: false,
  supportsOrderImport: true,
  encodingDetection: true,
  maxBatchSizeMB: 50,
};

/** Where a batch comes from. `inline` exists for tests and previews. */
export type DintecImportSource =
  | { kind: "storage"; bucket: string; path: string }
  | { kind: "inline"; csvText: string }
  | { kind: "mirror"; query: string };

/**
 * Metadata the caller already knows when asking for a batch (it lives in
 * `dintec_import_batches` — PRD-122). The source alone cannot populate these
 * fields, so they travel as an explicit context argument.
 */
export interface DintecBatchContext {
  /** UUID generated at upload time (batch row id). */
  batchId: string;
  entityKind: DintecImportEntityKind;
  /** Store this import belongs to (multistore first-class). */
  storeId: string;
  /** Seller id of the operator who uploaded the file. */
  uploadedBy: string;
  /** ISO timestamp of the upload; defaults to the batch row value. */
  uploadedAt: string;
}

/** One normalized row of the export — values still raw strings (RF-004). */
export interface DintecRow {
  entityKind: DintecImportEntityKind;
  /** Identifier in DINTEC (codigo, numero_pedido, ...). Unique per kind. */
  dintecId: string;
  /** Normalized keys (lowercase snake_case); values as-is from the source. */
  rawRecord: Record<string, string>;
  /** 1-based data-row number in the source file (for error reporting). */
  rowNumber: number;
  warnings?: string[];
}

/** A fully-loaded import batch, ready for validation and processing. */
export interface DintecImportBatch {
  batchId: string;
  source: DintecImportSource;
  entityKind: DintecImportEntityKind;
  storeId: string;
  uploadedBy: string;
  uploadedAt: string;
  /** MVP keeps the whole batch in memory (≤ 50MB); streaming is future work. */
  rows: DintecRow[];
  detectedEncoding?: string;
  detectedDelimiter?: string;
  totalRows: number;
}

/**
 * Structural validation issue. `code` stays an open string so providers can
 * add source-specific codes without an interface change; well-known codes:
 * `MISSING_COLUMN`, `EMPTY_FILE`, `ENCODING_INVALID`, `DELIMITER_NOT_DETECTED`,
 * `DUPLICATE_DINTEC_ID`, `FILE_TOO_LARGE`.
 */
export interface DintecValidationError {
  level: "error" | "warning";
  /** Absent for file-level (structural) issues. */
  rowNumber?: number;
  field?: string;
  code: string;
  /** Human-readable, pt-BR — shown verbatim to the Owner (RNF UX). */
  message: string;
}

/** Outcome of `validateStructure` — structural only, no semantics. */
export interface DintecValidationResult {
  valid: boolean;
  errors: DintecValidationError[];
  warnings: DintecValidationError[];
}

/** Provider health snapshot (CSV: always healthy; mirror/API: real ping). */
export interface DintecHealthCheckResult {
  status: "healthy" | "degraded" | "down";
  details?: Record<string, unknown>;
}
