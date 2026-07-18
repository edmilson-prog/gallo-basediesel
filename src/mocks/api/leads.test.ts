import { describe, it, expect } from "vitest";
import { leadsApi } from "./leads";
import { getMockState } from "../store/mockStore";
import { upsert } from "../store/mutations";
import { resetMockStorePerFile } from "@/mocks/test-setup";
import type { ILead } from "@/shared/types";

resetMockStorePerFile();

describe("leadsApi.list — excludeLost", () => {
  it("excludes leads with a lossReason set when excludeLost is true", async () => {
    const seed = getMockState().leads[0];
    if (!seed) throw new Error("mock seed has no leads to test against");

    const activeLead: ILead = {
      ...seed,
      id: "lead-test-excludeLost-active",
      lossReason: undefined,
      convertedToCustomerId: undefined,
    };
    const lostLead: ILead = {
      ...seed,
      id: "lead-test-excludeLost-lost",
      lossReason: "Sem interesse",
    };
    upsert("leads", activeLead);
    upsert("leads", lostLead);

    const withLost = await leadsApi.list({ storeId: seed.storeId, pageSize: 1000 });
    expect(withLost.data.some((l) => l.id === activeLead.id)).toBe(true);
    expect(withLost.data.some((l) => l.id === lostLead.id)).toBe(true);

    const excludingLost = await leadsApi.list({
      storeId: seed.storeId,
      pageSize: 1000,
      excludeLost: true,
    });
    expect(excludingLost.data.some((l) => l.id === activeLead.id)).toBe(true);
    expect(excludingLost.data.some((l) => l.id === lostLead.id)).toBe(false);
  });
});
