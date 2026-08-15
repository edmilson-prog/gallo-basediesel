import { describe, expect, it } from "vitest";
import type { IPartCategory } from "@/shared/types";
import {
  BUILTIN_PART_CATEGORY_DESCRIPTORS,
  categoryTone,
  DEFAULT_CATEGORY_COLOR,
  getCategoryDescriptor,
  getCategoryIcon,
  getCategoryLabel,
  getSubcategoriesFor,
  mergeCategoryDescriptors,
  PART_CATEGORY_PALETTE,
  toCategorySlug,
} from "./categories";

function makeRow(overrides: Partial<IPartCategory> = {}): IPartCategory {
  return {
    id: "cat-1",
    storeId: "store-1",
    value: "escapamento",
    label: "Escapamento",
    icon: "mdi:wrench",
    color: "teal",
    position: 50,
    archived: false,
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("categoryTone", () => {
  it("resolves a palette id to its static classes", () => {
    expect(categoryTone("emerald")).toBe(PART_CATEGORY_PALETTE.emerald);
  });

  it("falls back to the default colour for unknown ids", () => {
    const fallback = PART_CATEGORY_PALETTE[DEFAULT_CATEGORY_COLOR];
    expect(categoryTone("chartreuse")).toBe(fallback);
    expect(categoryTone(undefined)).toBe(fallback);
  });

  it("never returns a class string built at runtime", () => {
    // Tailwind only emits classes it finds in source, so every tone must be a
    // literal from the palette — this guards against interpolated class names.
    for (const tone of Object.values(PART_CATEGORY_PALETTE)) {
      expect(tone).not.toMatch(/\$\{|\+/);
    }
  });
});

describe("BUILTIN_PART_CATEGORY_DESCRIPTORS", () => {
  it("ships the ten families", () => {
    expect(BUILTIN_PART_CATEGORY_DESCRIPTORS).toHaveLength(10);
  });

  it("marks every one as built-in and gives each a palette-backed tone", () => {
    for (const descriptor of BUILTIN_PART_CATEGORY_DESCRIPTORS) {
      expect(descriptor.builtin).toBe(true);
      expect(descriptor.tone).toBe(PART_CATEGORY_PALETTE[descriptor.color]);
    }
  });
});

describe("mergeCategoryDescriptors", () => {
  it("returns the built-ins untouched when the table is empty", () => {
    expect(mergeCategoryDescriptors([])).toEqual([...BUILTIN_PART_CATEGORY_DESCRIPTORS]);
    expect(mergeCategoryDescriptors(undefined)).toEqual([...BUILTIN_PART_CATEGORY_DESCRIPTORS]);
  });

  it("appends a custom family", () => {
    const merged = mergeCategoryDescriptors([makeRow()]);
    expect(merged).toHaveLength(11);
    const custom = merged.find((d) => d.value === "escapamento");
    expect(custom).toMatchObject({ label: "Escapamento", builtin: false, id: "cat-1" });
  });

  it("overrides a built-in by slug without duplicating it", () => {
    const merged = mergeCategoryDescriptors([
      makeRow({ value: "filtro", label: "Filtragem", color: "violet", position: 0 }),
    ]);
    expect(merged).toHaveLength(10);
    const filtro = merged.find((d) => d.value === "filtro");
    expect(filtro?.label).toBe("Filtragem");
    expect(filtro?.tone).toBe(PART_CATEGORY_PALETTE.violet);
  });

  it("keeps the built-in's suggested subcategories when overriding it", () => {
    const merged = mergeCategoryDescriptors([makeRow({ value: "filtro", label: "Filtragem" })]);
    expect(merged.find((d) => d.value === "filtro")?.subcategories).toContain("separador");
  });

  it("still reports an overridden built-in as built-in", () => {
    const merged = mergeCategoryDescriptors([makeRow({ value: "freio", label: "Frenagem" })]);
    expect(merged.find((d) => d.value === "freio")?.builtin).toBe(true);
  });

  it("orders by position, then label", () => {
    const merged = mergeCategoryDescriptors([
      makeRow({ id: "a", value: "zebra", label: "Zebra", position: -1 }),
    ]);
    expect(merged[0]?.value).toBe("zebra");
  });

  it("keeps archived families in the list so old parts still resolve a label", () => {
    const merged = mergeCategoryDescriptors([makeRow({ value: "correia", archived: true })]);
    expect(merged.find((d) => d.value === "correia")?.archived).toBe(true);
  });
});

describe("toCategorySlug", () => {
  it.each([
    ["Escapamento", "escapamento"],
    ["Óleo & Lubrificantes", "oleo-lubrificantes"],
    ["Suspensão Dianteira", "suspensao-dianteira"],
    ["  Freios  ", "freios"],
    ["Ar-Condicionado", "ar-condicionado"],
  ])("slugifies %s", (input, expected) => {
    expect(toCategorySlug(input)).toBe(expected);
  });

  it("produces a slug the database check constraint accepts", () => {
    const pattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    expect(toCategorySlug("Câmbio & Transmissão!!")).toMatch(pattern);
  });
});

describe("lookup helpers", () => {
  it("answer from the built-ins when no descriptor list is passed", () => {
    expect(getCategoryLabel("filtro")).toBe("Filtros");
    expect(getCategoryIcon("filtro")).toBe("mdi:air-filter");
    expect(getSubcategoriesFor("filtro")).toContain("ar");
  });

  it("honour a merged list when one is passed", () => {
    const merged = mergeCategoryDescriptors([makeRow({ value: "filtro", label: "Filtragem" })]);
    expect(getCategoryLabel("filtro", merged)).toBe("Filtragem");
    expect(getCategoryLabel("escapamento", merged)).toBe("Outros");
  });

  it("resolve a user-created family only through the merged list", () => {
    const merged = mergeCategoryDescriptors([makeRow()]);
    expect(getCategoryLabel("escapamento")).toBe("Outros");
    expect(getCategoryLabel("escapamento", merged)).toBe("Escapamento");
  });

  it("fall back for unknown and undefined categories", () => {
    expect(getCategoryDescriptor(undefined)).toBeUndefined();
    expect(getCategoryLabel(undefined)).toBe("Outros");
    expect(getCategoryIcon("nope")).toBe("mdi:cube-outline");
    expect(getSubcategoriesFor("nope")).toEqual([]);
  });
});
