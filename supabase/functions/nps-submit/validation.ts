/**
 * Pure validation of the public submission payload. Kept separate from
 * `index.ts` so it can be tested without the Deno/esm.sh imports.
 *
 * Everything arriving here is untrusted: the endpoint is anonymous, and
 * possession of the token authorises exactly one survey and nothing else.
 */

export const MAX_COMMENT_LENGTH = 1000;
export const MAX_REASONS = 8;
export const MAX_REASON_LENGTH = 60;

export type IParsedSubmission =
  | { ok: true; token: string; score: number; comment: string | null; reasons: string[] }
  | { ok: false; error: string };

/** Token format is checked before any query: 64 hex chars, as minted by the scheduler. */
export function isWellFormedToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function parseSubmission(body: unknown): IParsedSubmission {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "corpo inválido" };
  }
  const raw = body as Record<string, unknown>;

  if (!isWellFormedToken(raw.token)) {
    return { ok: false, error: "token inválido" };
  }

  const score = raw.score;
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 10) {
    return { ok: false, error: "nota inválida" };
  }

  const rawComment = raw.comment;
  if (rawComment !== undefined && rawComment !== null && typeof rawComment !== "string") {
    return { ok: false, error: "comentário inválido" };
  }
  const trimmed = typeof rawComment === "string" ? rawComment.trim() : "";
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: "comentário muito longo" };
  }

  const rawReasons = raw.reasons;
  if (rawReasons !== undefined && !Array.isArray(rawReasons)) {
    return { ok: false, error: "motivos inválidos" };
  }
  // Bounded and de-duplicated: the chips come from a closed vocabulary, but the
  // endpoint is public and cannot trust that the caller used it.
  const reasons = Array.isArray(rawReasons)
    ? [
        ...new Set(
          rawReasons
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter((item) => item.length > 0 && item.length <= MAX_REASON_LENGTH),
        ),
      ].slice(0, MAX_REASONS)
    : [];

  return {
    ok: true,
    token: raw.token,
    score,
    comment: trimmed.length > 0 ? trimmed : null,
    reasons,
  };
}

/** 0-6 detractor. Mirrors classifyScore in the front-end engine. */
export function isDetractor(score: number): boolean {
  return score <= 6;
}
