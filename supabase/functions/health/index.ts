import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * health (PRD-110, RF-020/021) — public healthcheck endpoint.
 *
 * GET → { status: "healthy" | "degraded" | "down", checks, ts }
 *
 * Checks (each with a 5s timeout, never leaking internals — RF: the response
 * carries only "ok"/"fail" per subsystem):
 *   db      — public.health_ping() RPC via service role (PostgREST + Postgres)
 *   storage — bucket metadata read via service role
 *   auth    — GoTrue /auth/v1/health
 *
 * Deployed with verify_jwt=false BY DESIGN: external uptime monitors must be
 * able to probe it without credentials (RF-021). It exposes no data and
 * performs no mutations. HTTP 200 for healthy/degraded, 503 for down.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { createLogger } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SERVICE_ROLE = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

const HEALTH_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

type CheckResult = "ok" | "fail";

const CHECK_TIMEOUT_MS = 5000;

/** Runs a probe with a hard timeout; any throw/timeout maps to "fail". */
async function probe(run: () => Promise<void>): Promise<CheckResult> {
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), CHECK_TIMEOUT_MS),
      ),
    ]);
    return "ok";
  } catch {
    return "fail";
  }
}

async function checkDb(): Promise<void> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.rpc("health_ping");
  if (error || data !== "ok") throw new Error(error?.message ?? "bad ping");
}

async function checkStorage(): Promise<void> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
  const { error } = await admin.storage.getBucket("avatars");
  if (error) throw new Error(error.message);
}

async function checkAuth(): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
    headers: { apikey: SERVICE_ROLE },
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`auth health ${res.status}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: HEALTH_CORS });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...HEALTH_CORS, "Content-Type": "application/json" },
    });
  }

  const traceId = req.headers.get("x-trace-id") ?? crypto.randomUUID();
  const log = createLogger(traceId);

  try {
    const [db, storage, auth] = await Promise.all([
      probe(checkDb),
      probe(checkStorage),
      probe(checkAuth),
    ]);

    // The database is the heart: db down = down; any other failure = degraded.
    const status =
      db === "fail" ? "down" : storage === "fail" || auth === "fail" ? "degraded" : "healthy";

    if (status !== "healthy") {
      log.error("healthcheck not healthy", { status, db, storage, auth });
    }

    return new Response(
      JSON.stringify({ status, checks: { db, storage, auth }, ts: new Date().toISOString() }),
      {
        status: status === "down" ? 503 : 200,
        headers: { ...HEALTH_CORS, "Content-Type": "application/json", "x-trace-id": traceId },
      },
    );
  } catch (err) {
    // Should be unreachable (probes never throw) — belt and braces.
    captureException(err, { traceId, functionName: "health" });
    return new Response(JSON.stringify({ status: "down", ts: new Date().toISOString() }), {
      status: 503,
      headers: { ...HEALTH_CORS, "Content-Type": "application/json", "x-trace-id": traceId },
    });
  }
});
