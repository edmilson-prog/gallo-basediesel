/**
 * Engine codes per brand. The extractor matches case-insensitively against
 * either the canonical code or any alias. Canonical codes must mirror the
 * vocabulary used on `seedVehicleModels.ts` so cross-references work.
 */
export interface IEngineEntry {
  canonical: string;
  brand: string;
  aliases: string[];
}

export const ENGINES_BY_BRAND: Record<string, IEngineEntry[]> = {
  Volvo: [
    { canonical: "D13K460", brand: "Volvo", aliases: ["d13k460", "d13"] },
    { canonical: "D13K500", brand: "Volvo", aliases: ["d13k500"] },
    { canonical: "D13K540", brand: "Volvo", aliases: ["d13k540"] },
    { canonical: "D11K370", brand: "Volvo", aliases: ["d11k370", "d11"] },
    { canonical: "D11K410", brand: "Volvo", aliases: ["d11k410"] },
  ],
  Scania: [
    { canonical: "DC13", brand: "Scania", aliases: ["dc13", "dc 13"] },
    { canonical: "DC13 EURO 5", brand: "Scania", aliases: ["dc13 euro 5", "dc13 e5"] },
    { canonical: "DC13 EURO 6", brand: "Scania", aliases: ["dc13 euro 6", "dc13 e6"] },
    { canonical: "DC09", brand: "Scania", aliases: ["dc09", "dc 09"] },
  ],
  "Mercedes-Benz": [
    { canonical: "OM 473 LA", brand: "Mercedes-Benz", aliases: ["om 473 la", "om473"] },
    { canonical: "OM 457 LA", brand: "Mercedes-Benz", aliases: ["om 457 la", "om457", "om457la"] },
    { canonical: "OM 924 LA", brand: "Mercedes-Benz", aliases: ["om 924 la", "om924"] },
    { canonical: "OM 924", brand: "Mercedes-Benz", aliases: ["om 924"] },
  ],
  "Ford Cargo": [
    { canonical: "Cummins ISBe4", brand: "Ford Cargo", aliases: ["cummins isbe4", "isbe4"] },
    { canonical: "Cummins ISLe", brand: "Ford Cargo", aliases: ["cummins isle", "isle"] },
  ],
  Iveco: [
    { canonical: "Cursor 13", brand: "Iveco", aliases: ["cursor 13", "cursor13"] },
    { canonical: "Tector 6", brand: "Iveco", aliases: ["tector 6", "tector6"] },
    { canonical: "F1C", brand: "Iveco", aliases: ["f1c"] },
  ],
};

export const ALL_ENGINES: IEngineEntry[] = Object.values(ENGINES_BY_BRAND).flat();
