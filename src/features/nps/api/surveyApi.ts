/**
 * Client for the public `nps-submit` Edge Function.
 *
 * Deliberately does NOT use the Supabase client: the landing page is anonymous
 * and must not carry, create or refresh a session. It is a plain fetch to a
 * function deployed with `--no-verify-jwt`.
 */

export type INpsSurveyState = "valid" | "expired" | "responded" | "invalid";

export interface INpsSurveyContext {
  state: INpsSurveyState;
  recipientFirstName?: string;
  contextLabel?: string;
}

export interface INpsSubmitResult {
  ok: boolean;
  detractor: boolean;
}

function endpoint(): string {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base) throw new Error("VITE_SUPABASE_URL ausente");
  return `${String(base).replace(/\/+$/, "")}/functions/v1/nps-submit`;
}

async function call(payload: Record<string, unknown>): Promise<Response> {
  return fetch(endpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function fetchSurveyContext(token: string): Promise<INpsSurveyContext> {
  const response = await call({ action: "context", token });
  if (!response.ok) return { state: "invalid" };
  return (await response.json()) as INpsSurveyContext;
}

/**
 * Maps the endpoint's status codes to the states the page renders. 409 and 410
 * are expected outcomes (already answered, expired), not failures to retry.
 */
export async function submitSurvey(
  token: string,
  score: number,
  comment: string | null,
): Promise<{ status: "ok" | "responded" | "expired" | "error"; detractor: boolean }> {
  const response = await call({ action: "submit", token, score, comment });

  if (response.status === 409) return { status: "responded", detractor: false };
  if (response.status === 410) return { status: "expired", detractor: false };
  if (!response.ok) return { status: "error", detractor: false };

  const body = (await response.json()) as INpsSubmitResult;
  return { status: "ok", detractor: Boolean(body.detractor) };
}
