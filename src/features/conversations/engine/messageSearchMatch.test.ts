import { describe, expect, it } from "vitest";
import { selectMessageMatch } from "./messageSearchMatch";

const msg = (text: string, sentAt: string, direction: "in" | "out" = "in") => ({
  text,
  sentAt,
  direction,
});

describe("selectMessageMatch", () => {
  it("returns null when the term is empty or whitespace-only", () => {
    const messages = [msg("Ramon vai levar", "2026-06-01T10:00:00.000Z")];
    expect(selectMessageMatch(messages, "")).toBeNull();
    expect(selectMessageMatch(messages, "   ")).toBeNull();
  });

  it("returns null when no message matches", () => {
    const messages = [msg("bom dia", "2026-06-01T10:00:00.000Z")];
    expect(selectMessageMatch(messages, "ramon")).toBeNull();
  });

  it("matches case-insensitively and returns the message fields", () => {
    const messages = [msg("Chama o Ramon e o colega", "2026-06-18T09:00:00.000Z", "in")];
    const result = selectMessageMatch(messages, "ramon");
    expect(result).toEqual({
      text: "Chama o Ramon e o colega",
      sentAt: "2026-06-18T09:00:00.000Z",
      direction: "in",
      extraMatchCount: 0,
    });
  });

  it("picks the MOST RECENT matching message as representative", () => {
    const messages = [
      msg("Ramon foi levar ontem", "2026-06-10T08:00:00.000Z"),
      msg("Ramon está aqui agora", "2026-06-20T08:00:00.000Z"),
      msg("sem termo nenhum", "2026-06-25T08:00:00.000Z"),
    ];
    const result = selectMessageMatch(messages, "ramon");
    expect(result?.text).toBe("Ramon está aqui agora");
    expect(result?.sentAt).toBe("2026-06-20T08:00:00.000Z");
  });

  it("counts the OTHER matching messages via extraMatchCount", () => {
    const messages = [
      msg("Ramon 1", "2026-06-01T08:00:00.000Z"),
      msg("Ramon 2", "2026-06-05T08:00:00.000Z"),
      msg("Ramon 3", "2026-06-10T08:00:00.000Z"),
    ];
    const result = selectMessageMatch(messages, "ramon");
    expect(result?.text).toBe("Ramon 3");
    expect(result?.extraMatchCount).toBe(2);
  });

  it("reports direction=out for a matching message sent by the attendant", () => {
    const messages = [msg("pro ramon manda", "2026-06-18T09:00:00.000Z", "out")];
    const result = selectMessageMatch(messages, "ramon");
    expect(result?.direction).toBe("out");
  });
});
