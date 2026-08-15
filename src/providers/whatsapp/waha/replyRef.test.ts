import { describe, expect, it } from "vitest";
import {
  QUOTED_TEXT_MAX,
  matchesProviderMessageId,
  pickReplyMatch,
  truncateQuotedText,
} from "./replyRef";

describe("matchesProviderMessageId", () => {
  it("matches the raw hash against the serialized id suffix (@c.us)", () => {
    expect(
      matchesProviderMessageId(
        "false_5555912345678@c.us_3A5AC1F1D8E39EF06FF4",
        "3A5AC1F1D8E39EF06FF4",
      ),
    ).toBe(true);
  });

  it("matches on a lid-addressed chat", () => {
    expect(
      matchesProviderMessageId(
        "true_255224270876679@lid_3EB0CA488EE47B77A23CC4",
        "3EB0CA488EE47B77A23CC4",
      ),
    ).toBe(true);
  });

  // Guards the whole feature: without the "_" the longer hash below would be
  // accepted as a match and the quote would point at the WRONG message.
  it("rejects a suffix that is not preceded by the separator", () => {
    expect(
      matchesProviderMessageId(
        "false_5555912345678@c.us_AAA3A5AC1F1D8E39EF06FF4",
        "3A5AC1F1D8E39EF06FF4",
      ),
    ).toBe(false);
  });

  it("rejects a different hash", () => {
    expect(matchesProviderMessageId("false_5555912345678@c.us_ABC", "XYZ")).toBe(false);
  });

  it("rejects empty inputs instead of matching everything", () => {
    expect(matchesProviderMessageId("", "ABC")).toBe(false);
    expect(matchesProviderMessageId("false_5555912345678@c.us_ABC", "")).toBe(false);
  });
});

describe("pickReplyMatch", () => {
  const rows = [
    { id: "m1", provider_message_id: "false_5555912345678@c.us_AAABBB" },
    { id: "m2", provider_message_id: "false_5555912345678@c.us_BBB" },
    { id: "m3", provider_message_id: null },
  ];

  it("picks the row whose serialized id ends with _<rawId>", () => {
    expect(pickReplyMatch(rows, "BBB")?.id).toBe("m2");
  });

  it("returns undefined when no row matches exactly", () => {
    expect(pickReplyMatch(rows, "CCC")).toBeUndefined();
  });

  it("skips rows without a provider id", () => {
    expect(pickReplyMatch([{ id: "m3", provider_message_id: null }], "BBB")).toBeUndefined();
  });
});

describe("truncateQuotedText", () => {
  it("keeps a short text untouched", () => {
    expect(truncateQuotedText("Tem o filtro de óleo do Volvo FH?")).toBe(
      "Tem o filtro de óleo do Volvo FH?",
    );
  });

  it("truncates a long text at a word boundary and appends an ellipsis", () => {
    const long = `${"palavra ".repeat(60)}fim`;
    const result = truncateQuotedText(long) ?? "";
    expect(result.length).toBeLessThanOrEqual(QUOTED_TEXT_MAX + 1);
    expect(result.endsWith("…")).toBe(true);
    expect(result).not.toContain("palavr…");
  });

  it("returns undefined for empty, blank or missing text", () => {
    expect(truncateQuotedText(undefined)).toBeUndefined();
    expect(truncateQuotedText(null)).toBeUndefined();
    expect(truncateQuotedText("   ")).toBeUndefined();
  });
});
