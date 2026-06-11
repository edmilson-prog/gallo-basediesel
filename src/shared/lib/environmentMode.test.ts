import { describe, expect, it } from "vitest";
import { parseSourceMode, presetOf, presetSources, resolveSourceMode } from "./environmentMode";

describe("parseSourceMode", () => {
  it("accepts the two valid modes", () => {
    expect(parseSourceMode("mock")).toBe("mock");
    expect(parseSourceMode("supabase")).toBe("supabase");
  });

  it("rejects anything else", () => {
    expect(parseSourceMode("")).toBeNull();
    expect(parseSourceMode(null)).toBeNull();
    expect(parseSourceMode(undefined)).toBeNull();
    expect(parseSourceMode("Supabase")).toBeNull();
    expect(parseSourceMode("prod")).toBeNull();
  });
});

describe("resolveSourceMode", () => {
  it("override wins over env", () => {
    expect(resolveSourceMode("mock", "supabase")).toBe("supabase");
    expect(resolveSourceMode("supabase", "mock")).toBe("mock");
  });

  it("falls back to a valid env when there is no override", () => {
    expect(resolveSourceMode("supabase", null)).toBe("supabase");
    expect(resolveSourceMode("mock", null)).toBe("mock");
  });

  it("defaults to mock when env is absent or invalid", () => {
    expect(resolveSourceMode(undefined, null)).toBe("mock");
    expect(resolveSourceMode("banana", null)).toBe("mock");
  });
});

describe("presetOf", () => {
  it("maps the two aligned combinations", () => {
    expect(presetOf("supabase", "supabase")).toBe("production");
    expect(presetOf("mock", "mock")).toBe("demo");
  });

  it("flags mixed combinations as custom", () => {
    expect(presetOf("mock", "supabase")).toBe("custom");
    expect(presetOf("supabase", "mock")).toBe("custom");
  });
});

describe("presetSources", () => {
  it("expands presets to their dimensions and round-trips through presetOf", () => {
    const production = presetSources("production");
    expect(production).toEqual({ data: "supabase", auth: "supabase" });
    expect(presetOf(production.data, production.auth)).toBe("production");

    const demo = presetSources("demo");
    expect(demo).toEqual({ data: "mock", auth: "mock" });
    expect(presetOf(demo.data, demo.auth)).toBe("demo");
  });
});
