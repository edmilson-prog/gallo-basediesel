import { describe, expect, it } from "vitest";
import {
  buildDuplicatePairs,
  DUPLICATE_REASON_NINTH_DIGIT,
  DUPLICATE_REASON_SAME_EMAIL,
  DUPLICATE_REASON_SAME_PHONE,
  type IDuplicateInput,
} from "./duplicatePairs";

function row(patch: Partial<IDuplicateInput> = {}): IDuplicateInput {
  return {
    id: "ct-1",
    name: "Gilmar Kroth",
    phone: null,
    email: null,
    role: null,
    city: null,
    customerId: null,
    lastContactAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("buildDuplicatePairs", () => {
  it("pairs the same line stored with and without the 9th digit", () => {
    const pairs = buildDuplicatePairs([
      row({ id: "a", phone: "+5555996482210" }),
      row({ id: "b", phone: "(55) 9648-2210" }),
    ]);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.reason).toBe(DUPLICATE_REASON_NINTH_DIGIT);
  });

  it("calls it a plain repeat when the digits are identical", () => {
    const pairs = buildDuplicatePairs([
      row({ id: "a", phone: "+5555996482210" }),
      row({ id: "b", phone: "+5555996482210" }),
    ]);

    expect(pairs[0]?.reason).toBe(DUPLICATE_REASON_SAME_PHONE);
  });

  it("pairs two contacts sharing an address", () => {
    const pairs = buildDuplicatePairs([
      row({ id: "a", email: "compras@fronteiraoeste.com.br" }),
      row({ id: "b", email: "Compras@FronteiraOeste.com.br" }),
    ]);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.reason).toBe(DUPLICATE_REASON_SAME_EMAIL);
  });

  it("reports a pair once, keeping the phone reason over the e-mail one", () => {
    const pairs = buildDuplicatePairs([
      row({ id: "a", phone: "+5555996482210", email: "gilmar@kroth.com.br" }),
      row({ id: "b", phone: "(55) 9648-2210", email: "gilmar@kroth.com.br" }),
    ]);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.reason).toBe(DUPLICATE_REASON_NINTH_DIGIT);
  });

  it("keeps the linked record as primary, whatever the input order", () => {
    const loose = row({ id: "loose", phone: "+5555996482210" });
    const linked = row({ id: "linked", phone: "(55) 9648-2210", customerId: "cu-1" });

    expect(buildDuplicatePairs([loose, linked])[0]).toMatchObject({
      primaryId: "linked",
      duplicateId: "loose",
    });
    expect(buildDuplicatePairs([linked, loose])[0]).toMatchObject({
      primaryId: "linked",
      duplicateId: "loose",
    });
  });

  it("prefers the fuller record when neither is linked", () => {
    const sparse = row({ id: "sparse", phone: "+5555996482210" });
    const full = row({
      id: "full",
      phone: "(55) 9648-2210",
      email: "gilmar@kroth.com.br",
      role: "Proprietário",
      city: "Palmitinho",
    });

    expect(buildDuplicatePairs([sparse, full])[0]?.primaryId).toBe("full");
  });

  it("falls back to the most recent contact, then to the older record", () => {
    const recent = row({
      id: "recent",
      phone: "+5555996482210",
      lastContactAt: "2026-08-10T00:00:00.000Z",
    });
    const stale = row({
      id: "stale",
      phone: "(55) 9648-2210",
      lastContactAt: "2026-01-10T00:00:00.000Z",
    });
    expect(buildDuplicatePairs([recent, stale])[0]?.primaryId).toBe("recent");

    const older = row({ id: "older", phone: "+5555996482210", createdAt: "2025-01-01T00:00:00Z" });
    const newer = row({ id: "newer", phone: "(55) 9648-2210", createdAt: "2026-01-01T00:00:00Z" });
    expect(buildDuplicatePairs([older, newer])[0]?.primaryId).toBe("older");
  });

  it("collapses a group of three into two decisions against one survivor", () => {
    const pairs = buildDuplicatePairs([
      row({ id: "a", phone: "+5555996482210", customerId: "cu-1" }),
      row({ id: "b", phone: "(55) 9648-2210" }),
      row({ id: "c", phone: "5555996482210" }),
    ]);

    // Three combinations exist; only two decisions are worth making.
    expect(pairs).toHaveLength(2);
    expect(pairs.every((pair) => pair.primaryId === "a")).toBe(true);
  });

  it("ignores contacts with no comparable key", () => {
    expect(
      buildDuplicatePairs([
        row({ id: "a", phone: null, email: null }),
        row({ id: "b", phone: "abc", email: "   " }),
      ]),
    ).toEqual([]);
  });

  it("does not pair different numbers or different addresses", () => {
    expect(
      buildDuplicatePairs([
        row({ id: "a", phone: "+5555996482210", email: "um@kroth.com.br" }),
        row({ id: "b", phone: "+5554996302288", email: "dois@kroth.com.br" }),
      ]),
    ).toEqual([]);
  });
});
