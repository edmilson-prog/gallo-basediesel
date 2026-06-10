/**
 * Shared HTTP lifecycle of the WhatsApp engines (PRDs 112/113).
 *
 * Every outbound provider call goes through {@link engineFetch}: 30s timeout,
 * latency measurement, sanitized integration log (PRD-112 RF-120) and network
 * failures normalized to WhatsAppProviderError (RNF-004). Engine-specific
 * error mapping stays in each engine's `errors.ts`.
 *
 * Runtime-agnostic file: relative imports only, Web APIs only.
 */

import { WhatsAppProviderError } from "./errors";
import { sanitizeForLog } from "./sanitize";
import type { IIntegrationLogEntry, IntegrationLogSink } from "./types";

export const DEFAULT_TIMEOUT_MS = 30_000;

export interface IEngineCallContext {
  integrationName: IIntegrationLogEntry["integrationName"];
  /** Logical endpoint recorded in the log (never includes secrets). */
  endpoint: string;
  traceId?: string;
  /** Body as built by the engine — sanitized/truncated before logging. */
  requestPayload?: unknown;
  logIntegration?: IntegrationLogSink;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** `bytes` for media downloads; default parses JSON (null when not JSON). */
  expect?: "json" | "bytes";
}

export interface IEngineFetchResult {
  status: number;
  /** Parsed JSON body (null when absent/unparseable or when expect=bytes). */
  body: unknown;
  bytes?: Uint8Array;
  headers: Headers;
}

/** Awaits the sink but never lets logging break the provider call. */
async function safeLog(
  sink: IntegrationLogSink | undefined,
  entry: IIntegrationLogEntry,
): Promise<void> {
  if (!sink) return;
  try {
    await sink(entry);
  } catch {
    // Logging must never interfere with the call itself (RNF-004).
  }
}

export async function engineFetch(
  url: string,
  init: RequestInit,
  ctx: IEngineCallContext,
): Promise<IEngineFetchResult> {
  const fetchFn = ctx.fetchFn ?? globalThis.fetch;
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetchFn(url, {
      ...init,
      signal: AbortSignal.timeout(ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await safeLog(ctx.logIntegration, {
      integrationName: ctx.integrationName,
      direction: "outbound",
      endpoint: ctx.endpoint,
      latencyMs: Date.now() - startedAt,
      traceId: ctx.traceId,
      requestPayload: sanitizeForLog(ctx.requestPayload),
      errorMessage,
    });
    throw new WhatsAppProviderError(
      "INTEGRATION_ERROR",
      502,
      `Falha de rede ao chamar o provider (${ctx.endpoint}): ${errorMessage}`,
    );
  }

  let body: unknown = null;
  let bytes: Uint8Array | undefined;
  if (ctx.expect === "bytes" && response.ok) {
    bytes = new Uint8Array(await response.arrayBuffer());
  } else {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  }

  await safeLog(ctx.logIntegration, {
    integrationName: ctx.integrationName,
    direction: "outbound",
    endpoint: ctx.endpoint,
    httpStatus: response.status,
    latencyMs: Date.now() - startedAt,
    traceId: ctx.traceId,
    requestPayload: sanitizeForLog(ctx.requestPayload),
    responsePayload: bytes ? { bytes: bytes.byteLength } : sanitizeForLog(body),
    errorMessage: response.ok ? undefined : `HTTP ${response.status}`,
  });

  return { status: response.status, body, bytes, headers: response.headers };
}
