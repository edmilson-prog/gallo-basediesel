/**
 * Domain vocabulary for generating realistic `IPart` records. Faker-generated
 * texts alone produce nonsense for catalog descriptions; this list anchors
 * names, suppliers, brands and OEM prefixes to vocabulary that matches the
 * heavy-truck parts business.
 */
export interface IPartCategory {
  id: string;
  label: string;
  /** Vocabulary used to compose part names (`<adjective?> <noun>`). */
  nouns: string[];
  adjectives: string[];
  /** Reasonable cost (BRL) band per category — generator picks within. */
  costRange: [number, number];
  /** Mean margin (decimal) used to derive `unitPrice` from `unitCost`. */
  marginMean: number;
}

export const PART_CATEGORIES: IPartCategory[] = [
  {
    id: "motor",
    label: "Motor",
    nouns: [
      "pistão",
      "biela",
      "anel de pistão",
      "junta de cabeçote",
      "bomba d'água",
      "turbocompressor",
    ],
    adjectives: ["forjado", "reforçado", "original", "standard"],
    costRange: [380, 6800],
    marginMean: 0.32,
  },
  {
    id: "freios",
    label: "Freios",
    nouns: [
      "lona de freio",
      "pastilha de freio",
      "tambor de freio",
      "câmara de freio",
      "regulador de freio",
    ],
    adjectives: ["dianteira", "traseira", "reforçada", "cerâmica"],
    costRange: [120, 2400],
    marginMean: 0.38,
  },
  {
    id: "transmissao",
    label: "Transmissão / Embreagem",
    nouns: [
      "disco de embreagem",
      "platô",
      "rolamento de embreagem",
      "sincronizador",
      "eixo cardan",
    ],
    adjectives: ["completo", "reforçado", "monodisco", "bidisco"],
    costRange: [320, 5400],
    marginMean: 0.3,
  },
  {
    id: "suspensao",
    label: "Suspensão / Direção",
    nouns: [
      "amortecedor",
      "feixe de mola",
      "buchas",
      "barra estabilizadora",
      "terminal de direção",
      "caixa de direção",
    ],
    adjectives: ["dianteiro", "traseiro", "hidráulica", "reforçada"],
    costRange: [180, 3200],
    marginMean: 0.34,
  },
  {
    id: "eletrica",
    label: "Elétrica",
    nouns: [
      "alternador",
      "motor de partida",
      "bateria",
      "chicote",
      "sensor de rotação",
      "módulo ECU",
    ],
    adjectives: ["12V", "24V", "selada", "estacionária", "OEM"],
    costRange: [220, 4800],
    marginMean: 0.36,
  },
  {
    id: "filtros",
    label: "Filtros",
    nouns: [
      "filtro de óleo",
      "filtro de combustível",
      "filtro de ar",
      "filtro separador",
      "filtro de cabine",
    ],
    adjectives: ["primário", "secundário", "premium", "duplo elemento"],
    costRange: [35, 320],
    marginMean: 0.45,
  },
  {
    id: "arrefecimento",
    label: "Arrefecimento",
    nouns: ["radiador", "intercooler", "ventoinha", "termostato", "mangueira d'água"],
    adjectives: ["completo", "alumínio", "viscoso"],
    costRange: [180, 5200],
    marginMean: 0.32,
  },
  {
    id: "lubrificantes",
    label: "Lubrificantes / Aditivos",
    nouns: ["óleo de motor", "óleo de câmbio", "óleo hidráulico", "graxa", "aditivo arla 32"],
    adjectives: ["15W40", "10W40", "sintético", "mineral", "extra pressão"],
    costRange: [45, 980],
    marginMean: 0.5,
  },
];

export const SUPPLIER_NAMES: string[] = [
  "Bosch",
  "Mahle",
  "Eaton",
  "ZF",
  "Cummins",
  "Knorr-Bremse",
  "WABCO",
  "Tecfil",
  "Fram",
  "Donaldson",
  "Garrett",
  "BorgWarner",
  "Continental",
  "Valeo",
  "SKF",
  "FAG",
  "Iveco Parts",
  "Volvo Genuine",
  "Scania Original",
  "Mopar",
];

export const PART_BRAND_NAMES: string[] = [
  "Bosch",
  "Mahle Original",
  "Eaton",
  "ZF Aftermarket",
  "Cummins OEM",
  "Knorr",
  "WABCO",
  "Tecfil",
  "Fram",
  "Donaldson",
  "Garrett",
  "Genuine Parts",
];

/** Prefixes used to mint OEM codes — kept short so they read like real parts numbers. */
export const OEM_PREFIXES: string[] = ["VOL", "SCN", "MBZ", "FRD", "IVE", "BSH", "MHL", "ETN"];
