import type { ILead, LeadTemperature } from "@/shared/types";
import { LEADS_STRINGS } from "../i18n/pt-BR";

export interface ILeadDraft {
  temperature: LeadTemperature;
  estimatedValue: string;
  nextActionAt: string; // yyyy-mm-dd
  email: string;
  tags: string[];
}

export interface ILeadDraftErrors {
  estimatedValue?: string;
  email?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function addTag(tags: string[], raw: string): string[] {
  const tag = normalizeTag(raw);
  if (!tag) return tags;
  if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return tags;
  return [...tags, tag];
}

/**
 * Parses a money string, accepting both BR-style "1.234,50" (comma decimal,
 * dot thousands separator) and the plain `String(number)` form ("1500.5").
 * Only strips dots as thousands separators when a comma is present — a bare
 * dot is treated as the decimal point, so an unedited round-trip through
 * `toLeadDraft` never gets corrupted (e.g. "1500.5" must stay 1500.5, not
 * become 15005).
 */
function parseValue(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

/** Truncates an ISO8601 timestamp to its yyyy-mm-dd day component. */
function toDay(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

export function toLeadDraft(lead: ILead): ILeadDraft {
  return {
    temperature: lead.temperature,
    estimatedValue: lead.estimatedValue !== undefined ? String(lead.estimatedValue) : "",
    nextActionAt: toDay(lead.nextActionAt),
    email: lead.email ?? "",
    tags: [...lead.tags],
  };
}

export function validateLeadDraft(draft: ILeadDraft): ILeadDraftErrors {
  const errors: ILeadDraftErrors = {};
  if (draft.estimatedValue.trim() && parseValue(draft.estimatedValue) === undefined) {
    errors.estimatedValue = LEADS_STRINGS.fiche.invalidValue;
  }
  if (draft.email.trim() && !EMAIL_RE.test(draft.email.trim())) {
    errors.email = LEADS_STRINGS.fiche.invalidEmail;
  }
  return errors;
}

function sameTags(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

/**
 * Only the fields whose value actually changed vs the lead.
 *
 * Precondition: callers should run `validateLeadDraft` first and block
 * saving on errors. As a defensive fallback, a non-empty but unparsable
 * `estimatedValue` is treated as "no change" (the lead's current value is
 * left untouched) — never as a silent wipe. Only an emptied field clears
 * the value to `undefined`.
 */
export function buildLeadPatch(lead: ILead, draft: ILeadDraft): Partial<ILead> {
  const patch: Partial<ILead> = {};
  if (draft.temperature !== lead.temperature) patch.temperature = draft.temperature;

  const trimmedValue = draft.estimatedValue.trim();
  const value = parseValue(draft.estimatedValue);
  const isUnparsableNonEmpty = trimmedValue !== "" && value === undefined;
  if (!isUnparsableNonEmpty && value !== lead.estimatedValue) patch.estimatedValue = value;

  const nextAction = draft.nextActionAt ? new Date(draft.nextActionAt).toISOString() : undefined;
  const currentNextActionDay = toDay(lead.nextActionAt);
  if (draft.nextActionAt !== currentNextActionDay) patch.nextActionAt = nextAction;

  const email = draft.email.trim().toLowerCase() || undefined;
  if (email !== lead.email) patch.email = email;

  const tags: string[] = draft.tags.map(normalizeTag).filter(Boolean);
  if (!sameTags(tags, lead.tags)) patch.tags = tags;

  return patch;
}
