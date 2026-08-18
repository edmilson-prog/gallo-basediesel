import type { ID, ModelKitStatus } from "@/shared/types";

/**
 * Where a canonical model stands on kit curation. Every model falls in exactly
 * one bucket, which is what lets the three coverage numbers add up to the size
 * of the catalog:
 *
 * - `oficial` — has at least one published kit;
 * - `rascunho` — has kits, none published yet (the review queue);
 * - `sem` — has no kit at all (the work queue).
 */
export type ModelCoverageStatus = "oficial" | "rascunho" | "sem";

export interface ICoverageKit {
  modelId: ID;
  status: ModelKitStatus;
}

export interface IKitCoverage {
  official: number;
  draft: number;
  none: number;
  total: number;
}

/** Kits of one model, official first, then alphabetical — curation order. */
export function sortKitsByCuration<T extends { status: ModelKitStatus; name: string }>(
  kits: readonly T[],
): T[] {
  return [...kits].sort((a, b) =>
    a.status !== b.status
      ? a.status === "oficial"
        ? -1
        : 1
      : a.name.localeCompare(b.name, "pt-BR"),
  );
}

/** The kit that speaks for a model: the published one, else the first draft. */
export function pickRepresentativeKit<T extends { status: ModelKitStatus }>(
  kits: readonly T[],
): T | undefined {
  return kits.find((k) => k.status === "oficial") ?? kits[0];
}

/** Index kits by the model they hang off, so a list of N models costs one pass. */
export function groupKitsByModel<T extends ICoverageKit>(kits: readonly T[]): Map<ID, T[]> {
  const byModel = new Map<ID, T[]>();
  for (const kit of kits) {
    const list = byModel.get(kit.modelId);
    if (list) list.push(kit);
    else byModel.set(kit.modelId, [kit]);
  }
  return byModel;
}

export function getModelCoverageStatus(kits: readonly ICoverageKit[]): ModelCoverageStatus {
  if (kits.some((k) => k.status === "oficial")) return "oficial";
  return kits.length > 0 ? "rascunho" : "sem";
}

/**
 * The headline of the model list: how much of the catalog is actually curated.
 * `none` is the queue the screen exists to shrink — a number the old "Kits 0"
 * pill repeated once per row without ever adding up.
 */
export function computeKitCoverage(
  models: readonly { id: ID }[],
  kits: readonly ICoverageKit[],
): IKitCoverage {
  const byModel = groupKitsByModel(kits);
  let official = 0;
  let draft = 0;
  let none = 0;

  for (const model of models) {
    switch (getModelCoverageStatus(byModel.get(model.id) ?? [])) {
      case "oficial":
        official += 1;
        break;
      case "rascunho":
        draft += 1;
        break;
      default:
        none += 1;
    }
  }

  return { official, draft, none, total: models.length };
}
