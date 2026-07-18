// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/openwa/client.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * HTTP client for the OpenWA REST server (self-hosted whatsapp-web.js fork).
 *
 * Confirmed live (2026-07-07, server v0.8.9): every real endpoint lives under
 * an `/api` prefix (the bare root serves the server's own SPA dashboard, which
 * answers 200 for ANY path — a trap for hand-guessed paths that look "successful"
 * but are just the SPA shell); auth header is `x-api-key: <key>` — the SAME
 * global key for every session on the server (see constants.ts). Same shared
 * lifecycle as the other engines: 30s timeout, sanitized integration log on
 * every call, network failures normalized. The api key never appears in logs
 * (RNF-001).
 */

import { engineFetch, type IEngineFetchResult } from "../http.ts";
import type { IEngineDeps } from "../types.ts";
import { mapOpenWaError } from "./errors.ts";

export interface IOpenWaRequestOptions {
  baseUrl: string;
  /** Path WITHOUT the `/api` prefix (e.g. `/sessions/{id}/messages/send-text`) — prepended here. */
  path: string;
  method?: "GET" | "POST" | "DELETE";
  json?: unknown;
  traceId?: string;
  timeoutMs?: number;
  /** Skip logging the response payload (e.g. QR pairing image data URI). */
  omitResponsePayload?: boolean;
}

export async function openwaRequest(
  apiKey: string,
  deps: IEngineDeps,
  options: IOpenWaRequestOptions,
): Promise<IEngineFetchResult> {
  const headers: Record<string, string> = { "x-api-key": apiKey };
  if (options.traceId) headers["X-Trace-Id"] = options.traceId;
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  const path = `/api${options.path}`;
  const result = await engineFetch(
    `${options.baseUrl}${path}`,
    { method: options.method ?? "POST", headers, body },
    {
      integrationName: "whatsapp_openwa",
      endpoint: path,
      traceId: options.traceId,
      requestPayload: options.json,
      logIntegration: deps.logIntegration,
      fetchFn: deps.fetchFn,
      timeoutMs: options.timeoutMs,
      omitResponsePayload: options.omitResponsePayload,
    },
  );

  if (result.status < 200 || result.status >= 300) {
    throw mapOpenWaError(result.status, result.body, path);
  }
  return result;
}
