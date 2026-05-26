import type { PartCategory } from "@/shared/types";

/**
 * Keyword-driven taxonomy of part families. The extractor walks every entry
 * in declaration order; whichever matches first wins the `partCategory`
 * slot. Sub-types refine the category once the parent matched.
 *
 * @see ../../../../shared/types/part-identification.ts
 */
export interface IPartCategoryEntry {
  canonical: PartCategory;
  /** Lower-case keywords that trigger this category. */
  keywords: string[];
  /** Sub-type vocabulary recognised when the parent category is present. */
  subtypes: Array<{
    canonical: string;
    keywords: string[];
  }>;
}

export const PART_CATEGORY_ENTRIES: IPartCategoryEntry[] = [
  {
    canonical: "filtro",
    keywords: ["filtro", "filtros"],
    subtypes: [
      { canonical: "oleo", keywords: ["óleo", "oleo", "lubrificante"] },
      { canonical: "ar", keywords: ["ar"] },
      { canonical: "combustivel", keywords: ["combustível", "combustivel", "diesel"] },
      { canonical: "cabine", keywords: ["cabine", "habitáculo", "habitaculo"] },
      { canonical: "separador", keywords: ["separador", "racor"] },
    ],
  },
  {
    canonical: "freio",
    keywords: ["freio", "freios"],
    subtypes: [
      { canonical: "pastilha", keywords: ["pastilha"] },
      { canonical: "lona", keywords: ["lona"] },
      { canonical: "tambor", keywords: ["tambor"] },
      { canonical: "camara", keywords: ["câmara", "camara"] },
      { canonical: "disco", keywords: ["disco"] },
    ],
  },
  {
    canonical: "embreagem",
    keywords: ["embreagem"],
    subtypes: [
      { canonical: "disco", keywords: ["disco"] },
      { canonical: "plato", keywords: ["platô", "plato"] },
      { canonical: "rolamento", keywords: ["rolamento"] },
      { canonical: "kit", keywords: ["kit"] },
    ],
  },
  {
    canonical: "transmissao",
    keywords: ["câmbio", "cambio", "transmissão", "transmissao", "cardan", "câmbio"],
    subtypes: [
      { canonical: "sincronizador", keywords: ["sincronizador"] },
      { canonical: "cardan", keywords: ["cardan"] },
      { canonical: "diferencial", keywords: ["diferencial"] },
    ],
  },
  {
    canonical: "suspensao",
    keywords: ["suspensão", "suspensao", "amortecedor", "feixe", "barra estabilizadora"],
    subtypes: [
      { canonical: "amortecedor", keywords: ["amortecedor"] },
      { canonical: "feixe", keywords: ["feixe", "mola"] },
      { canonical: "bucha", keywords: ["bucha", "buchas"] },
      { canonical: "terminal", keywords: ["terminal"] },
    ],
  },
  {
    canonical: "eletrica",
    keywords: [
      "elétric",
      "eletric",
      "alternador",
      "motor de partida",
      "bateria",
      "sensor",
      "chicote",
    ],
    subtypes: [
      { canonical: "alternador", keywords: ["alternador"] },
      { canonical: "partida", keywords: ["motor de partida", "partida"] },
      { canonical: "bateria", keywords: ["bateria"] },
      { canonical: "sensor", keywords: ["sensor"] },
      { canonical: "chicote", keywords: ["chicote"] },
    ],
  },
  {
    canonical: "motor",
    keywords: [
      "motor",
      "pistão",
      "pistao",
      "biela",
      "anel",
      "junta de cabeçote",
      "junta de cabecote",
      "turbocompressor",
      "turbo",
      "bomba d'água",
      "bomba dagua",
    ],
    subtypes: [
      { canonical: "pistao", keywords: ["pistão", "pistao"] },
      { canonical: "biela", keywords: ["biela"] },
      { canonical: "turbo", keywords: ["turbocompressor", "turbo"] },
      { canonical: "bomba_agua", keywords: ["bomba d'água", "bomba dagua"] },
      { canonical: "junta", keywords: ["junta de cabeçote", "junta de cabecote", "junta"] },
    ],
  },
  {
    canonical: "arrefecimento",
    keywords: ["radiador", "intercooler", "ventoinha", "termostato", "mangueira d'água"],
    subtypes: [
      { canonical: "radiador", keywords: ["radiador"] },
      { canonical: "intercooler", keywords: ["intercooler"] },
      { canonical: "ventoinha", keywords: ["ventoinha"] },
      { canonical: "termostato", keywords: ["termostato"] },
    ],
  },
  {
    canonical: "correia",
    keywords: ["correia"],
    subtypes: [
      { canonical: "dentada", keywords: ["dentada"] },
      { canonical: "trapezoidal", keywords: ["trapezoidal", "em v"] },
      { canonical: "alternador", keywords: ["alternador"] },
    ],
  },
  {
    canonical: "lubrificante",
    keywords: ["óleo", "oleo", "lubrificante", "graxa", "aditivo", "arla"],
    subtypes: [
      { canonical: "motor", keywords: ["motor"] },
      { canonical: "cambio", keywords: ["câmbio", "cambio"] },
      { canonical: "hidraulico", keywords: ["hidráulico", "hidraulico"] },
      { canonical: "graxa", keywords: ["graxa"] },
      { canonical: "arla", keywords: ["arla", "arla 32"] },
    ],
  },
];

/**
 * Inverse map: catalog `partCategories.ts` entry id (used by the mocks
 * generator) → PRD-021 canonical category. Keeps `searchCatalog()` able to
 * filter mock parts by their inferred category without needing a new field.
 */
export const CATALOG_CATEGORY_TO_CANONICAL: Record<string, PartCategory> = {
  motor: "motor",
  freios: "freio",
  transmissao: "transmissao",
  suspensao: "suspensao",
  eletrica: "eletrica",
  filtros: "filtro",
  arrefecimento: "arrefecimento",
  lubrificantes: "lubrificante",
};
