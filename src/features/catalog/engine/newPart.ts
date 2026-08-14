import type { PartCategory } from "@/shared/types";
import { computePrice } from "../utils/pricing";

/** Shortest code worth sending to the catalog — below this every part matches. */
export const MIN_CODE_LENGTH = 3;

/** Where the catalog lookup for the typed code currently stands. */
export type PartCodeLookupStatus = "idle" | "loading" | "success" | "error";

/**
 * State of the code field on the "Nova peça" form — one value drives the
 * adornment icon, the line under the field, which panel is shown and whether
 * the part can be created at all.
 *
 * The code goes first because it is the one thing that already exists on the
 * box and on the invoice, and it is the only field that can tell the person
 * they are about to create a part the catalog already has. Checking it on
 * submit — after everything else was typed — is how the 2.778-row base grew its
 * duplicates.
 */
export type PartCodeState =
  /** Nothing typed yet. */
  | "idle"
  /** Some characters, still too few to look up. */
  | "typing"
  /** A lookup is in flight, or the debounce hasn't caught up with what's typed. */
  | "loading"
  /** The catalog already has this code. Blocks creation. */
  | "duplicate"
  /** The catalog doesn't know this code. */
  | "free"
  /** The catalog couldn't be reached. Never blocks creation. */
  | "error";

export interface INewPartCodeInput {
  code: string;
  /**
   * The debounced lookup hasn't caught up with what's typed yet. While true,
   * `duplicateFound` still describes the PREVIOUS code, so nothing derived from
   * it can be trusted — pasting a known code and hitting "Salvar" inside that
   * window is exactly the race this guards.
   */
  pending: boolean;
  status: PartCodeLookupStatus;
  duplicateFound: boolean;
}

/**
 * Single source of truth for the code field's state.
 *
 * Precedence, highest first: nothing typed → too short → a stale/in-flight
 * lookup → the catalog's answer.
 */
export function derivePartCodeState({
  code,
  pending,
  status,
  duplicateFound,
}: INewPartCodeInput): PartCodeState {
  const trimmed = code.trim();
  if (trimmed.length === 0) return "idle";
  if (trimmed.length < MIN_CODE_LENGTH) return "typing";
  if (pending) return "loading";

  switch (status) {
    case "success":
      return duplicateFound ? "duplicate" : "free";
    case "error":
      return "error";
    // "idle" only happens for the instant between the debounce landing and the
    // request starting — reading it as "checking" keeps the button honest.
    case "loading":
    case "idle":
    default:
      return "loading";
  }
}

/**
 * The code half of the submit gate. A failed lookup opens the gate on purpose:
 * the catalog being unreachable is our problem, not a reason to stop someone
 * from registering the part that is on the counter in front of them.
 */
export function canSubmitCode(state: PartCodeState): boolean {
  return state === "free" || state === "error";
}

export interface IPartPricingInput {
  unitCost: number;
  /** Markup over cost, as a decimal (1.2 = 120%). */
  markupPercent: number;
  /** Price typed by hand, used only when there is no cost to price from. */
  directPrice: number;
}

/**
 * The Padrão price the part is born with: derived from cost + markup when the
 * invoice cost is known, typed by hand otherwise. The other four channels are
 * offsets off this one (`buildPriceTables`).
 */
export function resolveStandardPrice({
  unitCost,
  markupPercent,
  directPrice,
}: IPartPricingInput): number {
  if (unitCost > 0) return computePrice(unitCost, markupPercent);
  return directPrice > 0 ? directPrice : 0;
}

export interface IPartCompletenessInput extends IPartPricingInput {
  code: string;
  name: string;
  brand: string;
  category: PartCategory | undefined;
  applicationCount: number;
}

/**
 * The same ruler the catalog list uses to count "prontas para venda": category
 * + manufacturer + cost + something that identifies the part (a code or an
 * application). A part that misses any of these lands in the enrichment queue
 * instead of the shelf.
 *
 * The cost is in the ruler because without it the margin is unknown, and a
 * price nobody can measure is a price nobody can defend at the counter.
 */
export function isSaleReady(input: IPartCompletenessInput): boolean {
  return (
    !!input.category &&
    input.brand.trim().length > 0 &&
    input.unitCost > 0 &&
    (input.code.trim().length >= MIN_CODE_LENGTH || input.applicationCount > 0)
  );
}

/** A field the form still needs before it will save anything. */
export type PartRequirement = "code" | "codeDuplicate" | "name" | "brand" | "category" | "price";

/**
 * What is still missing, in reading order — the footer spells this out instead
 * of greying the button and leaving the person to hunt for the reason.
 *
 * The code is reported only once its lookup has settled: saying "falta código"
 * while we are still asking the catalog would blame the person for our latency.
 */
export function missingRequirements(
  input: IPartCompletenessInput,
  codeState: PartCodeState,
): PartRequirement[] {
  const missing: PartRequirement[] = [];

  if (codeState === "duplicate") missing.push("codeDuplicate");
  else if (codeState === "idle" || codeState === "typing") missing.push("code");

  if (!input.name.trim()) missing.push("name");
  if (!input.brand.trim()) missing.push("brand");
  if (!input.category) missing.push("category");
  if (resolveStandardPrice(input) <= 0) missing.push("price");

  return missing;
}
