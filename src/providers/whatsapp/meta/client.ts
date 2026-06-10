/**
 * HTTP client for the Meta Graph API (PRD-112 RF-010).
 *
 * Thin wrapper over the shared engine lifecycle (`engineFetch`): adds Bearer
 * auth, the optional X-Trace-Id header (Meta ignores it — kept for symmetric
 * logging), maps non-2xx responses via `mapMetaError` and captures the
 * rate-limit usage header (RNF-007). The access token only ever lives in the
 * Authorization header — never in logs or thrown errors (RNF-001).
 */

import { engineFetch, type IEngineFetchResult } from "../http";
import type { IEngineDeps } from "../types";
import { META_GRAPH_BASE_URL } from "./constants";
import { mapMetaError } from "./errors";

export interface IMetaRequestOptions {
  /** Path relative to the Graph base URL (e.g. `/123/messages`) or absolute URL. */
  path: string;
  method?: "GET" | "POST" | "DELETE";
  /** JSON body (mutually exclusive with formData). */
  json?: unknown;
  formData?: FormData;
  traceId?: string;
  timeoutMs?: number;
  expect?: "json" | "bytes";
}

export interface IMetaResponse extends IEngineFetchResult {
  /** Raw `X-Business-Use-Case-Usage` header, when present (RNF-007). */
  rateLimitUsage?: string;
}

export async function metaRequest(
  accessToken: string,
  deps: IEngineDeps,
  options: IMetaRequestOptions,
): Promise<IMetaResponse> {
  const url = options.path.startsWith("http")
    ? options.path
    : `${META_GRAPH_BASE_URL}${options.path}`;
  // Strip the access token from the logged endpoint — base URL carries none.
  const endpoint = options.path.startsWith("http") ? "(media url)" : options.path;

  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (options.traceId) headers["X-Trace-Id"] = options.traceId;
  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  const result = await engineFetch(
    url,
    { method: options.method ?? "POST", headers, body },
    {
      integrationName: "whatsapp_meta",
      endpoint,
      traceId: options.traceId,
      requestPayload: options.formData ? { formData: true } : options.json,
      logIntegration: deps.logIntegration,
      fetchFn: deps.fetchFn,
      timeoutMs: options.timeoutMs,
      expect: options.expect,
    },
  );

  if (result.status < 200 || result.status >= 300) {
    throw mapMetaError(result.status, result.body, endpoint, result.headers.get("Retry-After"));
  }

  return {
    ...result,
    rateLimitUsage: result.headers.get("X-Business-Use-Case-Usage") ?? undefined,
  };
}
