/** Raw values for the summary card's one-line footer. */
export interface ISummaryFooterInput {
  /** Already localized — `CONVERSATION_STRINGS.statusLabel[status]`. */
  statusLabel: string;
  /** Assigned seller's full name; absent on a queued/unassigned conversation. */
  sellerName?: string | null;
  /** Origin instance label; absent on a single-instance store. */
  instanceLabel?: string | null;
}

/** One rendered segment of the footer. `kind` drives the leading dot's color. */
export interface ISummaryFooterPart {
  kind: "status" | "seller" | "instance";
  text: string;
}

/** Present, non-blank, trimmed — or nothing at all. */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The footer segments that actually have a value, in reading order.
 *
 * Returning parts instead of a joined string is what keeps a dangling `·` off
 * the end: the renderer puts separators BETWEEN parts, so an absent seller or a
 * single-instance store simply yields a shorter list. A blank string is treated
 * as absent — an empty segment would render as `Aguardando ·  · Comercial`.
 */
export function buildSummaryFooter(input: ISummaryFooterInput): ISummaryFooterPart[] {
  const parts: ISummaryFooterPart[] = [{ kind: "status", text: input.statusLabel }];

  const seller = clean(input.sellerName);
  if (seller) parts.push({ kind: "seller", text: seller });

  const instance = clean(input.instanceLabel);
  if (instance) parts.push({ kind: "instance", text: instance });

  return parts;
}
