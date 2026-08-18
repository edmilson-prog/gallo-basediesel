import { describe, expect, it } from "vitest";
import { resolveRecipient, type IRecipientReader } from "./recipient";

type Row = { auth_user_id?: string | null } | null;

/** Fake client recording which table/column each lookup hit. */
function reader(rows: Record<string, Row>, errors: Record<string, string> = {}) {
  const calls: string[] = [];
  const db: IRecipientReader = {
    from: (table) => ({
      select: () => ({
        eq: (column, value) => ({
          maybeSingle: () => {
            calls.push(`${table}.${column}=${value}`);
            const error = errors[table];
            return Promise.resolve({
              data: error ? null : (rows[table] ?? null),
              error: error ? { message: error } : null,
            });
          },
        }),
      }),
    }),
  };
  return { db, calls };
}

describe("resolveRecipient", () => {
  it("answers from the profile, which is the link the app maintains", async () => {
    const { db, calls } = reader({ profiles: { auth_user_id: "auth-1" } });

    await expect(resolveRecipient(db, "seller-1")).resolves.toBe("auth-1");
    expect(calls).toEqual(["profiles.seller_id=seller-1"]);
  });

  it("never touches sellers once the profile answered", async () => {
    // The reverse mirror is stale in production; reading it would be noise.
    const { db, calls } = reader({
      profiles: { auth_user_id: "auth-1" },
      sellers: { auth_user_id: "auth-outdated" },
    });

    await expect(resolveRecipient(db, "seller-1")).resolves.toBe("auth-1");
    expect(calls).toHaveLength(1);
  });

  it("falls back to the seller column when no profile row exists", async () => {
    const { db, calls } = reader({ profiles: null, sellers: { auth_user_id: "auth-2" } });

    await expect(resolveRecipient(db, "seller-2")).resolves.toBe("auth-2");
    expect(calls).toEqual(["profiles.seller_id=seller-2", "sellers.id=seller-2"]);
  });

  it("falls back when the profile exists but carries no login", async () => {
    const { db } = reader({
      profiles: { auth_user_id: null },
      sellers: { auth_user_id: "auth-3" },
    });

    await expect(resolveRecipient(db, "seller-3")).resolves.toBe("auth-3");
  });

  it("returns null when neither side knows the login", async () => {
    // The caller turns this into a skip: a seller with no login cannot be
    // notified, and guessing a recipient would notify the wrong person.
    const { db } = reader({ profiles: null, sellers: { auth_user_id: null } });

    await expect(resolveRecipient(db, "seller-4")).resolves.toBeNull();
  });

  it("surfaces a profile read failure instead of silently skipping", async () => {
    // Treating a broken read as "no login" would drop notifications quietly —
    // exactly the failure mode this module exists to end.
    const { db } = reader({}, { profiles: "permission denied" });

    await expect(resolveRecipient(db, "seller-5")).rejects.toThrow(/profiles read failed/);
  });

  it("surfaces a seller read failure too", async () => {
    const { db } = reader({ profiles: null }, { sellers: "timeout" });

    await expect(resolveRecipient(db, "seller-6")).rejects.toThrow(/sellers read failed/);
  });
});
