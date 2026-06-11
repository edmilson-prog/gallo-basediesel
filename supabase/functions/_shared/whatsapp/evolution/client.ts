// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/evolution/client.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * HTTP client for the Evolution API (PRD-113 RF-010).
 *
 * Auth is the `apikey` header (not Bearer). Same shared lifecycle as Meta:
 * 30s timeout, sanitized integration log on every call, network failures
 * normalized. The api key never appears in logs (RNF-001).
 */

import { engineFetch, type IEngineFetchResult } from "../http.ts";
import type { IEngineDeps } from "../types.ts";
import { mapEvolutionError } from "./errors.ts";

export interface IEvolutionRequestOptions {
  baseUrl: string;
  /** Path including the instance segment (e.g. `/message/sendText/inst1`). */
  path: string;
  method?: "GET" | "POST" | "DELETE";
  json?: unknown;
  traceId?: string;
  timeoutMs?: number;
  /** Skip logging the response payload (e.g. QR pairing credentials). */
  omitResponsePayload?: boolean;
}

export async function evolutionRequest(
  apiKey: string,
  deps: IEngineDeps,
  options: IEvolutionRequestOptions,
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
      integrationName: "whatsapp_evolution",
      endpoint: options.path,
      traceId: options.traceId,
      requestPayload: options.json,
      logIntegration: deps.logIntegration,
      fetchFn: deps.fetchFn,
      timeoutMs: options.timeoutMs,
      omitResponsePayload: options.omitResponsePayload,
    },
  );

  if (result.status < 200 || result.status >= 300) {
    throw mapEvolutionError(result.status, result.body, options.path);
  }
  return result;
}
