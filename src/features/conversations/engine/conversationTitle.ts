export interface IConversationTitleInput {
  /** Resolved display name — the person, when one is known. */
  name: string;
  /** True when `name` is really just a phone number (contact never named). */
  isPhoneName: boolean;
  /** Company this person speaks for, when there is one. */
  companyName?: string | null;
  /** The person's own number, used when the name is not a usable identifier. */
  phone?: string | null;
}

export interface IConversationTitle {
  /** Rendered in full weight — the thing you scan the list for. */
  primary: string;
  /** Rendered muted, after a separator. Null when there is nothing to add. */
  secondary: string | null;
}

/**
 * What names a conversation row in the Inbox.
 *
 * The rule is that IDENTITY LEADS AND CONTEXT FOLLOWS, because both share a
 * single truncate downstream: whatever comes second is what the ellipsis eats
 * first. Ordering them correctly is therefore the whole degradation strategy —
 * no breakpoints, no measuring.
 *
 * It inverts in one case. When the contact was never named, `name` is just the
 * number: a poor identifier that says nothing about who is writing. There the
 * COMPANY is the stronger signal and takes the lead, with the number trailing
 * as the detail that tells two lines of the same company apart.
 */
export function resolveConversationTitle(input: IConversationTitleInput): IConversationTitle {
  const name = input.name.trim();
  const company = input.companyName?.trim() || null;
  const phone = input.phone?.trim() || null;

  // No company: nothing to append. A lone name never grows a separator.
  if (!company) return { primary: name, secondary: null };

  // Guard against "ACME · ACME" — a conversation with no linked person resolves
  // its name FROM the company, so the two can legitimately be the same string.
  if (company.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR")) {
    return { primary: name, secondary: null };
  }

  if (input.isPhoneName) {
    return { primary: company, secondary: phone || name };
  }

  return { primary: name, secondary: company };
}
