import type { INpsClass, INpsResult } from "@/shared/types";

/**
 * Classic NPS bands: 0-6 detractor, 7-8 passive, 9-10 promoter.
 *
 * The class is never persisted — deriving it here is what keeps historical
 * rows consistent if the bands ever change (PRD-148B forbids a
 * `classification` column for exactly this reason).
 */
export function classifyScore(score: number): INpsClass {
  if (score <= 6) return "detractor";
  if (score <= 8) return "passive";
  return "promoter";
}

/**
 * Score = round(%promoters − %detractors) over the responses in the window.
 * Passives count toward `n` but never move the score — that asymmetry is the
 * whole point of the metric.
 *
 * Below `minResponses` the result is `state: 'collecting'` with a null score.
 * Callers cannot render a number they were not given, which is how the
 * "no score without N" rule survives being re-implemented per surface: an
 * "NPS 100" drawn from two answers is executive misinformation, and the
 * Cockpit card is the surface most likely to be read as fact.
 */
export function computeNps(
  responses: ReadonlyArray<{ score: number }>,
  opts: { minResponses: number; sent: number },
): INpsResult {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;

  for (const response of responses) {
    const npsClass = classifyScore(response.score);
    if (npsClass === "promoter") promoters += 1;
    else if (npsClass === "passive") passives += 1;
    else detractors += 1;
  }

  const n = responses.length;
  const responseRate = opts.sent > 0 ? n / opts.sent : 0;
  const base = { n, sent: opts.sent, responseRate, promoters, passives, detractors };

  if (n < opts.minResponses || n === 0) {
    return { ...base, state: "collecting", score: null };
  }

  return {
    ...base,
    state: "ok",
    score: Math.round((promoters / n) * 100 - (detractors / n) * 100),
  };
}
