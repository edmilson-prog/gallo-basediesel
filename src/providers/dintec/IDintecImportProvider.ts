/**
 * GALLO BASE DIESEL — DINTEC import provider interface (PRD-121, RF-001).
 *
 * Stable contract between import sources (CSV today; mirror DB / API in
 * future phases) and the import engine (PRD-123). Implementations live in
 * sibling folders (`csv/`, `mock/`) and are resolved via `factory.ts`.
 *
 * Implementations MUST NOT touch the database — they load and validate data
 * in memory only. Persistence is the engine's responsibility (PRD-123).
 */

import type {
  DintecBatchContext,
  DintecHealthCheckResult,
  DintecImportBatch,
  DintecImportSource,
  DintecProviderCapabilities,
  DintecProviderName,
  DintecValidationResult,
} from "./types";

export interface IDintecImportProvider {
  readonly providerName: DintecProviderName;
  readonly capabilities: DintecProviderCapabilities;

  /**
   * Loads a batch from the source and returns normalized rows. The context
   * carries the batch metadata the source itself cannot provide (batch id,
   * entity kind, store, uploader — they live in `dintec_import_batches`).
   *
   * Keys of every `rawRecord` come back normalized (lowercase snake_case,
   * accents stripped); values stay raw strings — the engine converts types.
   */
  loadBatch(source: DintecImportSource, context: DintecBatchContext): Promise<DintecImportBatch>;

  /**
   * Validates structure (encoding, delimiter, required header columns, at
   * least one row) WITHOUT touching the database. Semantic validation —
   * FKs, duplicates against existing data — belongs to the engine.
   */
  validateStructure(batch: DintecImportBatch): Promise<DintecValidationResult>;

  /** CSV: always healthy (no external dependency); mirror DB / API: ping. */
  healthCheck(): Promise<DintecHealthCheckResult>;
}
