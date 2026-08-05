import { describe, expect, it } from "vitest";
import { formatLastAccess, formatMemberSince } from "./profileFormat";

describe("formatMemberSince", () => {
  it("renders month and year in pt-BR", () => {
    expect(formatMemberSince("2024-03-14T12:00:00.000Z")).toBe("março de 2024");
  });

  it("uses the São Paulo calendar, not UTC", () => {
    // 1 Mar 00:30 UTC is still 28 Feb 21:30 in São Paulo (UTC−03).
    expect(formatMemberSince("2024-03-01T00:30:00.000Z")).toBe("fevereiro de 2024");
  });

  it("returns null for a missing or invalid date", () => {
    expect(formatMemberSince(undefined)).toBeNull();
    expect(formatMemberSince(null)).toBeNull();
    expect(formatMemberSince("not-a-date")).toBeNull();
  });
});

describe("formatLastAccess", () => {
  const now = new Date("2026-08-04T18:00:00.000Z"); // 15:00 São Paulo

  it("says 'hoje' with the time for the same day", () => {
    expect(formatLastAccess("2026-08-04T11:42:00.000Z", now)).toBe("hoje, 08:42");
  });

  it("says 'ontem' for the previous day", () => {
    expect(formatLastAccess("2026-08-03T22:05:00.000Z", now)).toBe("ontem, 19:05");
  });

  it("falls back to the full date further back", () => {
    expect(formatLastAccess("2026-07-28T13:15:00.000Z", now)).toBe("28/07/2026, 10:15");
  });

  it("returns null for a missing or invalid date", () => {
    expect(formatLastAccess(undefined, now)).toBeNull();
    expect(formatLastAccess("nope", now)).toBeNull();
  });
});
