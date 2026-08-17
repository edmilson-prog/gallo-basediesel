import type { ID, VehicleModelStatus } from "@/shared/types";
import { isSiblingModel } from "@/features/vehicle-models/engine";

/**
 * The two sideways moves the kit editor offers, both answers to the same fact:
 * a filter kit that serves a D13K460 usually serves the D13K500 unchanged.
 *
 * - "Começar de um kit parecido" reads existing kits and asks how many of their
 *   parts reach the engine being curated;
 * - "Este kit também vale para" reads the composition on screen and asks which
 *   uncurated models every base part reaches.
 *
 * Both take compatibility as an argument instead of computing it — resolving a
 * part application against a canonical model is the catalog's job, not this
 * module's, and injecting it keeps these functions pure and cheap to test.
 */

export interface ICandidateModel {
  id: ID;
  brand: string;
  model: string;
  engine: string;
  status: VehicleModelStatus;
}

export interface ICandidateKitItem {
  partId: ID;
  isOptional: boolean;
}

export interface ICandidateKit {
  id: ID;
  modelId: ID;
  items: readonly ICandidateKitItem[];
}

export interface IStartFromCandidate<K, M> {
  kit: K;
  model: M;
  /** Same brand + model as the target — the copy that repeats in this catalog. */
  isSibling: boolean;
  /** Kit lines whose part reaches the target engine. */
  fit: number;
  /** `fit` over the kit's size, in 0…1. */
  ratio: number;
}

export interface IFindStartFromParams<K extends ICandidateKit, M extends ICandidateModel> {
  target: M;
  kits: readonly K[];
  modelsById: ReadonlyMap<ID, M>;
  /** Catalog parts whose applications reach the target engine. */
  compatiblePartIds: ReadonlySet<ID>;
  limit?: number;
  /** Below this share of usable parts a kit is a worse start than an empty one. */
  minRatio?: number;
}

/**
 * Kits worth cloning into the model being curated, siblings first and then by
 * how much of the kit survives the move. Only offered while the composition is
 * still empty — after that it would overwrite work.
 */
export function findStartFromCandidates<K extends ICandidateKit, M extends ICandidateModel>({
  target,
  kits,
  modelsById,
  compatiblePartIds,
  limit = 3,
  minRatio = 0.5,
}: IFindStartFromParams<K, M>): IStartFromCandidate<K, M>[] {
  const candidates: IStartFromCandidate<K, M>[] = [];

  for (const kit of kits) {
    if (kit.modelId === target.id) continue;
    const model = modelsById.get(kit.modelId);
    if (!model) continue;

    const fit = kit.items.filter((item) => compatiblePartIds.has(item.partId)).length;
    const ratio = kit.items.length > 0 ? fit / kit.items.length : 0;
    if (ratio < minRatio) continue;

    candidates.push({ kit, model, isSibling: isSiblingModel(target, model), fit, ratio });
  }

  candidates.sort((a, b) =>
    a.isSibling !== b.isSibling ? (a.isSibling ? -1 : 1) : b.ratio - a.ratio,
  );
  return candidates.slice(0, limit);
}

export interface IAlsoForCandidate<M> {
  model: M;
  isSibling: boolean;
}

export interface IFindAlsoForParams<M extends ICandidateModel> {
  source: M;
  models: readonly M[];
  /** Models already carrying a kit — a copy would compete with curated work. */
  modelsWithKits: ReadonlySet<ID>;
  /** Base (non-optional) parts of the composition being saved. */
  basePartIds: readonly ID[];
  compatiblePartIdsFor: (modelId: ID) => ReadonlySet<ID>;
  limit?: number;
}

/**
 * Active models with no kit where **every** base part of this composition
 * applies — saving creates a copy in each. Demanding all of them (not most)
 * keeps the offer honest: a partial match is a kit that needs curation, not a
 * copy.
 */
export function findAlsoForCandidates<M extends ICandidateModel>({
  source,
  models,
  modelsWithKits,
  basePartIds,
  compatiblePartIdsFor,
  limit = 6,
}: IFindAlsoForParams<M>): IAlsoForCandidate<M>[] {
  // An empty composition applies to everything, which would be a meaningless offer.
  if (basePartIds.length === 0) return [];

  const candidates: IAlsoForCandidate<M>[] = [];

  for (const model of models) {
    if (model.id === source.id) continue;
    if (model.status !== "ativo") continue;
    if (modelsWithKits.has(model.id)) continue;

    const compatible = compatiblePartIdsFor(model.id);
    if (!basePartIds.every((partId) => compatible.has(partId))) continue;

    candidates.push({ model, isSibling: isSiblingModel(source, model) });
  }

  candidates.sort((a, b) =>
    a.isSibling !== b.isSibling
      ? a.isSibling
        ? -1
        : 1
      : a.model.model.localeCompare(b.model.model, "pt-BR"),
  );
  return candidates.slice(0, limit);
}
