import type { ID, IContact, ITriageSuggestion, TriageSignal } from "@/shared/types";
import {
  areaCodeOf,
  companyEmailDomainOf,
  nameTokens,
  normalizeEmail,
  phoneKeyOf,
  sharedNameTokens,
} from "./triageMatch";

/**
 * A customer the loose contact might belong to, with everything known about
 * how to reach them. Assembled by the provider from the customer record plus
 * the contacts already linked to it — the provider fetches, this engine
 * decides.
 */
export interface ITriageCandidate {
  customerId: ID;
  customerName: string;
  /** Every phone known for the customer: its own plus its linked contacts'. */
  phones: (string | null)[];
  emails: (string | null)[];
  city: string | null;
  uf: string | null;
}

/**
 * Confidence carried by each signal on its own.
 *
 * A shared phone key is all but decisive — it means the very same line is
 * already in the customer's record, usually as a 9th-digit variant. A shared
 * company e-mail is nearly as strong. A name match is real evidence but not
 * proof: surnames repeat, and this base is full of families in the same trade.
 */
const SIGNAL_WEIGHT = {
  phone: 95,
  email: 92,
  emailDomain: 70,
} as const;

/**
 * A name match scores on the SHARE of distinctive words the two names have in
 * common, measured against the longer of the two — not on the raw count.
 *
 * "Diego Kroth" ↔ "Kroth Terraplanagem" shares one word out of two and is
 * strong evidence. "Ana Paula Ferreira Souza Lima" ↔ "Lima Máquinas" also
 * shares exactly one word, and is nearly worthless: one surname colliding
 * inside a long name is what a common surname does. Counting words alone
 * would score both the same.
 */
const NAME_BASE = 34;
const NAME_RATIO_SPAN = 50;
const NAME_MAX = 84;

/**
 * A matching area code is context, never evidence. Two numbers in DDD 55 say
 * only that both are in this region — which is true of nearly the whole base.
 * It refines a suggestion that already stands on something else and can never
 * create one.
 */
const AREA_CODE_BONUS = 4;

/**
 * Weight given to signals other than the strongest one.
 *
 * Signals are correlated (a contact matching by phone often matches by name
 * too), so adding them at face value would push every multi-signal candidate
 * to 100% and flatten the ranking this screen exists to provide.
 */
const SECONDARY_WEIGHT = 0.15;

/** Below this, a suggestion is noise and is not offered at all. */
export const MIN_TRIAGE_CONFIDENCE = 45;

/** The keyboard offers 1–3; more than that is not a shortlist. */
export const MAX_TRIAGE_SUGGESTIONS = 3;

interface IScoredSignal {
  signal: TriageSignal;
  score: number;
  reason: string;
}

function quote(value: string): string {
  return `“${value}”`;
}

/** Signals raised by one candidate, strongest first. */
function scoreCandidate(contact: IContact, candidate: ITriageCandidate): IScoredSignal[] {
  const signals: IScoredSignal[] = [];

  const contactPhoneKey = phoneKeyOf(contact.phone);
  if (contactPhoneKey) {
    const candidateKeys = new Set(
      candidate.phones.map(phoneKeyOf).filter((key): key is string => key !== null),
    );
    if (candidateKeys.has(contactPhoneKey)) {
      signals.push({
        signal: "phone",
        score: SIGNAL_WEIGHT.phone,
        reason: "mesmo telefone já cadastrado neste cliente",
      });
    }
  }

  const contactEmail = normalizeEmail(contact.email);
  if (contactEmail) {
    const candidateEmails = new Set(
      candidate.emails.map(normalizeEmail).filter((mail): mail is string => mail !== null),
    );
    if (candidateEmails.has(contactEmail)) {
      signals.push({
        signal: "email",
        score: SIGNAL_WEIGHT.email,
        reason: "mesmo e-mail do cadastro",
      });
    } else {
      const domain = companyEmailDomainOf(contactEmail);
      const candidateDomains = new Set(
        candidate.emails
          .map(companyEmailDomainOf)
          .filter((value): value is string => value !== null),
      );
      if (domain && candidateDomains.has(domain)) {
        signals.push({
          signal: "emailDomain",
          score: SIGNAL_WEIGHT.emailDomain,
          reason: `e-mail do domínio ${domain}`,
        });
      }
    }
  }

  const tokens = sharedNameTokens(contact.name, candidate.customerName);
  if (tokens.length > 0) {
    const breadth = Math.max(
      nameTokens(contact.name).length,
      nameTokens(candidate.customerName).length,
    );
    const ratio = tokens.length / breadth;
    const score = Math.min(NAME_MAX, NAME_BASE + NAME_RATIO_SPAN * ratio);
    const quoted = tokens.map(quote).join(" e ");
    signals.push({
      signal: "name",
      score,
      reason:
        tokens.length === 1
          ? `${quoted} também está no nome do cliente`
          : `${quoted} também estão no nome do cliente`,
    });
  }

  return signals.sort((a, b) => b.score - a.score);
}

/**
 * Ranks the customers a loose contact plausibly belongs to.
 *
 * The percentage is not the product here — the sentence is. An attendant
 * links a contact because "mesmo telefone já cadastrado neste cliente" is
 * something they can check, not because a number said 95%. Both are returned
 * and the UI shows both, in that order of importance.
 *
 * Candidates scoring under {@link MIN_TRIAGE_CONFIDENCE} are dropped rather
 * than shown greyed out: a weak suggestion invites a careless link, and a
 * wrong link is worse for this base than no suggestion at all.
 */
export function buildTriageSuggestions(
  contact: IContact,
  candidates: ITriageCandidate[],
  limit: number = MAX_TRIAGE_SUGGESTIONS,
): ITriageSuggestion[] {
  const contactAreaCode = areaCodeOf(contact.phone);

  const scored: ITriageSuggestion[] = [];
  for (const candidate of candidates) {
    // A contact already linked to this very customer is not a suggestion.
    if (contact.customerId === candidate.customerId) continue;

    const signals = scoreCandidate(contact, candidate);
    const [strongest, ...rest] = signals;
    if (!strongest) continue;

    let confidence =
      strongest.score + rest.reduce((sum, item) => sum + item.score, 0) * SECONDARY_WEIGHT;

    const signalKeys = signals.map((item) => item.signal);
    const reasons = signals.map((item) => item.reason);

    const sameAreaCode =
      contactAreaCode !== null &&
      candidate.phones.some((phone) => areaCodeOf(phone) === contactAreaCode);
    if (sameAreaCode) {
      confidence += AREA_CODE_BONUS;
      signalKeys.push("areaCode");
      reasons.push(`mesmo DDD (${contactAreaCode})`);
    }

    confidence = Math.min(99, Math.round(confidence));
    if (confidence < MIN_TRIAGE_CONFIDENCE) continue;

    scored.push({
      customerId: candidate.customerId,
      customerName: candidate.customerName,
      confidence,
      reason: reasons.join(" · "),
      signals: signalKeys,
    });
  }

  return scored
    .sort(
      (a, b) =>
        b.confidence - a.confidence || a.customerName.localeCompare(b.customerName, "pt-BR"),
    )
    .slice(0, limit);
}
