import type {
  AttributeConfidence,
  IConversation,
  ICustomer,
  IExtractedAttributes,
  IVehicle,
  PartCategory,
} from "@/shared/types";
import { BRANDS } from "../data/brands";
import { ALL_MODELS, MODELS_BY_BRAND } from "../data/models";
import { ALL_ENGINES, ENGINES_BY_BRAND } from "../data/engines";
import { PART_CATEGORY_ENTRIES } from "../data/partCategories";

/**
 * Result of a single attribute parser. `value` is undefined when the parser
 * did not find a match; `confidence` is then `0`. Parsers are pure and
 * deterministic — replacing them with an LLM call on Fase 2 only requires
 * keeping this shape.
 */
export interface IParseResult<T> {
  value?: T;
  confidence: number;
  /** Substring of the input that triggered the match — surfaced on the inspector. */
  matchedSubstring?: string;
}

export interface IExtractContext {
  conversation?: IConversation;
  customer?: ICustomer;
  /** Pre-loaded fleet for the customer; enables vehicle reuse (RF-008). */
  vehicles?: IVehicle[];
}

export interface IExtractResult {
  attributes: IExtractedAttributes;
  attributeConfidence: AttributeConfidence;
  /** Aggregated confidence across all attributes (0..1). */
  confidence: number;
  /** True when at least one attribute came from the cadastrado vehicle. */
  reusedFromVehicle: boolean;
  /** True when the customer owns 2+ vehicles and we could not auto-pick one. */
  multipleVehiclesAmbiguous: boolean;
}

function normalize(input: string): string {
  return input.toLowerCase().trim();
}

/**
 * Brand parser — scans the normalised text for the first alias match across
 * `BRANDS`. Long aliases are tried first so "mercedes-benz" beats "mercedes".
 */
export function extractBrand(text: string): IParseResult<string> {
  const norm = normalize(text);
  let best: IParseResult<string> = { confidence: 0 };
  for (const entry of BRANDS) {
    for (const alias of [...entry.aliases].sort((a, b) => b.length - a.length)) {
      if (norm.includes(alias)) {
        const confidence = alias.length >= 5 ? 1 : 0.85;
        if (confidence > best.confidence) {
          best = { value: entry.canonical, confidence, matchedSubstring: alias };
        }
      }
    }
  }
  return best;
}

/**
 * Model parser — scoped to the detected brand when available, otherwise
 * searches every catalog model. Aliases are tried from longest to shortest
 * (so `"r 500"` is preferred over `"r"`-prefixed shorter aliases when both
 * could match).
 */
export function extractModel(text: string, brand?: string): IParseResult<string> {
  const norm = normalize(text);
  const pool = brand && MODELS_BY_BRAND[brand] ? MODELS_BY_BRAND[brand] : ALL_MODELS;
  let best: IParseResult<string> = { confidence: 0 };
  for (const entry of pool) {
    for (const alias of [...entry.aliases].sort((a, b) => b.length - a.length)) {
      if (norm.includes(alias)) {
        const confidence = alias.length >= 4 ? 0.95 : 0.75;
        if (confidence > best.confidence) {
          best = { value: entry.canonical, confidence, matchedSubstring: alias };
        }
      }
    }
  }
  return best;
}

/**
 * Year parser — matches a 4-digit year inside the plausible range
 * `[1990, currentYear + 1]`. The first hit wins.
 */
export function extractYear(
  text: string,
  nowYear: number = new Date().getFullYear(),
): IParseResult<number> {
  const match = text.match(/(19|20)\d{2}/);
  if (!match) return { confidence: 0 };
  const year = Number(match[0]);
  if (year < 1990 || year > nowYear + 1) return { confidence: 0 };
  return { value: year, confidence: 1, matchedSubstring: match[0] };
}

export function extractEngine(text: string, brand?: string): IParseResult<string> {
  const norm = normalize(text);
  const pool = brand && ENGINES_BY_BRAND[brand] ? ENGINES_BY_BRAND[brand] : ALL_ENGINES;
  let best: IParseResult<string> = { confidence: 0 };
  for (const entry of pool) {
    for (const alias of [...entry.aliases].sort((a, b) => b.length - a.length)) {
      if (norm.includes(alias)) {
        const confidence = alias.length >= 5 ? 0.95 : 0.8;
        if (confidence > best.confidence) {
          best = { value: entry.canonical, confidence, matchedSubstring: alias };
        }
      }
    }
  }
  return best;
}

export function extractPartCategory(text: string): IParseResult<PartCategory> {
  const norm = normalize(text);
  for (const entry of PART_CATEGORY_ENTRIES) {
    for (const keyword of entry.keywords) {
      if (norm.includes(keyword)) {
        return { value: entry.canonical, confidence: 0.95, matchedSubstring: keyword };
      }
    }
  }
  return { confidence: 0 };
}

export function extractPartSubtype(text: string, category: PartCategory): IParseResult<string> {
  const norm = normalize(text);
  const entry = PART_CATEGORY_ENTRIES.find((e) => e.canonical === category);
  if (!entry) return { confidence: 0 };
  for (const sub of entry.subtypes) {
    for (const keyword of sub.keywords) {
      if (norm.includes(keyword)) {
        return { value: sub.canonical, confidence: 0.85, matchedSubstring: keyword };
      }
    }
  }
  return { confidence: 0 };
}

/**
 * OEM parser — matches a contiguous run of 6+ digits (optionally prefixed
 * with letters and an optional dash, mirroring how the mock generator mints
 * codes: `VOL-123456`). 1.0 confidence whenever a code is found.
 */
export function extractOemCode(text: string): IParseResult<string> {
  const dashed = text.match(/\b[A-Z]{2,4}-\d{4,8}\b/i);
  if (dashed) {
    return { value: dashed[0].toUpperCase(), confidence: 1, matchedSubstring: dashed[0] };
  }
  const digits = text.match(/\b\d{6,}\b/);
  if (digits) {
    return { value: digits[0], confidence: 1, matchedSubstring: digits[0] };
  }
  return { confidence: 0 };
}

/**
 * Compose attributes out of every parser, optionally reusing the customer's
 * single registered vehicle when brand/model/year are absent from the text.
 * The aggregate confidence is the unweighted mean of every populated
 * attribute's confidence — easy to read on the inspector and adequate for
 * the keyword MVP.
 *
 * Replacing this with an LLM-based extractor on Fase 2 only requires keeping
 * the `IExtractResult` shape stable; consumers do not change.
 */
export function extractAttributes(text: string, context: IExtractContext = {}): IExtractResult {
  const brand = extractBrand(text);
  const model = extractModel(text, brand.value);
  const year = extractYear(text);
  const engine = extractEngine(text, brand.value);
  const category = extractPartCategory(text);
  const subtype = category.value
    ? extractPartSubtype(text, category.value)
    : ({ confidence: 0 } as IParseResult<string>);
  const oem = extractOemCode(text);

  const attributes: IExtractedAttributes = {
    brand: brand.value,
    model: model.value,
    year: year.value,
    engine: engine.value,
    partCategory: category.value,
    partSubtype: subtype.value,
    oemCode: oem.value,
  };
  const attributeConfidence: AttributeConfidence = {
    brand: brand.confidence,
    model: model.confidence,
    year: year.confidence,
    engine: engine.confidence,
    partCategory: category.confidence,
    partSubtype: subtype.confidence,
    oemCode: oem.confidence,
  };

  let reusedFromVehicle = false;
  let multipleVehiclesAmbiguous = false;
  const fleet = context.vehicles ?? [];
  if (fleet.length === 1 && !attributes.brand && !attributes.model) {
    const v = fleet[0];
    attributes.brand = v.brand;
    attributes.model = v.model;
    attributes.year = attributes.year ?? v.year;
    attributes.engine = attributes.engine ?? v.engine;
    attributeConfidence.brand = 0.9;
    attributeConfidence.model = 0.9;
    if (!year.value) attributeConfidence.year = 0.9;
    if (!engine.value) attributeConfidence.engine = 0.9;
    reusedFromVehicle = true;
  } else if (fleet.length > 1 && !attributes.brand && !attributes.model) {
    multipleVehiclesAmbiguous = true;
  }

  const populated = (
    Object.entries(attributeConfidence) as Array<[keyof AttributeConfidence, number | undefined]>
  )
    .filter(([, c]) => (c ?? 0) > 0)
    .map(([, c]) => c ?? 0);
  const confidence =
    populated.length === 0 ? 0 : populated.reduce((acc, c) => acc + c, 0) / populated.length;

  return {
    attributes,
    attributeConfidence,
    confidence,
    reusedFromVehicle,
    multipleVehiclesAmbiguous,
  };
}
