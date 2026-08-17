import { describe, expect, it } from "vitest";
import {
  applicationMatchesModel,
  brandMatches,
  modelDesignationMatches,
} from "./modelApplicationMatch";

const FH460 = { brand: "Volvo", model: "FH 460" };
const FM370 = { brand: "Volvo", model: "FM 370" };
const R500 = { brand: "Scania", model: "R 500" };
const CARGO1719 = { brand: "Ford Cargo", model: "1719" };
const ATEGO = { brand: "Mercedes-Benz", model: "Atego 1719" };

describe("brandMatches", () => {
  it("matches the same brand regardless of case", () => {
    expect(brandMatches("volvo", "Volvo")).toBe(true);
  });

  it("matches when the canonical brand carries an extra word — 'Ford' × 'Ford Cargo'", () => {
    expect(brandMatches("Ford", "Ford Cargo")).toBe(true);
  });

  it("matches Mercedes with or without the hyphen", () => {
    expect(brandMatches("Mercedes Benz", "Mercedes-Benz")).toBe(true);
    expect(brandMatches("MERCEDES-BENZ", "Mercedes-Benz")).toBe(true);
  });

  it("matches a supplier row that lumps two brands together", () => {
    expect(brandMatches("Agrale  /  Ford", "Ford Cargo")).toBe(true);
  });

  it("rejects a different brand", () => {
    expect(brandMatches("Iveco", "Volvo")).toBe(false);
    expect(brandMatches("Scania", "Volvo")).toBe(false);
  });

  it("rejects an empty brand", () => {
    expect(brandMatches("", "Volvo")).toBe(false);
    expect(brandMatches(undefined, "Volvo")).toBe(false);
  });
});

describe("modelDesignationMatches — the displacement digits do not distinguish the fit", () => {
  it("matches the real supplier codes for the FH 460", () => {
    // Exactly what production stores in parts.applications.
    expect(modelDesignationMatches("fh12460", "FH 460")).toBe(true);
    expect(modelDesignationMatches("fh13460", "FH 460")).toBe(true);
    expect(modelDesignationMatches("fh460", "FH 460")).toBe(true);
  });

  it("tolerates the year suffix the supplier appends", () => {
    expect(modelDesignationMatches("fh12460 (2004>)", "FH 460")).toBe(true);
    expect(modelDesignationMatches("fh13540 (2013>)", "FH 540")).toBe(true);
  });

  it("matches across displacements — FH13 540 and FH16 540 are both an FH 540", () => {
    expect(modelDesignationMatches("fh13540", "FH 540")).toBe(true);
    expect(modelDesignationMatches("fh16540", "FH 540")).toBe(true);
  });

  it("does not match a different power rating", () => {
    expect(modelDesignationMatches("fm12340", "FM 370")).toBe(false);
    expect(modelDesignationMatches("fh13500", "FH 540")).toBe(false);
    expect(modelDesignationMatches("fh12420", "FH 460")).toBe(false);
  });

  it("does not match a different family with the same rating", () => {
    expect(modelDesignationMatches("nh12460", "FH 460")).toBe(false);
    expect(modelDesignationMatches("fm12460", "FH 460")).toBe(false);
  });

  it("keeps a one-letter family from firing mid-word", () => {
    // "super 500" must not read as Scania "R 500".
    expect(modelDesignationMatches("super 500", "R 500")).toBe(false);
    expect(modelDesignationMatches("r500", "R 500")).toBe(true);
    expect(modelDesignationMatches("r 500", "R 500")).toBe(true);
  });

  it("matches a purely numeric designation as a whole word", () => {
    expect(modelDesignationMatches("1719", "1719")).toBe(true);
    expect(modelDesignationMatches("cargo 1719", "1719")).toBe(true);
    // The long free-text row that lists many trucks — 1719 is not among them.
    expect(modelDesignationMatches("1317e/1517e/1717e interact 4 (05-)", "1719")).toBe(false);
    expect(modelDesignationMatches("17190", "1719")).toBe(false);
  });

  it("matches a named model with its number", () => {
    expect(modelDesignationMatches("atego 1719", "Atego 1719")).toBe(true);
    expect(modelDesignationMatches("ATEGO 1719/42", "Atego 1719")).toBe(true);
  });

  it("returns false on empty input", () => {
    expect(modelDesignationMatches("", "FH 460")).toBe(false);
    expect(modelDesignationMatches("fh13460", "")).toBe(false);
  });
});

describe("applicationMatchesModel", () => {
  it("requires both brand and designation", () => {
    expect(applicationMatchesModel({ vehicleBrand: "Volvo", vehicleModel: "fh13460" }, FH460)).toBe(
      true,
    );
    // Right designation, wrong brand.
    expect(applicationMatchesModel({ vehicleBrand: "Iveco", vehicleModel: "fh13460" }, FH460)).toBe(
      false,
    );
    // Right brand, wrong designation.
    expect(applicationMatchesModel({ vehicleBrand: "Volvo", vehicleModel: "fm12340" }, FM370)).toBe(
      false,
    );
  });

  it("matches the Scania and Ford shapes seen in production", () => {
    expect(applicationMatchesModel({ vehicleBrand: "Scania", vehicleModel: "r500" }, R500)).toBe(
      true,
    );
    expect(
      applicationMatchesModel({ vehicleBrand: "Ford", vehicleModel: "cargo 1719" }, CARGO1719),
    ).toBe(true);
  });

  it("matches Mercedes written without the hyphen", () => {
    expect(
      applicationMatchesModel({ vehicleBrand: "Mercedes Benz", vehicleModel: "Atego 1719" }, ATEGO),
    ).toBe(true);
  });

  it("survives missing fields", () => {
    expect(
      applicationMatchesModel({ vehicleBrand: undefined, vehicleModel: "fh13460" }, FH460),
    ).toBe(false);
    expect(applicationMatchesModel({ vehicleBrand: "Volvo", vehicleModel: undefined }, FH460)).toBe(
      false,
    );
  });
});
