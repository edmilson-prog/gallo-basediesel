import { describe, expect, it } from "vitest";
import type { IAuditLog } from "@/shared/types";
import { describeLeadAudit } from "./leadHistory";

function entry(action: string, before?: unknown, after?: unknown): IAuditLog {
  return {
    id: "a1",
    actorId: "s1",
    action,
    resource: "lead",
    resourceId: "lead-1",
    before,
    after,
    timestamp: "2026-07-20T12:00:00.000Z",
    storeId: "store-1",
  };
}

describe("describeLeadAudit", () => {
  it("titles known lifecycle actions with an icon", () => {
    expect(describeLeadAudit(entry("lead.created")).title).toBe("Lead criado");
    expect(describeLeadAudit(entry("lead.converted")).icon).toBeTruthy();
  });

  it("renders a temperature change by label", () => {
    const r = describeLeadAudit(
      entry("lead.updated", { temperature: "morno" }, { temperature: "quente" }),
    );
    expect(r.lines).toContain("Temperatura: Morno → Quente");
  });

  it("renders an estimated value change in BRL", () => {
    const r = describeLeadAudit(
      entry("lead.updated", { estimatedValue: undefined }, { estimatedValue: 1500 }),
    );
    expect(r.lines.some((l) => l.includes("Valor estimado") && l.includes("1.500"))).toBe(true);
  });

  it("renders tags as added/removed", () => {
    const r = describeLeadAudit(
      entry("lead.updated", { tags: ["Volvo FH"] }, { tags: ["Volvo FH", "Scania"] }),
    );
    expect(r.lines).toContain("Tags: + Scania");
  });

  it("degrades an unknown field to key: value without throwing", () => {
    const r = describeLeadAudit(entry("lead.updated", { mystery: "a" }, { mystery: "b" }));
    expect(r.lines).toContain("mystery: a → b");
  });

  it("never throws on missing before/after", () => {
    expect(() => describeLeadAudit(entry("lead.updated"))).not.toThrow();
  });
});
