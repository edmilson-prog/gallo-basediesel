/**
 * Grouping for the canonical model catalog. A canonical record is
 * brand + model + engine, so `FH 460 D13K460` and `FH 460 D13K500` are two rows
 * — but to whoever curates kits they are the same truck. This module puts the
 * engines of one designation together, which is what makes "one has a kit, the
 * other does not" visible instead of buried twenty rows apart.
 */

export interface IGroupableModel {
  id: string;
  brand: string;
  model: string;
}

/** Same truck, different canonical record: brand + model match, id does not. */
export function isSiblingModel(a: IGroupableModel, b: IGroupableModel): boolean {
  return a.id !== b.id && a.brand === b.brand && a.model === b.model;
}

/** The other canonical records of the same designation. */
export function getSiblingModels<T extends IGroupableModel>(
  model: IGroupableModel,
  models: readonly T[],
): T[] {
  return models.filter((candidate) => isSiblingModel(model, candidate));
}

/** One model designation and every engine registered under it. */
export interface IEngineBlock<T> {
  model: string;
  engines: T[];
}

export interface IBrandGroup<T> {
  brand: string;
  /** Models in the group, counting each engine — what the header reports. */
  count: number;
  blocks: IEngineBlock<T>[];
}

/**
 * Brand → engine blocks, with `brandOrder` first (display order of the known
 * brands) and anything else appended in first-seen order. Blocks group by
 * designation rather than by adjacency, so an unsorted provider response still
 * puts the siblings together.
 */
export function groupModelsByBrand<T extends IGroupableModel>(
  models: readonly T[],
  brandOrder: readonly string[],
): IBrandGroup<T>[] {
  const byBrand = new Map<string, T[]>();
  for (const model of models) {
    const list = byBrand.get(model.brand);
    if (list) list.push(model);
    else byBrand.set(model.brand, [model]);
  }

  const known = brandOrder.filter((brand) => byBrand.has(brand));
  const unknown = [...byBrand.keys()].filter((brand) => !brandOrder.includes(brand));

  return [...known, ...unknown].map((brand) => {
    const list = byBrand.get(brand) ?? [];
    const blocks: IEngineBlock<T>[] = [];
    const blockByModel = new Map<string, IEngineBlock<T>>();

    for (const model of list) {
      const existing = blockByModel.get(model.model);
      if (existing) {
        existing.engines.push(model);
        continue;
      }
      const block: IEngineBlock<T> = { model: model.model, engines: [model] };
      blockByModel.set(model.model, block);
      blocks.push(block);
    }

    return { brand, count: list.length, blocks };
  });
}
