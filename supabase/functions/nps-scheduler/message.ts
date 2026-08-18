/**
 * Survey copy and URL building — pure, so it can be tested without pulling in
 * the Deno/esm.sh imports that `sender.ts` needs.
 *
 * There is no HSM template here. The production engine is WAHA, which has no
 * 24-hour window and no Meta template approval — the survey goes out as
 * ordinary text on the thread the conversation already owns.
 */

/** Trailing slash on the base URL is tolerated so config typos don't break the link. */
export function buildSurveyUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/pesquisa/${token}`;
}

/**
 * First name only — the survey greets a person, and anything past the first
 * name is PII the message does not need. Falls back to a neutral greeting so a
 * contact with no name never receives "Oi, !".
 */
export function firstNameOf(fullName: string | null | undefined): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  return first;
}

export function buildSurveyMessage(firstName: string, surveyUrl: string): string {
  const trimmed = firstName.trim();
  const greeting = trimmed.length > 0 ? `Oi, ${trimmed}!` : "Oi!";
  return (
    `${greeting} Aqui é da GALLO Base Diesel. Seu atendimento foi concluído — ` +
    `de 0 a 10, qual a chance de você nos recomendar para um colega? ` +
    `É rapidinho: ${surveyUrl}`
  );
}
