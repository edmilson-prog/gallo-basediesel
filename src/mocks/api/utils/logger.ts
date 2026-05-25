import { MOCK_LOGS_ENABLED } from "../../config";

/**
 * Compact, single-line API call trace for the dev console.
 * Disabled in production / demo builds via {@link MOCK_LOGS_ENABLED}.
 */
export function logApiCall(api: string, operation: string, ms: number, payload?: unknown): void {
  if (!MOCK_LOGS_ENABLED) return;
  const label = `%c[mock] ${api}.${operation} %c(${ms}ms)`;
  const apiStyle = "color:#D2A809;font-weight:bold";
  const msStyle = "color:#888;font-weight:normal";
  if (payload === undefined) {
    console.log(label, apiStyle, msStyle);
  } else {
    console.log(label, apiStyle, msStyle, payload);
  }
}

export function logApiError(api: string, operation: string, ms: number, error: unknown): void {
  if (!MOCK_LOGS_ENABLED) return;
  const label = `%c[mock] ${api}.${operation} ❌ %c(${ms}ms)`;
  console.warn(label, "color:#C4151C;font-weight:bold", "color:#888", error);
}
