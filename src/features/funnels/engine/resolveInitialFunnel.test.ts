import { describe, expect, it } from "vitest";
import type { ILeadFunnel } from "@/shared/types";
import { ALL_FUNNELS, resolveInitialFunnel } from "./resolveInitialFunnel";

function funnel(over: Partial<ILeadFunnel> & { id: string }): ILeadFunnel {
  return {
    storeId: "s1",
    name: over.id,
    accent: 0,
    icon: "mdi:filter-variant",
    position: 0,
    isDefault: false,
    openToStore: true,
    entryAlertThreshold: 50,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  } as ILeadFunnel;
}

const geral = funnel({ id: "f-geral", isDefault: true });
const cata = funnel({ id: "f-cata" });
const accessible = [geral, cata];

describe("resolveInitialFunnel", () => {
  it("honours a valid ?funil= above everything else", () => {
    expect(
      resolveInitialFunnel({ urlFunnelId: "f-cata", lastFunnelId: "f-geral", accessible }),
    ).toEqual({ funnelId: "f-cata", invalidLink: false, clearLastFunnel: false });
  });

  it("falls back to the default funnel and flags an invalid link", () => {
    const r = resolveInitialFunnel({ urlFunnelId: "f-nope", lastFunnelId: null, accessible });
    expect(r.funnelId).toBe("f-geral");
    expect(r.invalidLink).toBe(true);
  });

  it("treats a funnel the user cannot reach exactly like a missing one", () => {
    const r = resolveInitialFunnel({ urlFunnelId: "f-secreto", lastFunnelId: null, accessible });
    expect(r.funnelId).toBe("f-geral");
    expect(r.invalidLink).toBe(true);
  });

  it("uses the last funnel when the URL says nothing", () => {
    expect(
      resolveInitialFunnel({ urlFunnelId: undefined, lastFunnelId: "f-cata", accessible }),
    ).toEqual({ funnelId: "f-cata", invalidLink: false, clearLastFunnel: false });
  });

  /**
   * The two failure modes are deliberately distinct. A URL pointing somewhere
   * unreachable is a link someone shared — worth a toast. A stale localStorage
   * key is the user's own leftover — dropping it silently is right, and
   * nagging them about their own history is not.
   */
  it("asks to clear a stale last-funnel key without flagging an invalid link", () => {
    const r = resolveInitialFunnel({ urlFunnelId: undefined, lastFunnelId: "f-morto", accessible });
    expect(r.funnelId).toBe("f-geral");
    expect(r.clearLastFunnel).toBe(true);
    expect(r.invalidLink).toBe(false);
  });

  it("passes the consolidated sentinel through untouched", () => {
    const r = resolveInitialFunnel({ urlFunnelId: ALL_FUNNELS, lastFunnelId: null, accessible });
    expect(r.funnelId).toBe(ALL_FUNNELS);
    expect(r.invalidLink).toBe(false);
  });

  it("returns null when the user reaches no funnel at all", () => {
    expect(
      resolveInitialFunnel({ urlFunnelId: undefined, lastFunnelId: null, accessible: [] }).funnelId,
    ).toBeNull();
  });

  it("still lands somewhere when an invalid link meets an empty reachable set", () => {
    const r = resolveInitialFunnel({ urlFunnelId: "f-nope", lastFunnelId: null, accessible: [] });
    expect(r.funnelId).toBeNull();
    expect(r.invalidLink).toBe(true);
  });

  it("falls back to the first funnel when none is marked default", () => {
    const r = resolveInitialFunnel({
      urlFunnelId: undefined,
      lastFunnelId: null,
      accessible: [cata],
    });
    expect(r.funnelId).toBe("f-cata");
  });

  it("prefers the default funnel over array order", () => {
    const r = resolveInitialFunnel({
      urlFunnelId: undefined,
      lastFunnelId: null,
      accessible: [cata, geral],
    });
    expect(r.funnelId).toBe("f-geral");
  });
});
