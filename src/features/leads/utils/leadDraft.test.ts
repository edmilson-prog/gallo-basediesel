import { describe, expect, it } from "vitest";
import type { ILead } from "@/shared/types";
import {
  addTag,
  buildLeadPatch,
  normalizeTag,
  toLeadDraft,
  validateLeadDraft,
} from "./leadDraft";

const lead: ILead = {
  id: "lead-1",
  storeId: "store-1",
  sellerId: null,
  name: "Alexandre",
  phone: "+5538988700405",
  email: undefined,
  stage: { id: "stage-novo", name: "Novo", order: 1, color: "#5b6b7a" },
  temperature: "morno",
  origin: "whatsapp",
  estimatedValue: undefined,
  nextActionAt: undefined,
  conversations: [],
  tags: ["Frota pesada"],
  createdAt: "2026-07-20T12:00:00.000Z",
  updatedAt: "2026-07-20T12:00:00.000Z",
};

describe("toLeadDraft", () => {
  it("maps a lead to editable form strings", () => {
    const d = toLeadDraft({ ...lead, estimatedValue: 1500, nextActionAt: "2026-07-25T00:00:00.000Z", email: "a@b.com" });
    expect(d).toEqual({
      temperature: "morno",
      estimatedValue: "1500",
      nextActionAt: "2026-07-25",
      email: "a@b.com",
      tags: ["Frota pesada"],
    });
  });
  it("uses empty strings for absent optional fields", () => {
    const d = toLeadDraft(lead);
    expect(d.estimatedValue).toBe("");
    expect(d.nextActionAt).toBe("");
    expect(d.email).toBe("");
  });
});

describe("normalizeTag / addTag", () => {
  it("trims and collapses inner whitespace", () => {
    expect(normalizeTag("  Volvo   FH  ")).toBe("Volvo FH");
  });
  it("adds a new tag; ignores blank and case-insensitive duplicate", () => {
    expect(addTag(["Volvo FH"], "Scania")).toEqual(["Volvo FH", "Scania"]);
    expect(addTag(["Volvo FH"], "  ")).toEqual(["Volvo FH"]);
    expect(addTag(["Volvo FH"], "volvo fh")).toEqual(["Volvo FH"]);
  });
});

describe("validateLeadDraft", () => {
  it("passes on a clean draft", () => {
    expect(validateLeadDraft(toLeadDraft(lead))).toEqual({});
  });
  it("flags a non-numeric estimated value", () => {
    expect(validateLeadDraft({ ...toLeadDraft(lead), estimatedValue: "abc" }).estimatedValue).toBeTruthy();
  });
  it("flags a malformed email but accepts empty", () => {
    expect(validateLeadDraft({ ...toLeadDraft(lead), email: "not-an-email" }).email).toBeTruthy();
    expect(validateLeadDraft({ ...toLeadDraft(lead), email: "" }).email).toBeUndefined();
  });
});

describe("buildLeadPatch", () => {
  it("returns only changed fields", () => {
    const d = { ...toLeadDraft(lead), temperature: "quente" as const };
    expect(buildLeadPatch(lead, d)).toEqual({ temperature: "quente" });
  });
  it("parses value with comma decimal and normalizes email/tags", () => {
    const d = { ...toLeadDraft(lead), estimatedValue: "1.234,50", email: "  A@B.com ", tags: ["Frota pesada", "Scania"] };
    expect(buildLeadPatch(lead, d)).toEqual({
      estimatedValue: 1234.5,
      email: "a@b.com",
      tags: ["Frota pesada", "Scania"],
    });
  });
  it("clears an emptied estimated value / email to undefined", () => {
    const withValues = { ...lead, estimatedValue: 500, email: "x@y.com" };
    const d = { ...toLeadDraft(withValues), estimatedValue: "", email: "" };
    expect(buildLeadPatch(withValues, d)).toEqual({ estimatedValue: undefined, email: undefined });
  });
  it("does not corrupt an unedited decimal estimated value on round-trip", () => {
    const withDecimal = { ...lead, estimatedValue: 1500.5 };
    const d = { ...toLeadDraft(withDecimal), temperature: "quente" as const };
    expect(buildLeadPatch(withDecimal, d)).toEqual({ temperature: "quente" });
  });
  it("does not silently wipe the value on unparsable non-empty input", () => {
    const withValues = { ...lead, estimatedValue: 500 };
    const d = { ...toLeadDraft(withValues), estimatedValue: "abc" };
    const patch = buildLeadPatch(withValues, d);
    expect(patch).toEqual({});
    // toEqual alone treats { estimatedValue: undefined } as equal to {}, so
    // assert the key is truly absent (no accidental clear) as well.
    expect(patch).not.toHaveProperty("estimatedValue");
  });
});
