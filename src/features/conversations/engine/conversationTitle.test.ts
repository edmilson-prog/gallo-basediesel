import { describe, expect, it } from "vitest";
import { resolveConversationTitle } from "./conversationTitle";

describe("resolveConversationTitle", () => {
  it("leads with the person and trails with the company", () => {
    expect(
      resolveConversationTitle({
        name: "GRASIELE GS VARASCHINI",
        isPhoneName: false,
        companyName: "AUTO ELETRICA DO RODRIGO",
      }),
    ).toEqual({ primary: "GRASIELE GS VARASCHINI", secondary: "AUTO ELETRICA DO RODRIGO" });
  });

  it("shows the person alone when there is no company", () => {
    expect(resolveConversationTitle({ name: "JOÃO MECÂNICO", isPhoneName: false })).toEqual({
      primary: "JOÃO MECÂNICO",
      secondary: null,
    });
  });

  it("inverts when the contact was never named: company leads, number trails", () => {
    expect(
      resolveConversationTitle({
        name: "+55 46 3555-1200",
        isPhoneName: true,
        companyName: "AUTO ELETRICA DO RODRIGO",
        phone: "+55 46 3555-1200",
      }),
    ).toEqual({ primary: "AUTO ELETRICA DO RODRIGO", secondary: "+55 46 3555-1200" });
  });

  it("falls back to the name when an unnamed contact has no phone to trail", () => {
    expect(
      resolveConversationTitle({
        name: "+55 46 3555-1200",
        isPhoneName: true,
        companyName: "AUTO ELETRICA DO RODRIGO",
      }),
    ).toEqual({ primary: "AUTO ELETRICA DO RODRIGO", secondary: "+55 46 3555-1200" });
  });

  it("never renders the company twice when it also resolved the name", () => {
    // A conversation with no linked person takes its name FROM the company —
    // "ACME · ACME" would be the result of appending it blindly.
    expect(
      resolveConversationTitle({
        name: "AUTO ELETRICA DO RODRIGO",
        isPhoneName: false,
        companyName: "AUTO ELETRICA DO RODRIGO",
      }),
    ).toEqual({ primary: "AUTO ELETRICA DO RODRIGO", secondary: null });
  });

  it("catches the duplicate even when the two differ only in case", () => {
    expect(
      resolveConversationTitle({
        name: "Auto Elétrica do Rodrigo",
        isPhoneName: false,
        companyName: "AUTO ELÉTRICA DO RODRIGO",
      }).secondary,
    ).toBeNull();
  });

  it("treats an all-blank company as no company", () => {
    expect(
      resolveConversationTitle({
        name: "GRASIELE",
        isPhoneName: false,
        companyName: "   ",
      }),
    ).toEqual({ primary: "GRASIELE", secondary: null });
  });

  it("trims both halves", () => {
    expect(
      resolveConversationTitle({
        name: "  GRASIELE  ",
        isPhoneName: false,
        companyName: "  AUTO ELETRICA  ",
      }),
    ).toEqual({ primary: "GRASIELE", secondary: "AUTO ELETRICA" });
  });
});
