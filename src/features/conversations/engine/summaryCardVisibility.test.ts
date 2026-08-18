import { describe, it, expect } from "vitest";
import { canShowSummaryCard, type ISummaryCardVisibilityInput } from "./summaryCardVisibility";

const OPEN: ISummaryCardVisibilityInput = {
  isSelected: false,
  hoverCapable: true,
  isMessageSearchResult: false,
};

describe("canShowSummaryCard", () => {
  it("opens on a plain, unselected row of a hover-capable device", () => {
    expect(canShowSummaryCard(OPEN)).toBe(true);
  });

  it("never opens without a real hovering pointer", () => {
    expect(canShowSummaryCard({ ...OPEN, hoverCapable: false })).toBe(false);
  });

  it("never opens on the row already open in the viewer", () => {
    expect(canShowSummaryCard({ ...OPEN, isSelected: true })).toBe(false);
  });

  it("never opens while the row renders a message-search match", () => {
    // The row shows the MATCHED snippet there; a card showing the LAST message
    // would contradict what sits right next to it.
    expect(canShowSummaryCard({ ...OPEN, isMessageSearchResult: true })).toBe(false);
  });

  it("stays closed when several gates are shut at once", () => {
    expect(
      canShowSummaryCard({ isSelected: true, hoverCapable: false, isMessageSearchResult: true }),
    ).toBe(false);
  });
});
