/**
 * Catalog of heavy-vehicle brands × models × engines used to generate `IVehicle`
 * and to populate `IApplication` of parts. Coverage focuses on the brands GALLO
 * commercially serves (Volvo, Scania, Mercedes-Benz, Ford Cargo, Iveco).
 */
export interface IVehicleModelEntry {
  brand: string;
  model: string;
  engines: string[];
  /** Inclusive year range in which the model was commercially offered. */
  yearStart: number;
  yearEnd: number;
}

export const SEED_VEHICLE_MODELS: IVehicleModelEntry[] = [
  // Volvo
  {
    brand: "Volvo",
    model: "FH 460",
    engines: ["D13K460", "D13K500"],
    yearStart: 2015,
    yearEnd: 2024,
  },
  { brand: "Volvo", model: "FH 540", engines: ["D13K540"], yearStart: 2017, yearEnd: 2024 },
  {
    brand: "Volvo",
    model: "FM 370",
    engines: ["D11K370", "D11K410"],
    yearStart: 2014,
    yearEnd: 2023,
  },
  { brand: "Volvo", model: "VM 270", engines: ["MWM 7.2"], yearStart: 2012, yearEnd: 2022 },

  // Scania
  {
    brand: "Scania",
    model: "R 450",
    engines: ["DC13", "DC13 EURO 5"],
    yearStart: 2014,
    yearEnd: 2024,
  },
  { brand: "Scania", model: "R 500", engines: ["DC13 EURO 6"], yearStart: 2018, yearEnd: 2024 },
  { brand: "Scania", model: "G 410", engines: ["DC13"], yearStart: 2013, yearEnd: 2022 },
  { brand: "Scania", model: "P 320", engines: ["DC09"], yearStart: 2012, yearEnd: 2023 },

  // Mercedes-Benz
  {
    brand: "Mercedes-Benz",
    model: "Actros 2651",
    engines: ["OM 473 LA"],
    yearStart: 2016,
    yearEnd: 2024,
  },
  {
    brand: "Mercedes-Benz",
    model: "Axor 2544",
    engines: ["OM 457 LA"],
    yearStart: 2012,
    yearEnd: 2022,
  },
  {
    brand: "Mercedes-Benz",
    model: "Atego 1719",
    engines: ["OM 924 LA"],
    yearStart: 2011,
    yearEnd: 2023,
  },
  {
    brand: "Mercedes-Benz",
    model: "Accelo 815",
    engines: ["OM 924"],
    yearStart: 2014,
    yearEnd: 2023,
  },

  // Ford Cargo (legacy parc — Ford parou de produzir caminhões no Brasil em 2019)
  {
    brand: "Ford Cargo",
    model: "1719",
    engines: ["Cummins ISBe4"],
    yearStart: 2012,
    yearEnd: 2019,
  },
  { brand: "Ford Cargo", model: "2842", engines: ["Cummins ISLe"], yearStart: 2013, yearEnd: 2019 },
  {
    brand: "Ford Cargo",
    model: "1119",
    engines: ["Cummins ISBe4"],
    yearStart: 2012,
    yearEnd: 2019,
  },

  // Iveco
  {
    brand: "Iveco",
    model: "Stralis 600S44T",
    engines: ["Cursor 13"],
    yearStart: 2014,
    yearEnd: 2023,
  },
  { brand: "Iveco", model: "Tector 240E28", engines: ["Tector 6"], yearStart: 2013, yearEnd: 2024 },
  { brand: "Iveco", model: "Daily 70C17", engines: ["F1C"], yearStart: 2013, yearEnd: 2024 },
];
