import { describe, it, expect } from "vitest";
import { normalizeVehicleBrandModel } from "./vehicleNormalize";

describe("normalizeVehicleBrandModel", () => {
  it("recognizes Volvo FH/FM/VM models", () => {
    expect(normalizeVehicleBrandModel("FH 540 6X4T")).toEqual({
      brand: "Volvo",
      model: "FH 540 6X4T",
    });
  });

  it("recognizes Scania R/P/G/S numbered models", () => {
    expect(normalizeVehicleBrandModel("R 440 A6X4")).toEqual({
      brand: "Scania",
      model: "R 440 A6X4",
    });
  });

  it("recognizes Mercedes-Benz Actros/Atego/Axor/Accelo", () => {
    expect(normalizeVehicleBrandModel("ACTROS 2651LS6X4")).toEqual({
      brand: "Mercedes-Benz",
      model: "ACTROS 2651LS6X4",
    });
  });

  it("recognizes Toyota Hilux (light vehicle)", () => {
    expect(normalizeVehicleBrandModel("HILUX CD4X4 SRV")).toEqual({
      brand: "Toyota",
      model: "HILUX CD4X4 SRV",
    });
  });

  it("defaults NN.NNN numeric-prefix models to Ford Cargo", () => {
    expect(normalizeVehicleBrandModel("24.280 CRM 6X2")).toEqual({
      brand: "Ford Cargo",
      model: "24.280 CRM 6X2",
    });
  });

  it("prefers Volkswagen over Ford Cargo when the text names a VW line explicitly", () => {
    expect(normalizeVehicleBrandModel("24.280 CONSTELLATION 6X2")).toEqual({
      brand: "Volkswagen",
      model: "24.280 CONSTELLATION 6X2",
    });
  });

  it("falls back to Outra for an unrecognized model, preserving the original text", () => {
    expect(normalizeVehicleBrandModel("ZX90 EXPERIMENTAL")).toEqual({
      brand: "Outra",
      model: "ZX90 EXPERIMENTAL",
    });
  });

  it("falls back to Outra / Não informado for empty or null input", () => {
    expect(normalizeVehicleBrandModel("")).toEqual({ brand: "Outra", model: "Não informado" });
    expect(normalizeVehicleBrandModel(null)).toEqual({ brand: "Outra", model: "Não informado" });
  });
});
