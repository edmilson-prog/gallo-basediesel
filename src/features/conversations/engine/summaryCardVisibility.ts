/** Everything that decides whether an inbox row may open its summary card. */
export interface ISummaryCardVisibilityInput {
  /** This row is the conversation currently open in the viewer. */
  isSelected: boolean;
  /** The device has a real hovering, fine pointer — see `useHoverCapable`. */
  hoverCapable: boolean;
  /** The row is rendering a search match instead of the last message. */
  isMessageSearchResult: boolean;
}

/**
 * Whether the contact summary card may open for a row.
 *
 * Three gates, all of which must be open:
 *
 *  - **hover capability** — a card that only appears on hover is invisible on a
 *    touch device, and worse, a tap would fire the row's navigation anyway.
 *  - **not selected** — the attendant is already inside that conversation, so a
 *    summary of it is noise layered over the screen they are reading.
 *  - **not a message-search match** — in that mode the row shows the snippet
 *    that matched the search; a card showing the LAST message instead would
 *    contradict what sits right beside it.
 *
 * `prefers-reduced-motion` is deliberately NOT a gate: asking for less motion
 * means less animation, not less information. The card still opens, without the
 * transition.
 */
export function canShowSummaryCard(input: ISummaryCardVisibilityInput): boolean {
  if (!input.hoverCapable) return false;
  if (input.isSelected) return false;
  if (input.isMessageSearchResult) return false;
  return true;
}
