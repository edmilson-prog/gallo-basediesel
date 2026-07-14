/**
 * Hard, code-level guardrail: the SDR v1 pilot (reception/triage only) never
 * mentions price, discount, shipping cost, or a specific delivery deadline —
 * that decision belongs to a human. This is deliberately a blunt keyword/
 * pattern scan, not an LLM judgment call: it is the safety net that runs
 * AFTER the model generates a reply (see enforceGuardrails.ts), so it must
 * stay simple and predictable rather than clever.
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /r\$\s?\d/i,
  /\bpre[çc]os?\b/i,
  /\bdescontos?\b/i,
  /\bfretes?\b/i,
  /\bvalor(es)?\s+(unit[aá]rio|total)\b/i,
  /\d+\s*%/,
  /\bpromo[çc][aã]o\b/i,
];

export function containsCommercialValue(text: string): boolean {
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}
