import { describe, it, expect } from "vitest";
import { countActiveFilters } from "../useMediaFilters";
import type { IMediaFilterState, MediaFilterScope } from "../useMediaFilters";

const EMPTY: IMediaFilterState = {
  search: "",
  kind: "all",
  authorType: "all",
  period: "all",
  classification: "all",
};

describe("countActiveFilters", () => {
  it("(a) returns 0 when all filters are at their defaults (EMPTY)", () => {
    expect(countActiveFilters(EMPTY, "conversation")).toBe(0);
    expect(countActiveFilters(EMPTY, "customer")).toBe(0);
  });

  it("(b) increments by 1 when kind is set to a non-default value", () => {
    expect(countActiveFilters({ ...EMPTY, kind: "image" }, "conversation")).toBe(1);
    expect(countActiveFilters({ ...EMPTY, kind: "audio" }, "customer")).toBe(1);
  });

  it("(b) increments by 1 when authorType is set to a non-default value", () => {
    expect(countActiveFilters({ ...EMPTY, authorType: "customer" }, "conversation")).toBe(1);
    expect(countActiveFilters({ ...EMPTY, authorType: "agent" }, "customer")).toBe(1);
  });

  it("(b) increments by 1 when period is set to a non-default value", () => {
    expect(countActiveFilters({ ...EMPTY, period: "7d" }, "conversation")).toBe(1);
    expect(countActiveFilters({ ...EMPTY, period: "30d" }, "customer")).toBe(1);
    expect(countActiveFilters({ ...EMPTY, period: "90d" }, "conversation")).toBe(1);
  });

  it("(c) increments by 1 for classification only when scope === 'customer'", () => {
    expect(
      countActiveFilters({ ...EMPTY, classification: "document" }, "customer"),
    ).toBe(1);
  });

  it("(c) does NOT increment for classification when scope === 'conversation'", () => {
    expect(
      countActiveFilters({ ...EMPTY, classification: "document" }, "conversation"),
    ).toBe(0);
  });

  it("(d) never increments activeCount for the search/free-text field", () => {
    expect(countActiveFilters({ ...EMPTY, search: "hello world" }, "conversation")).toBe(0);
    expect(countActiveFilters({ ...EMPTY, search: "test" }, "customer")).toBe(0);
  });

  it("accumulates correctly across multiple active filters", () => {
    const allSet: IMediaFilterState = {
      search: "ignored",
      kind: "video",
      authorType: "agent",
      period: "30d",
      classification: "document",
    };
    // scope=customer: kind + authorType + period + classification = 4
    expect(countActiveFilters(allSet, "customer")).toBe(4);
    // scope=conversation: kind + authorType + period = 3 (classification ignored)
    expect(countActiveFilters(allSet, "conversation")).toBe(3);
  });
});
