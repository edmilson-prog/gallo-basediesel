import { describe, expect, it } from "vitest";
import { leadPatchToRow } from "./leads";

describe("leadPatchToRow", () => {
  it("clears email to null when the patch sets it to undefined", () => {
    expect(leadPatchToRow({ email: undefined })).toEqual({ email: null });
  });

  it("clears estimatedValue to null when the patch sets it to undefined", () => {
    expect(leadPatchToRow({ estimatedValue: undefined })).toEqual({ estimated_value: null });
  });

  it("clears nextActionAt to null when the patch sets it to undefined", () => {
    expect(leadPatchToRow({ nextActionAt: undefined })).toEqual({ next_action_at: null });
  });

  it("writes concrete values for email and estimatedValue", () => {
    expect(leadPatchToRow({ email: "a@b.com", estimatedValue: 500 })).toEqual({
      email: "a@b.com",
      estimated_value: 500,
    });
  });

  it("still handles untouched fields like temperature", () => {
    expect(leadPatchToRow({ temperature: "quente" })).toEqual({ temperature: "quente" });
  });

  it("emits no spurious keys for an empty patch", () => {
    expect(leadPatchToRow({})).toEqual({});
  });
});
