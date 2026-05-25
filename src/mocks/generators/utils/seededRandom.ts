import seedrandom from "seedrandom";
import { faker } from "@faker-js/faker/locale/pt_BR";

/**
 * Deterministic RNG context passed to every generator.
 *
 * Two underlying sources are kept aligned to the same logical seed:
 *  - `rng()` — `seedrandom` instance returning numbers in [0, 1)
 *  - `faker` — module-level Faker re-seeded with a derived integer
 *
 * Generators MUST consume randomness exclusively through this context.
 * Calling `Math.random()` or unscoped `faker.*` directly defeats determinism.
 */
export interface ISeededContext {
  /** Numeric seed that produced this context. */
  seed: number;
  /** Numbers in [0, 1) — same contract as `Math.random`. */
  rng: () => number;
  /** Integer in [min, max] inclusive. */
  int: (min: number, max: number) => number;
  /** Random pick from a non-empty array. */
  pick: <T>(items: readonly T[]) => T;
  /** Returns true with the given probability (0..1). */
  bool: (probability?: number) => boolean;
  /** Locale-aware Faker module, already re-seeded. */
  faker: typeof faker;
}

/**
 * Create a fresh seeded context. The same `seed` value MUST produce identical
 * outputs across runs and machines.
 */
export function createSeededContext(seed: number): ISeededContext {
  const rng = seedrandom(String(seed));
  // Faker accepts a single integer seed; multiply to keep the high bits in play.
  faker.seed(Math.floor(seed * 9973) >>> 0);

  const int = (min: number, max: number): number => {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    return Math.floor(rng() * (hi - lo + 1)) + lo;
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new Error("createSeededContext.pick: cannot pick from empty array");
    }
    return items[int(0, items.length - 1)];
  };

  const bool = (probability = 0.5): boolean => rng() < probability;

  return { seed, rng, int, pick, bool, faker };
}
