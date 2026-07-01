import { describe, it, expect } from "vitest";
import { actionForTransition } from "./statusAuditAction";

describe("actionForTransition", () => {
  it("labels a transition into resolvida as conversation.resolve", () => {
    expect(actionForTransition("em_andamento", "resolvida")).toBe("conversation.resolve");
  });

  it("labels a transition out of resolvida (reopen) as conversation.resolve", () => {
    expect(actionForTransition("resolvida", "em_andamento")).toBe("conversation.resolve");
  });

  it("labels a transition into arquivada as conversation.archive", () => {
    expect(actionForTransition("em_andamento", "arquivada")).toBe("conversation.archive");
  });

  it("labels a transition out of arquivada (unarchive) as conversation.archive", () => {
    expect(actionForTransition("arquivada", "em_andamento")).toBe("conversation.archive");
  });

  it("labels resolvida -> arquivada as conversation.archive, not conversation.resolve", () => {
    expect(actionForTransition("resolvida", "arquivada")).toBe("conversation.archive");
  });

  it("labels arquivada -> resolvida as conversation.archive (leaving archived is the primary event)", () => {
    expect(actionForTransition("arquivada", "resolvida")).toBe("conversation.archive");
  });

  it("returns undefined for a transition touching neither resolvida nor arquivada", () => {
    expect(actionForTransition("aguardando", "em_andamento")).toBeUndefined();
  });
});
