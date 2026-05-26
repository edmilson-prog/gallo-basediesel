/**
 * Vehicle models per brand recognised by the extractor. The canonical model
 * names match the catalog vocabulary in
 * `src/mocks/data/seedVehicleModels.ts` so the search step can compare strings
 * literally.
 *
 * Customers commonly drop whitespace ("R450" vs "R 450") or use the partial
 * model number alone ("450"). Aliases cover both flavours.
 */
export interface IModelEntry {
  /** Canonical model name (matches `IApplication.vehicleModel`). */
  canonical: string;
  brand: string;
  aliases: string[];
}

export const MODELS_BY_BRAND: Record<string, IModelEntry[]> = {
  Volvo: [
    { canonical: "FH 460", brand: "Volvo", aliases: ["fh 460", "fh460", "fh-460"] },
    { canonical: "FH 540", brand: "Volvo", aliases: ["fh 540", "fh540", "fh-540"] },
    { canonical: "FM 370", brand: "Volvo", aliases: ["fm 370", "fm370", "fm-370"] },
    { canonical: "VM 270", brand: "Volvo", aliases: ["vm 270", "vm270", "vm-270"] },
  ],
  Scania: [
    { canonical: "R 450", brand: "Scania", aliases: ["r 450", "r450", "r-450"] },
    { canonical: "R 500", brand: "Scania", aliases: ["r 500", "r500", "r-500"] },
    { canonical: "G 410", brand: "Scania", aliases: ["g 410", "g410", "g-410"] },
    { canonical: "P 320", brand: "Scania", aliases: ["p 320", "p320", "p-320"] },
  ],
  "Mercedes-Benz": [
    {
      canonical: "Actros 2651",
      brand: "Mercedes-Benz",
      aliases: ["actros 2651", "actros2651", "actros"],
    },
    {
      canonical: "Axor 2544",
      brand: "Mercedes-Benz",
      aliases: ["axor 2544", "axor2544", "axor"],
    },
    {
      canonical: "Atego 1719",
      brand: "Mercedes-Benz",
      aliases: ["atego 1719", "atego1719", "atego"],
    },
    {
      canonical: "Accelo 815",
      brand: "Mercedes-Benz",
      aliases: ["accelo 815", "accelo815", "accelo"],
    },
  ],
  "Ford Cargo": [
    { canonical: "1719", brand: "Ford Cargo", aliases: ["1719"] },
    { canonical: "2842", brand: "Ford Cargo", aliases: ["2842"] },
    { canonical: "1119", brand: "Ford Cargo", aliases: ["1119"] },
  ],
  Iveco: [
    {
      canonical: "Stralis 600S44T",
      brand: "Iveco",
      aliases: ["stralis 600s44t", "stralis 600", "stralis"],
    },
    {
      canonical: "Tector 240E28",
      brand: "Iveco",
      aliases: ["tector 240e28", "tector 240", "tector"],
    },
    {
      canonical: "Daily 70C17",
      brand: "Iveco",
      aliases: ["daily 70c17", "daily 70", "daily"],
    },
  ],
};

/** Flat list of every model entry — convenient when the brand is unknown. */
export const ALL_MODELS: IModelEntry[] = Object.values(MODELS_BY_BRAND).flat();
