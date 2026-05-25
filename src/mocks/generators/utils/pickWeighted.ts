import type { ISeededContext } from "./seededRandom";

/** Weighted option for {@link pickWeighted}. */
export interface IWeightedOption<T> {
  value: T;
  weight: number;
}

/**
 * Pick one option respecting the relative weights. Weights need not sum to 1;
 * the helper normalizes on the fly. Throws if the input is empty or every
 * weight is zero.
 */
export function pickWeighted<T>(
  ctx: ISeededContext,
  options: ReadonlyArray<IWeightedOption<T>>,
): T {
  if (options.length === 0) {
    throw new Error("pickWeighted: options must not be empty");
  }
  const total = options.reduce((acc, o) => acc + Math.max(0, o.weight), 0);
  if (total <= 0) {
    throw new Error("pickWeighted: total weight must be positive");
  }
  let r = ctx.rng() * total;
  for (const option of options) {
    r -= Math.max(0, option.weight);
    if (r <= 0) return option.value;
  }
  return options[options.length - 1].value;
}

/**
 * Distribute a known total count across categorical buckets following the
 * configured weights. Used by bootstrap to honor status distributions like
 * "30 ativos / 10 dormentes / 5 recuperacao / 5 perdidos" without manual loops.
 */
export function distributeByWeights<K extends string>(
  ctx: ISeededContext,
  total: number,
  weights: Record<K, number>,
): Record<K, number> {
  const keys = Object.keys(weights) as K[];
  const sum = keys.reduce((acc, k) => acc + Math.max(0, weights[k]), 0);
  if (sum <= 0) {
    throw new Error("distributeByWeights: weights must have positive sum");
  }

  const raw = keys.map((k) => (Math.max(0, weights[k]) / sum) * total);
  const floored = raw.map((v) => Math.floor(v));
  let allocated = floored.reduce((acc, v) => acc + v, 0);

  const result = {} as Record<K, number>;
  keys.forEach((k, i) => (result[k] = floored[i]));

  // Distribute leftover units to buckets with the largest fractional remainder,
  // breaking ties via ctx.rng to keep distribution unbiased yet deterministic.
  const remainders = raw.map((v, i) => ({ idx: i, frac: v - floored[i], jitter: ctx.rng() }));
  remainders.sort((a, b) => b.frac - a.frac || b.jitter - a.jitter);

  let i = 0;
  while (allocated < total && i < remainders.length) {
    result[keys[remainders[i].idx]] += 1;
    allocated += 1;
    i += 1;
  }

  return result;
}
