import { describe, it, expect } from "vitest";
import { buildAdTouchInput } from "./adTouch";

const BASE = {
  conversationId: "conv-1",
  messageId: "msg-1",
  occurredAt: "2026-08-18T14:09:00.000Z",
};

describe("buildAdTouchInput", () => {
  it("builds the touch when the referral carries a source id", () => {
    const input = buildAdTouchInput({
      ...BASE,
      referral: { sourceId: "120238998853430275", headline: "Filtro UFI" },
    });
    expect(input).toEqual({
      ...BASE,
      referral: { sourceId: "120238998853430275", headline: "Filtro UFI" },
    });
  });

  it("returns null when there is no referral", () => {
    expect(buildAdTouchInput({ ...BASE, referral: undefined })).toBeNull();
  });

  it("returns null when the referral has no source id", () => {
    expect(buildAdTouchInput({ ...BASE, referral: { headline: "Filtro UFI" } })).toBeNull();
  });

  it("returns null when the source id is only whitespace", () => {
    expect(buildAdTouchInput({ ...BASE, referral: { sourceId: "   " } })).toBeNull();
  });
});
