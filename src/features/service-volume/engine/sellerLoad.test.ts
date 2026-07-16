import { describe, it, expect } from "vitest";
import { buildSellerLoadEntries } from "./sellerLoad";
import type { ISeller, ISellerLoadCountRow } from "@/shared/types";

function seller(id: string, fullName: string, overrides: Partial<ISeller> = {}): ISeller {
  return {
    id,
    fullName,
    active: true,
    availability: "online",
  } as ISeller;
}

const OPTS = { overloadThreshold: 10 };

describe("buildSellerLoadEntries", () => {
  it("joins counts with the roster and keeps zero-load sellers", () => {
    const rows: ISellerLoadCountRow[] = [{ sellerId: "s1", activeCount: 3 }];
    const entries = buildSellerLoadEntries(rows, [seller("s1", "Ana"), seller("s2", "Bruno")], OPTS);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ activeCount: 3, band: "normal" });
    expect(entries[0]!.seller.id).toBe("s1");
    expect(entries[1]).toMatchObject({ activeCount: 0, band: "normal" });
  });

  it("orders by load desc, ties broken by name", () => {
    const rows: ISellerLoadCountRow[] = [
      { sellerId: "s1", activeCount: 2 },
      { sellerId: "s2", activeCount: 2 },
      { sellerId: "s3", activeCount: 5 },
    ];
    const entries = buildSellerLoadEntries(
      rows,
      [seller("s1", "Zara"), seller("s2", "Ana"), seller("s3", "Caio")],
      OPTS,
    );
    expect(entries.map((e) => e.seller.id)).toEqual(["s3", "s2", "s1"]);
  });

  it("bands: warning above 67% of threshold, critical above threshold", () => {
    const rows: ISellerLoadCountRow[] = [
      { sellerId: "s1", activeCount: 11 },
      { sellerId: "s2", activeCount: 7 },
      { sellerId: "s3", activeCount: 6 },
    ];
    const entries = buildSellerLoadEntries(
      rows,
      [seller("s1", "A"), seller("s2", "B"), seller("s3", "C")],
      { overloadThreshold: 10 },
    );
    expect(entries.find((e) => e.seller.id === "s1")?.band).toBe("critical");
    expect(entries.find((e) => e.seller.id === "s2")?.band).toBe("warning");
    expect(entries.find((e) => e.seller.id === "s3")?.band).toBe("normal");
  });

  it("filters inactive sellers always, offline only when hideInactive", () => {
    const roster = [
      seller("s1", "Ativa"),
      { ...seller("s2", "Inativa"), active: false } as ISeller,
      { ...seller("s3", "Offline"), availability: "offline" } as ISeller,
    ];
    expect(buildSellerLoadEntries([], roster, OPTS).map((e) => e.seller.id).sort()).toEqual([
      "s1",
      "s3",
    ]);
    expect(
      buildSellerLoadEntries([], roster, { ...OPTS, hideInactive: true }).map((e) => e.seller.id),
    ).toEqual(["s1"]);
  });

  it("ignores counts for sellers missing from the roster (e.g. other store)", () => {
    const entries = buildSellerLoadEntries(
      [{ sellerId: "ghost", activeCount: 9 }],
      [seller("s1", "Ana")],
      OPTS,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]!.activeCount).toBe(0);
  });
});
