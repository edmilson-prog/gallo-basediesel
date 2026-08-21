import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetPartCategoriesForTests,
  mockPartCategoriesProvider as provider,
} from "./partCategories";

const STORE = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  __resetPartCategoriesForTests();
});

describe("mockPartCategoriesProvider", () => {
  it("starts empty — the built-in families live in code, not in this table", async () => {
    expect(await provider.list()).toEqual([]);
  });

  it("creates a family", async () => {
    const created = await provider.save({
      value: "escapamento",
      label: "Escapamento",
      icon: "mdi:wrench",
      color: "teal",
    });
    expect(created).toMatchObject({ value: "escapamento", label: "Escapamento", archived: false });
    expect(await provider.list()).toHaveLength(1);
  });

  it("upserts by value instead of inserting a duplicate", async () => {
    const first = await provider.save({
      value: "filtro",
      label: "Filtros",
      icon: "mdi:air-filter",
      color: "emerald",
    });
    const second = await provider.save({
      value: "filtro",
      label: "Filtragem",
      icon: "mdi:air-filter",
      color: "violet",
    });
    const rows = await provider.list();
    expect(rows).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(rows[0]).toMatchObject({ label: "Filtragem", color: "violet" });
  });

  it("keeps the previous archived flag when the save omits it", async () => {
    await provider.save({
      value: "correia",
      label: "Correias",
      icon: "mdi:reorder-horizontal",
      color: "orange",
      archived: true,
    });
    await provider.save({
      value: "correia",
      label: "Correias V",
      icon: "mdi:reorder-horizontal",
      color: "orange",
    });
    const [row] = await provider.list();
    expect(row?.archived).toBe(true);
  });

  it("filters archived families when asked", async () => {
    await provider.save({ value: "a", label: "A", icon: "mdi:cube-outline", color: "slate" });
    await provider.save({
      value: "b",
      label: "B",
      icon: "mdi:cube-outline",
      color: "slate",
      archived: true,
    });
    expect(await provider.list({ activeOnly: true })).toHaveLength(1);
    expect(await provider.list()).toHaveLength(2);
  });

  it("orders by position, then label", async () => {
    await provider.save({
      value: "z",
      label: "Zebra",
      icon: "mdi:cube-outline",
      color: "slate",
      position: 0,
    });
    await provider.save({
      value: "a",
      label: "Alfa",
      icon: "mdi:cube-outline",
      color: "slate",
      position: 5,
    });
    expect((await provider.list()).map((r) => r.value)).toEqual(["z", "a"]);
  });

  it("scopes rows to their store", async () => {
    await provider.save({
      storeId: STORE,
      value: "a",
      label: "A",
      icon: "mdi:cube-outline",
      color: "slate",
    });
    await provider.save({
      storeId: "store-2",
      value: "b",
      label: "B",
      icon: "mdi:cube-outline",
      color: "slate",
    });
    expect(await provider.list({ storeId: STORE })).toHaveLength(1);
    expect(await provider.list({ storeId: "store-2" })).toHaveLength(1);
  });

  it("deletes a family", async () => {
    const created = await provider.save({
      value: "escapamento",
      label: "Escapamento",
      icon: "mdi:wrench",
      color: "teal",
    });
    await provider.delete(created.id);
    expect(await provider.list()).toEqual([]);
  });
});
