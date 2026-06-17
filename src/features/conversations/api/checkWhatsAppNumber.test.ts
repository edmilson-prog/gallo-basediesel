import { describe, expect, it } from "vitest";
import { classifyNumberCheck } from "./checkWhatsAppNumber";

describe("classifyNumberCheck", () => {
  it("maps exists=true to has_whatsapp with the canonical phone", () => {
    expect(classifyNumberCheck({ exists: true, canonicalPhone: "5554999998888" }, null)).toEqual({
      status: "has_whatsapp",
      canonicalPhone: "5554999998888",
    });
  });
  it("maps exists=false to no_whatsapp", () => {
    expect(classifyNumberCheck({ exists: false, canonicalPhone: null }, null)).toEqual({
      status: "no_whatsapp",
    });
  });
  it("any error code is a soft skip (never blocks)", () => {
    expect(classifyNumberCheck(null, "INSTANCE_OFFLINE")).toEqual({ status: "skipped" });
    expect(classifyNumberCheck(null, "UNSUPPORTED_PROVIDER")).toEqual({ status: "skipped" });
    expect(classifyNumberCheck(null, "UNKNOWN")).toEqual({ status: "skipped" });
  });
  it("no data and no error is a skip", () => {
    expect(classifyNumberCheck(null, null)).toEqual({ status: "skipped" });
  });
});
