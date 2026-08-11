import { describe, expect, it } from "vitest";
import { shouldShowInstallScreen } from "./installGate";

describe("shouldShowInstallScreen", () => {
  it("shows on a first visit in a browser tab", () => {
    expect(shouldShowInstallScreen({ isStandalone: false, seenMarker: null })).toBe(true);
  });

  it("never shows once the app runs from the home screen", () => {
    expect(shouldShowInstallScreen({ isStandalone: true, seenMarker: null })).toBe(false);
  });

  it("never shows again once the user walked past it", () => {
    expect(shouldShowInstallScreen({ isStandalone: false, seenMarker: "1" })).toBe(false);
  });
});
