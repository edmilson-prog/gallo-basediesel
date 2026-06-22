import { describe, expect, it } from "vitest";
import { normalizePath, resolveTourForPath, shouldAutoStart } from "./tourResolution";
import type { TourDef } from "../types";

const TOURS: TourDef[] = [
  { key: "atendimento-inbox", kind: "rich", label: "Atendimento", route: "/app/atendimento", steps: [] },
  { key: "atendimento-conversa", kind: "rich", label: "Conversa", matchPrefix: "/app/atendimento/", steps: [] },
  { key: "welcome-clientes", kind: "welcome", label: "Clientes", route: "/app/clientes", steps: [] },
];

describe("normalizePath", () => {
  it("strips a single trailing slash but keeps root", () => {
    expect(normalizePath("/app/clientes/")).toBe("/app/clientes");
    expect(normalizePath("/app/clientes")).toBe("/app/clientes");
    expect(normalizePath("/")).toBe("/");
  });
});

describe("resolveTourForPath", () => {
  it("matches an exact route", () => {
    expect(resolveTourForPath("/app/clientes", TOURS)?.key).toBe("welcome-clientes");
  });

  it("prefers exact over prefix for the inbox landing", () => {
    expect(resolveTourForPath("/app/atendimento", TOURS)?.key).toBe("atendimento-inbox");
  });

  it("uses the prefix for an open conversation", () => {
    expect(resolveTourForPath("/app/atendimento/abc123", TOURS)?.key).toBe("atendimento-conversa");
  });

  it("normalizes trailing slashes before matching", () => {
    expect(resolveTourForPath("/app/atendimento/", TOURS)?.key).toBe("atendimento-inbox");
  });

  it("returns null when nothing matches", () => {
    expect(resolveTourForPath("/app/clientes/42", TOURS)).toBeNull();
  });
});

describe("shouldAutoStart", () => {
  it("starts only when not seen and not opted out", () => {
    expect(shouldAutoStart({ optOut: false, seen: false })).toBe(true);
    expect(shouldAutoStart({ optOut: true, seen: false })).toBe(false);
    expect(shouldAutoStart({ optOut: false, seen: true })).toBe(false);
  });
});
