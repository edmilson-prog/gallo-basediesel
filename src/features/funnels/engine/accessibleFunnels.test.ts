import { describe, expect, it } from "vitest";
import type { ILeadFunnel } from "@/shared/types";
import { resolveAccessibleFunnels } from "./accessibleFunnels";

function funnel(id: string, over: Partial<ILeadFunnel> = {}): ILeadFunnel {
  return {
    id, storeId: "store-1", name: id, accent: 1, icon: "mdi:filter-variant",
    position: 0, isDefault: false, openToStore: false, entryAlertThreshold: 50,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
  };
}

const geral = funnel("geral", { isDefault: true, openToStore: true, position: 0 });
const catalisador = funnel("catalisador", { position: 1 });
const filtros = funnel("filtros", { position: 2 });
const modulos = funnel("modulos", { position: 3 });
const arquivado = funnel("antigo", { position: 4, archivedAt: "2026-05-01T00:00:00.000Z" });

const all = [geral, catalisador, filtros, modulos, arquivado];

describe("resolveAccessibleFunnels", () => {
  it("gives staff every active funnel", () => {
    const r = resolveAccessibleFunnels({ funnels: all, grantedFunnelIds: [], isStaff: true });
    expect(r.map((f) => f.id)).toEqual(["geral", "catalisador", "filtros", "modulos"]);
  });

  it("gives a seller the funnels they were granted", () => {
    const r = resolveAccessibleFunnels({
      funnels: all, grantedFunnelIds: ["catalisador", "filtros"], isStaff: false,
    });
    expect(r.map((f) => f.id)).toEqual(["geral", "catalisador", "filtros"]);
  });

  // Without this, every non-staff user lands on "no funnel access" on deploy
  // day: the backfill grants nobody explicitly.
  it("always includes the default funnel, even with no grant at all", () => {
    const r = resolveAccessibleFunnels({ funnels: all, grantedFunnelIds: [], isStaff: false });
    expect(r.map((f) => f.id)).toEqual(["geral"]);
  });

  it("includes a funnel opened to the whole store without an explicit grant", () => {
    const open = funnel("balcao", { openToStore: true, position: 5 });
    const r = resolveAccessibleFunnels({
      funnels: [...all, open], grantedFunnelIds: [], isStaff: false,
    });
    expect(r.map((f) => f.id)).toContain("balcao");
  });

  it("never includes an archived funnel, not even for staff", () => {
    const r = resolveAccessibleFunnels({
      funnels: all, grantedFunnelIds: ["antigo"], isStaff: true,
    });
    expect(r.map((f) => f.id)).not.toContain("antigo");
  });

  it("returns them ordered by position", () => {
    const shuffled = [modulos, geral, filtros, catalisador];
    const r = resolveAccessibleFunnels({ funnels: shuffled, grantedFunnelIds: [], isStaff: true });
    expect(r.map((f) => f.position)).toEqual([0, 1, 2, 3]);
  });
});
