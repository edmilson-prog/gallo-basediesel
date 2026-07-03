import { describe, it, expect } from "vitest";
import {
  statusOnAssign,
  statusOnUnassign,
  coupleManualStatusChange,
} from "./assignmentStatusCoupling";

describe("statusOnAssign", () => {
  it("advances a queued conversation to em_andamento", () => {
    expect(statusOnAssign("aguardando")).toBe("em_andamento");
  });
  it("never touches other statuses (no-op → null)", () => {
    expect(statusOnAssign("em_andamento")).toBeNull();
    expect(statusOnAssign("aguardando_cliente")).toBeNull();
    expect(statusOnAssign("resolvida")).toBeNull();
    expect(statusOnAssign("arquivada")).toBeNull();
  });
});

describe("statusOnUnassign", () => {
  it("returns open conversations to the queue (aguardando)", () => {
    expect(statusOnUnassign("em_andamento")).toBe("aguardando");
    expect(statusOnUnassign("aguardando_cliente")).toBe("aguardando");
  });
  it("re-opens a resolved conversation into the queue", () => {
    expect(statusOnUnassign("resolvida")).toBe("aguardando");
  });
  it("never touches the archive axis, and aguardando is a no-op", () => {
    expect(statusOnUnassign("arquivada")).toBeNull();
    expect(statusOnUnassign("aguardando")).toBeNull();
  });
});

describe("coupleManualStatusChange", () => {
  it("assigns the actor when an unowned conversation is moved to an owned status", () => {
    expect(coupleManualStatusChange("em_andamento", false)).toBe("assign-self");
    expect(coupleManualStatusChange("aguardando_cliente", false)).toBe("assign-self");
  });
  it("unassigns when an owned conversation is moved back to aguardando", () => {
    expect(coupleManualStatusChange("aguardando", true)).toBe("unassign");
  });
  it("does nothing on the remaining combinations", () => {
    expect(coupleManualStatusChange("aguardando", false)).toBeNull();
    expect(coupleManualStatusChange("em_andamento", true)).toBeNull();
    expect(coupleManualStatusChange("aguardando_cliente", true)).toBeNull();
    expect(coupleManualStatusChange("resolvida", false)).toBeNull();
    expect(coupleManualStatusChange("resolvida", true)).toBeNull();
    expect(coupleManualStatusChange("arquivada", false)).toBeNull();
    expect(coupleManualStatusChange("arquivada", true)).toBeNull();
  });
});
