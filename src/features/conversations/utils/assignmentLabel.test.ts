import { describe, it, expect } from "vitest";
import { assignmentTriggerLabel } from "./assignmentLabel";
import type { ISeller } from "@/shared/types";

const STRINGS = {
  me: "Atribuídas a mim",
  queue: "Em fila",
  all: "Todas",
  seller: "Por vendedor",
  selectedCount: (n: number) => `${n} selecionados`,
};
const SELLERS = [{ id: "s1", fullName: "Lucas Costa" }] as ISeller[];

describe("assignmentTriggerLabel", () => {
  it("shows 'Todas' for the empty set", () => {
    expect(assignmentTriggerLabel([], SELLERS, STRINGS)).toBe("Todas");
  });
  it("shows the single token label", () => {
    expect(assignmentTriggerLabel(["me"], SELLERS, STRINGS)).toBe("Atribuídas a mim");
    expect(assignmentTriggerLabel(["queue"], SELLERS, STRINGS)).toBe("Em fila");
    expect(assignmentTriggerLabel(["s1"], SELLERS, STRINGS)).toBe("Lucas Costa");
  });
  it("falls back to the seller label when the id is unknown", () => {
    expect(assignmentTriggerLabel(["s9"], SELLERS, STRINGS)).toBe("Por vendedor");
  });
  it("shows the count for 2+", () => {
    expect(assignmentTriggerLabel(["me", "queue"], SELLERS, STRINGS)).toBe("2 selecionados");
  });
});
