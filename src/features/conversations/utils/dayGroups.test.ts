import { describe, it, expect } from "vitest";
import type { IMessage, IConversationNote, IAdReferral } from "@/shared/types";
import { buildThreadRows, prependAdReferralRow } from "./dayGroups";

const NOW = new Date("2026-06-14T18:00:00.000Z");

function msg(id: string, sentAt: string): IMessage {
  return { id, sentAt } as IMessage;
}
function note(id: string, createdAt: string): IConversationNote {
  return { id, createdAt } as IConversationNote;
}

describe("buildThreadRows", () => {
  it("interleaves messages and notes chronologically with a single day separator", () => {
    const rows = buildThreadRows(
      [msg("m1", "2026-06-14T10:00:00.000Z"), msg("m2", "2026-06-14T12:00:00.000Z")],
      [note("n1", "2026-06-14T11:00:00.000Z")],
      NOW,
    );
    expect(rows.map((r) => r.kind)).toEqual(["day", "message", "note", "message"]);
    expect(rows[1]).toMatchObject({ kind: "message", id: "m1" });
    expect(rows[2]).toMatchObject({ kind: "note", id: "note-n1" });
    expect(rows[3]).toMatchObject({ kind: "message", id: "m2" });
  });

  it("adds a new day separator when the day changes", () => {
    const rows = buildThreadRows(
      [msg("m1", "2026-06-13T12:00:00.000Z")],
      [note("n1", "2026-06-14T12:00:00.000Z")],
      NOW,
    );
    expect(rows.map((r) => r.kind)).toEqual(["day", "message", "day", "note"]);
  });

  it("returns an empty array when there is nothing", () => {
    expect(buildThreadRows([], [], NOW)).toEqual([]);
  });

  it("renders notes even when there are no messages", () => {
    const rows = buildThreadRows([], [note("n1", "2026-06-14T12:00:00.000Z")], NOW);
    expect(rows.map((r) => r.kind)).toEqual(["day", "note"]);
    expect(rows[1]).toMatchObject({ kind: "note", id: "note-n1" });
  });
});

describe("prependAdReferralRow", () => {
  const REFERRAL: IAdReferral = {
    headline: "Filtro UFI: original de fábrica",
    body: "Você também está comprando filtro paralelo?",
    sourceId: "120238998853430275",
    sourceUrl: "https://www.instagram.com/p/DZH3K8SDPSX/",
    mediaType: "video",
  };

  it("puts the ad origin ahead of the first day separator", () => {
    const rows = prependAdReferralRow(
      buildThreadRows([msg("m1", "2026-06-14T10:00:00.000Z")], [], NOW),
      REFERRAL,
    );
    expect(rows.map((r) => r.kind)).toEqual(["adReferral", "day", "message"]);
    expect(rows[0]).toMatchObject({
      kind: "adReferral",
      view: { headline: "Filtro UFI: original de fábrica" },
    });
  });

  it("leaves the thread untouched when the conversation has no referral", () => {
    const base = buildThreadRows([msg("m1", "2026-06-14T10:00:00.000Z")], [], NOW);
    expect(prependAdReferralRow(base, undefined)).toBe(base);
  });

  it("leaves the thread untouched when nothing in the referral is usable", () => {
    const base = buildThreadRows([msg("m1", "2026-06-14T10:00:00.000Z")], [], NOW);
    expect(prependAdReferralRow(base, { headline: "  ", sourceUrl: "javascript:alert(1)" })).toBe(
      base,
    );
  });

  it("renders the ad origin even when no message has loaded yet", () => {
    const rows = prependAdReferralRow([], REFERRAL);
    expect(rows.map((r) => r.kind)).toEqual(["adReferral"]);
  });

  it("gives the row a stable id so React can key it", () => {
    const rows = prependAdReferralRow([], REFERRAL);
    expect(rows[0]?.id).toBe("ad-referral");
  });
});
