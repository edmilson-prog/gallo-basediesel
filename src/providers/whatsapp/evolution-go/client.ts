/**
 * HTTP client for the Evolution Go API. Auth = a single `apikey` header whose
 * value is the GLOBAL key for admin endpoints (/instance/create, /instance/all)
 * or the per-instance TOKEN for instance-scoped calls (send/status/download/…)
 * — confirmed by smoke 2026-06-25; there is NO instanceId header (the server
 * ignores it). Paths are FIXED (the instance is not in the path, unlike v2).
 * Shares the engine HTTP lifecycle (timeout, sanitized log, error normalize).
 */

import { engineFetch, type IEngineFetchResult } from "../http";
import type { IEngineDeps } from "../types";
import { EVOLUTION_GO_INTEGRATION_NAME } from "./constants";
import { mapEvolutionGoError } from "./errors";

export interface IGoRequestOptions {
  baseUrl: string;
  /** Fixed path, e.g. `/send/text`. */
  path: string;
  method?: "GET" | "POST" | "DELETE";
  json?: unknown;
  traceId?: string;
  timeoutMs?: number;
  omitResponsePayload?: boolean;
  /** Forwarded to engineFetch for parity; Go returns media as base64 in JSON, so callers stay on the "json" default. */
  expect?: "json" | "bytes";
}

export async function goRequest(
  apiKey: string,
  deps: IEngineDeps,
  options: IGoRequestOptions,
): Promise<IEngineFetchResult> {
  const headers: Record<string, string> = { apikey: apiKey };
  if (options.traceId) headers["X-Trace-Id"] = options.traceId;
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  const result = await engineFetch(
    `${options.baseUrl}${options.path}`,
    { method: options.method ?? "POST", headers, body },
    {
      integrationName: EVOLUTION_GO_INTEGRATION_NAME,
      endpoint: options.path,
      traceId: options.traceId,
      requestPayload: options.json,
      logIntegration: deps.logIntegration,
      fetchFn: deps.fetchFn,
      timeoutMs: options.timeoutMs,
      omitResponsePayload: options.omitResponsePayload,
      expect: options.expect,
    },
  );

  if (result.status < 200 || result.status >= 300) {
    throw mapEvolutionGoError(result.status, result.body, options.path);
  }
  return result;
}
