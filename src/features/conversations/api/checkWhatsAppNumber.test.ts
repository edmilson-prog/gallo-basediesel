import { describe, expect, it } from "vitest";
import { classifyNumberCheck, resolveNumberCheckWithNineDigitFallback, type IEdgeResponse } from "./checkWhatsAppNumber";

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
  it("fails open to skipped on a malformed 200 body (no boolean exists)", () => {
    expect(classifyNumberCheck({ canonicalPhone: null } as unknown as IEdgeResponse, null)).toEqual({
      status: "skipped",
    });
  });
});

describe("resolveNumberCheckWithNineDigitFallback", () => {
  it("returns the first result as-is when it's already has_whatsapp", async () => {
    const check = async () => ({ status: "has_whatsapp" as const, canonicalPhone: "5554981572275" });
    const result = await resolveNumberCheckWithNineDigitFallback("acc-1", "5554981572275", check);
    expect(result).toEqual({ status: "has_whatsapp", canonicalPhone: "5554981572275" });
  });

  it("retries with the 9th-digit candidate when the first check is no_whatsapp on a 12-digit number", async () => {
    const calls: string[] = [];
    const check = async (_accountId: string, phoneDigits: string) => {
      calls.push(phoneDigits);
      if (phoneDigits === "5554981572275") {
        return { status: "has_whatsapp" as const, canonicalPhone: "5554981572275" };
      }
      return { status: "no_whatsapp" as const };
    };
    const result = await resolveNumberCheckWithNineDigitFallback("acc-1", "555481572275", check);
    expect(calls).toEqual(["555481572275", "5554981572275"]);
    expect(result).toEqual({ status: "has_whatsapp", canonicalPhone: "5554981572275" });
  });

  it("retries with the 9th-digit candidate when the first check is skipped on a 12-digit number", async () => {
    const calls: string[] = [];
    const check = async (_accountId: string, phoneDigits: string) => {
      calls.push(phoneDigits);
      if (phoneDigits === "5554981572275") {
        return { status: "has_whatsapp" as const, canonicalPhone: "5554981572275" };
      }
      return { status: "skipped" as const };
    };
    const result = await resolveNumberCheckWithNineDigitFallback("acc-1", "555481572275", check);
    expect(calls).toEqual(["555481572275", "5554981572275"]);
    expect(result).toEqual({ status: "has_whatsapp", canonicalPhone: "5554981572275" });
  });

  it("falls back to the original result when the candidate also fails", async () => {
    const calls: string[] = [];
    const check = async (_accountId: string, phoneDigits: string) => {
      calls.push(phoneDigits);
      // Original call returns skipped
      if (phoneDigits === "555481572275") {
        return { status: "skipped" as const };
      }
      // Candidate call returns no_whatsapp
      return { status: "no_whatsapp" as const };
    };
    const result = await resolveNumberCheckWithNineDigitFallback("acc-1", "555481572275", check);
    expect(calls).toEqual(["555481572275", "5554981572275"]);
    // The result should be the ORIGINAL (first) result, not the retry's
    expect(result).toEqual({ status: "skipped" });
  });

  it("does not retry a 13-digit number (no ambiguous candidate)", async () => {
    let calls = 0;
    const check = async () => {
      calls += 1;
      return { status: "no_whatsapp" as const };
    };
    await resolveNumberCheckWithNineDigitFallback("acc-1", "5554981572275", check);
    expect(calls).toBe(1);
  });
});
