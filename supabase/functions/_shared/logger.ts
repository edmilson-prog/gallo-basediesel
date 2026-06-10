/** Structured JSON logging with trace correlation (PRD-102). */

type Level = "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

function emit(level: Level, traceId: string, msg: string, fields?: LogFields): void {
  // One JSON object per line — searchable in the Supabase logs explorer.
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), level, traceId, msg, ...fields }),
  );
}

/** Per-request logger bound to a traceId (created by servePost). */
export function createLogger(traceId: string) {
  return {
    traceId,
    info: (msg: string, fields?: LogFields) => emit("info", traceId, msg, fields),
    warn: (msg: string, fields?: LogFields) => emit("warn", traceId, msg, fields),
    error: (msg: string, fields?: LogFields) => emit("error", traceId, msg, fields),
  };
}

export type Logger = ReturnType<typeof createLogger>;
