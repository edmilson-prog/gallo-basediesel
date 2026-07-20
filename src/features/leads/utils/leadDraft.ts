import type { ID, ILead, LeadTemperature } from "@/shared/types";
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

function parseValue(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // Accept BR-style "1.234,50" and plain "1234.5".
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

export function toLeadDraft(lead: ILead): ILeadDraft {
  return {
    temperature: lead.temperature,
    estimatedValue: lead.estimatedValue !== undefined ? String(lead.estimatedValue) : "",
    nextActionAt: lead.nextActionAt ? lead.nextActionAt.slice(0, 10) : "",
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

/** Only the fields whose value actually changed vs the lead. */
export function buildLeadPatch(lead: ILead, draft: ILeadDraft): Partial<ILead> {
  const patch: Partial<ILead> = {};
  if (draft.temperature !== lead.temperature) patch.temperature = draft.temperature;

  const value = parseValue(draft.estimatedValue);
  if (value !== lead.estimatedValue) patch.estimatedValue = value;

  const nextAction = draft.nextActionAt ? new Date(draft.nextActionAt).toISOString() : undefined;
  const currentNextActionDay = lead.nextActionAt ? lead.nextActionAt.slice(0, 10) : "";
  if (draft.nextActionAt !== currentNextActionDay) patch.nextActionAt = nextAction;

  const email = draft.email.trim().toLowerCase() || undefined;
  if (email !== lead.email) patch.email = email;

  const tags: ID[] = draft.tags.map(normalizeTag).filter(Boolean);
  if (!sameTags(tags, lead.tags)) patch.tags = tags;

  return patch;
}
