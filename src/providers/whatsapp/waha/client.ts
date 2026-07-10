/**
 * Self-contained HTTP client for the WAHA REST API. Auth = a single
 * `X-Api-Key` header, server-wide (unlike Evolution Go, WAHA has no
 * per-session token — the same key authorizes every endpoint, admin and
 * messaging alike). Deliberately does NOT reuse ../http.ts's `engineFetch` —
 * WAHA is isolated by design, and this ~40-line helper is simpler than
 * depending on that shared plumbing's exact contract.
 */

import { mapWahaError } from "./errors";

export interface IWahaRequestOptions {
  baseUrl: string;
  path: string;
  method?: "GET" | "POST" | "DELETE";
  json?: unknown;
  timeoutMs?: number;
  /** Set for binary responses (e.g. the QR PNG). */
  expectBinary?: boolean;
}

export interface IWahaResponse {
  status: number;
  body: unknown;
  bytes?: Uint8Array;
  contentType?: string;
}

export async function wahaRequest(
  apiKey: string,
  fetchFn: typeof fetch,
  options: IWahaRequestOptions,
): Promise<IWahaResponse> {
  const headers: Record<string, string> = { "X-Api-Key": apiKey };
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  let response: Response;
  try {
    response = await fetchFn(`${options.baseUrl}${options.path}`, {
      method: options.method ?? "POST",
      headers,
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  let result: IWahaResponse;
  if (options.expectBinary) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    result = { status: response.status, body: null, bytes, contentType: response.headers.get("content-type") ?? undefined };
  } else {
    const text = await response.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    result = { status: response.status, body: parsed };
  }

  if (result.status < 200 || result.status >= 300) {
    throw mapWahaError(result.status, result.body, options.path);
  }
  return result;
}
