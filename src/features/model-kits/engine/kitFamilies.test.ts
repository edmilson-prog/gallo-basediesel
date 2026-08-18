import { describe, expect, it } from "vitest";
import {
  CATEGORY_FAMILIES,
  KIT_FAMILIES,
  getFamilyCoverage,
  resolvePartFamily,
  type KitFamily,
} from "./kitFamilies";

/** Minimal part shape the family resolver reads. */
function part(subcategory?: string, name = "Peça"): { subcategory?: string; name: string } {
  return { subcategory, name };
}

describe("resolvePartFamily", () => {
  it("resolves the accented pt-BR subcategories used by the curated filter catalog", () => {
    expect(resolvePartFamily(part("óleo"))).toBe("oleo");
    expect(resolvePartFamily(part("combustível"))).toBe("combustivel");
    expect(resolvePartFamily(part("hidráulico"))).toBe("hidraulico");
    expect(resolvePartFamily(part("ar"))).toBe("ar");
    expect(resolvePartFamily(part("cabine"))).toBe("cabine");
    expect(resolvePartFamily(part("separador"))).toBe("separador");
  });

  it("resolves the English subcategories the DINTEC import left behind", () => {
    expect(resolvePartFamily(part("Oil filter"))).toBe("oleo");
    expect(resolvePartFamily(part("Fuel Filter"))).toBe("combustivel");
    expect(resolvePartFamily(part("Cabin filter"))).toBe("cabine");
    expect(resolvePartFamily(part("Air filter"))).toBe("ar");
  });

  it("prefers the more specific family when terms overlap", () => {
    // "cabin air filter" must not fall into `ar`
    expect(resolvePartFamily(part("Cabin air filter"))).toBe("cabine");
    // "separador de água" must not fall into `combustivel` via the name
    expect(resolvePartFamily(part("separador", "Filtro separador de água/combustível"))).toBe(
      "separador",
    );
    // A gearbox filter must not satisfy the engine-oil slot
    expect(resolvePartFamily(part(undefined, "Filtro de óleo da transmissão"))).toBe("transmissao");
    expect(resolvePartFamily(part(undefined, "Filtro de óleo hidráulico"))).toBe("hidraulico");
  });

  it("falls back to the part name when the subcategory carries no family", () => {
    // Production subcategories are often the ERP group or the supplier brand.
    expect(resolvePartFamily(part("UFI", "Filtro de óleo spin-on"))).toBe("oleo");
    expect(resolvePartFamily(part("FILTROS", "Filtro de ar primário"))).toBe("ar");
    expect(resolvePartFamily(part("PECAS", "Filtro blindado de combustível"))).toBe("combustivel");
  });

  it("does not match a family on a substring of an unrelated word", () => {
    // "ar" inside "arla"/"barra" is not the air family.
    expect(
      resolvePartFamily(part("BOMBAS/DOSADORAS DE ARLA", "Bomba dosadora de Arla")),
    ).toBeNull();
    expect(resolvePartFamily(part("PECAS", "Barra estabilizadora"))).toBeNull();
  });

  it("returns null when nothing identifies a family", () => {
    expect(resolvePartFamily(part(undefined, "Kit de reparo"))).toBeNull();
    expect(resolvePartFamily(part("SENSORES", "Sensor de rotação"))).toBeNull();
  });

  it("labels every family it can return", () => {
    for (const family of Object.keys(KIT_FAMILIES) as KitFamily[]) {
      expect(KIT_FAMILIES[family].label.length).toBeGreaterThan(0);
      expect(KIT_FAMILIES[family].icon.length).toBeGreaterThan(0);
    }
  });
});

describe("CATEGORY_FAMILIES", () => {
  it("only requires families the category also lists as slots", () => {
    for (const config of Object.values(CATEGORY_FAMILIES)) {
      for (const required of config.required) {
        expect(config.slots).toContain(required);
      }
    }
  });

  it("expects oil and fuel on the filter-shaped categories", () => {
    expect(CATEGORY_FAMILIES.filtros.required).toEqual(["oleo", "combustivel"]);
    expect(CATEGORY_FAMILIES.revisao.required).toEqual(["oleo", "combustivel"]);
    expect(CATEGORY_FAMILIES.freios.required).toEqual([]);
    expect(CATEGORY_FAMILIES.custom.slots).toEqual([]);
  });
});

describe("getFamilyCoverage", () => {
  it("counts the parts filling each family", () => {
    const coverage = getFamilyCoverage("filtros", [
      part("óleo"),
      part("óleo"),
      part("combustível"),
      part("SENSORES", "Sensor de rotação"),
    ]);
    expect(coverage.filled.oleo).toBe(2);
    expect(coverage.filled.combustivel).toBe(1);
    expect(coverage.missingRequired).toEqual([]);
  });

  it("reports the required families still missing", () => {
    const coverage = getFamilyCoverage("filtros", [part("ar"), part("cabine")]);
    expect(coverage.missingRequired).toEqual(["oleo", "combustivel"]);
  });

  it("never reports a missing family for a category that requires none", () => {
    const coverage = getFamilyCoverage("custom", []);
    expect(coverage.missingRequired).toEqual([]);
  });

  it("does not let an optional part cover a required family", () => {
    const coverage = getFamilyCoverage("filtros", [
      { ...part("óleo"), isOptional: true },
      part("combustível"),
    ]);
    expect(coverage.missingRequired).toEqual(["oleo"]);
    expect(coverage.filled.oleo).toBeUndefined();
  });
});
