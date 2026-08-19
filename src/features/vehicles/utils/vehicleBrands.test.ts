import { describe, expect, it } from "vitest";
import { normalizeVehicleBrandModel } from "@/features/dintec-import/engine";
import { UNKNOWN_VEHICLE_BRAND, VEHICLE_BRANDS, mergeBrandOptions } from "./vehicleBrands";

describe("VEHICLE_BRANDS", () => {
  it("covers every brand the DINTEC normalizer can emit", () => {
    // The vehicles table was populated by this normalizer, so any brand it
    // produces must be selectable offline — otherwise those vehicles are
    // invisible to the Marca filter until the DB-derived list loads.
    const samples = [
      "FH 540 6X4T",
      "R 440 A6X4",
      "ACTROS 2651LS6X4",
      "STRALISHD 19-320",
      "CARGO 2429",
      "24.280 CRM 6X2",
      "24.280 CONSTELLATION 6X2",
      "XF 105 460",
      "TGX 29.480",
      "HILUX CD4X4 SRV",
      "ATRON 9-160",
      "DUCATO MULTI",
      "MASTER L3H2",
      "RANGER XLSCD4A22C",
      "FRONTIER XE 4X2",
      "415CDISPRINTERF",
      "ZX90 EXPERIMENTAL",
      "",
    ];
    const emitted = new Set(samples.map((s) => normalizeVehicleBrandModel(s).brand));
    const known = new Set<string>(VEHICLE_BRANDS);
    expect([...emitted].filter((b) => !known.has(b))).toEqual([]);
  });

  it("uses 'Outra' as the catch-all, matching what the importer wrote", () => {
    expect(UNKNOWN_VEHICLE_BRAND).toBe("Outra");
    expect(normalizeVehicleBrandModel("ZX90 EXPERIMENTAL").brand).toBe(UNKNOWN_VEHICLE_BRAND);
    expect(VEHICLE_BRANDS).toContain(UNKNOWN_VEHICLE_BRAND);
  });

  it("keeps 'Ford Cargo' distinct from 'Ford'", () => {
    // The provider matches brands exactly (`.in("brand", …)`), so the two
    // spellings are separate buckets in the DB and both must be offered.
    expect(VEHICLE_BRANDS).toContain("Ford");
    expect(VEHICLE_BRANDS).toContain("Ford Cargo");
  });
});

describe("mergeBrandOptions", () => {
  it("falls back to the canonical list when the DB has not answered yet", () => {
    expect(mergeBrandOptions(undefined)).toEqual(mergeBrandOptions([]));
    expect(mergeBrandOptions(undefined)).toContain("Volkswagen");
  });

  it("adds a brand the DB has but the canonical list does not", () => {
    expect(mergeBrandOptions(["Agrale"])).toContain("Agrale");
  });

  it("does not duplicate a brand present in both sources", () => {
    const merged = mergeBrandOptions(["Volvo", "Scania"]);
    expect(merged.filter((b) => b === "Volvo")).toHaveLength(1);
  });

  it("dedupes case- and whitespace-insensitively, keeping the canonical spelling", () => {
    const merged = mergeBrandOptions(["  volvo ", "VOLVO"]);
    expect(merged.filter((b) => b.toLowerCase() === "volvo")).toEqual(["Volvo"]);
  });

  it("drops blank entries", () => {
    expect(mergeBrandOptions(["", "   "])).toEqual(mergeBrandOptions([]));
  });

  it("sorts alphabetically and pins the catch-all last", () => {
    const merged = mergeBrandOptions(["Agrale"]);
    expect(merged[0]).toBe("Agrale");
    expect(merged.at(-1)).toBe(UNKNOWN_VEHICLE_BRAND);
    const withoutCatchAll = merged.slice(0, -1);
    expect(withoutCatchAll).toEqual(
      [...withoutCatchAll].sort((a, b) => a.localeCompare(b, "pt-BR")),
    );
  });

  it("accepts an explicit fallback so callers can narrow the offline list", () => {
    expect(mergeBrandOptions(["Scania"], ["Volvo"])).toEqual(["Scania", "Volvo"]);
  });
});
