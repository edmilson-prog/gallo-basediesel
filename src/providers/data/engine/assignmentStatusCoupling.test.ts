import { describe, it, expect } from "vitest";
import {
  TERMINAL_STATUSES,
  isTerminalStatus,
  statusOnAssign,
  statusOnUnassign,
  coupleManualStatusChange,
  reopenOnInbound,
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

describe("terminal axis", () => {
  it("treats resolvida and arquivada as terminal", () => {
    expect(isTerminalStatus("resolvida")).toBe(true);
    expect(isTerminalStatus("arquivada")).toBe(true);
    expect(isTerminalStatus("aguardando")).toBe(false);
    expect(isTerminalStatus("em_andamento")).toBe(false);
    expect(isTerminalStatus("aguardando_cliente")).toBe(false);
    expect([...TERMINAL_STATUSES].sort()).toEqual(["arquivada", "resolvida"]);
  });
});

describe("statusOnUnassign", () => {
  it("returns open conversations to the queue (aguardando)", () => {
    expect(statusOnUnassign("em_andamento")).toBe("aguardando");
    expect(statusOnUnassign("aguardando_cliente")).toBe("aguardando");
  });
  it("leaves BOTH terminals untouched — closed stays closed, no re-queue", () => {
    expect(statusOnUnassign("resolvida")).toBeNull();
    expect(statusOnUnassign("arquivada")).toBeNull();
  });
  it("aguardando is a no-op (already queued)", () => {
    expect(statusOnUnassign("aguardando")).toBeNull();
  });
});

describe("coupleManualStatusChange", () => {
  it("closes (strips the owner) when an owned conversation goes terminal", () => {
    expect(coupleManualStatusChange("resolvida", true)).toBe("close");
    expect(coupleManualStatusChange("arquivada", true)).toBe("close");
  });
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
    // unowned terminal has no owner to strip — no coupling
    expect(coupleManualStatusChange("resolvida", false)).toBeNull();
    expect(coupleManualStatusChange("arquivada", false)).toBeNull();
  });
});

describe("reopenOnInbound", () => {
  it("re-queues only terminals to aguardando", () => {
    expect(reopenOnInbound("resolvida")).toBe("aguardando");
    expect(reopenOnInbound("arquivada")).toBe("aguardando");
  });
  it("leaves open statuses untouched", () => {
    expect(reopenOnInbound("aguardando")).toBeNull();
    expect(reopenOnInbound("em_andamento")).toBeNull();
    expect(reopenOnInbound("aguardando_cliente")).toBeNull();
  });
});
