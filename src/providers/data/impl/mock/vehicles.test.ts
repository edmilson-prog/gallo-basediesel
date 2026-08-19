import { describe, expect, it } from "vitest";
import { FETCH_ALL_PAGE_SIZE } from "../../contracts/_shared";
import { mockVehiclesProvider } from "./vehicles";

/**
 * `listBrands` feeds the Marca pickers, which must offer every brand actually
 * present in the data — the previous hard-coded five silently hid ~48% of the
 * production fleet.
 */
describe("mockVehiclesProvider.listBrands", () => {
  it("returns every distinct brand carried by a vehicle", async () => {
    const { data } = await mockVehiclesProvider.list({ pageSize: FETCH_ALL_PAGE_SIZE });
    const expected = new Set(data.map((v) => v.brand));

    const brands = await mockVehiclesProvider.listBrands();

    expect(new Set(brands)).toEqual(expected);
  });

  it("returns each brand once and never a blank", async () => {
    const brands = await mockVehiclesProvider.listBrands();

    expect(brands.length).toBeGreaterThan(0);
    expect(new Set(brands).size).toBe(brands.length);
    expect(brands.every((b) => b.trim().length > 0)).toBe(true);
  });
});
