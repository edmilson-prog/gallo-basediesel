import { describe, expect, it } from "vitest";
import { sellerFormSchema, showRegionField } from "./sellerForm";

describe("sellerFormSchema", () => {
  const valid = {
    fullName: "Maria Souza",
    email: "MARIA@Example.com",
    phone: "",
    type: "internal" as const,
    region: "",
  };

  it("accepts a valid payload and normalizes the email", () => {
    const parsed = sellerFormSchema.parse(valid);
    expect(parsed.email).toBe("maria@example.com");
  });

  it("rejects fullName shorter than 3 chars", () => {
    expect(sellerFormSchema.safeParse({ ...valid, fullName: "Jo" }).success).toBe(false);
  });

  it("rejects whitespace-only fullName", () => {
    expect(sellerFormSchema.safeParse({ ...valid, fullName: "   " }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(sellerFormSchema.safeParse({ ...valid, email: "nao-eh-email" }).success).toBe(false);
  });

  it("rejects an unknown type", () => {
    expect(sellerFormSchema.safeParse({ ...valid, type: "gerente" }).success).toBe(false);
  });

  it("accepts an optional departmentId and keeps it absent when omitted", () => {
    const withoutDept = sellerFormSchema.parse(valid);
    expect(withoutDept.departmentId).toBeUndefined();

    const withDept = sellerFormSchema.parse({ ...valid, departmentId: "dept-123" });
    expect(withDept.departmentId).toBe("dept-123");
  });
});

describe("showRegionField", () => {
  it("hides region for internal sellers", () => {
    expect(showRegionField("internal")).toBe(false);
  });
  it("shows region for external and representative", () => {
    expect(showRegionField("external")).toBe(true);
    expect(showRegionField("representative")).toBe(true);
  });
});
