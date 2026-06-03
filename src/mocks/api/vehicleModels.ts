// src/mocks/api/vehicleModels.ts
import type { ID, IVehicleModel, VehicleModelStatus } from "@/shared/types";
import { SEED_VEHICLE_MODELS_CANONICAL } from "../data/seedVehicleModelsCanonical";
import { MockNotFoundError, MockValidationError, runApi } from "./utils";

export interface IListVehicleModelsParams {
  brand?: string;
  status?: VehicleModelStatus;
  search?: string;
}

export interface ICreateVehicleModelInput {
  brand: string;
  model: string;
  engine: string;
  yearStart?: number;
  yearEnd?: number;
}

export type IUpdateVehicleModelPatch = Partial<ICreateVehicleModelInput> & {
  status?: VehicleModelStatus;
};

// In-memory store seeded from the canonical catalog. Writes persist for the
// session and reset on reload (Fase 1 mock semantics).
let models: IVehicleModel[] = SEED_VEHICLE_MODELS_CANONICAL.map((m) => ({ ...m }));

const MOCK_ACTOR: ID = "mock-user";

let createdSeq = 0;
function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
function nextId(input: ICreateVehicleModelInput): ID {
  createdSeq += 1;
  return `vmodel-${slug(input.brand)}-${slug(input.model)}-${slug(input.engine)}-${createdSeq}`;
}

function validate(input: ICreateVehicleModelInput, ignoreId?: ID): void {
  if (!input.brand?.trim()) throw new MockValidationError("A marca é obrigatória.", "brand");
  if (!input.model?.trim()) throw new MockValidationError("O modelo é obrigatório.", "model");
  if (!input.engine?.trim()) throw new MockValidationError("O motor é obrigatório.", "engine");
  if (input.yearStart != null && input.yearEnd != null && input.yearStart > input.yearEnd) {
    throw new MockValidationError("Ano inicial não pode ser maior que o final.", "yearStart");
  }
  const key = `${input.brand}|${input.model}|${input.engine}`.trim().toLowerCase();
  const dup = models.some(
    (m) => m.id !== ignoreId && `${m.brand}|${m.model}|${m.engine}`.toLowerCase() === key,
  );
  if (dup) throw new MockValidationError("Modelo já existe no catálogo.", "engine");
}

function matchesSearch(m: IVehicleModel, needle: string): boolean {
  return `${m.brand} ${m.model} ${m.engine}`.toLowerCase().includes(needle);
}

export const vehicleModelsApi = {
  list(params: IListVehicleModelsParams = {}): Promise<IVehicleModel[]> {
    return runApi(
      "vehicleModelsApi",
      "list",
      () => {
        let all = models;
        if (params.brand) all = all.filter((m) => m.brand === params.brand);
        if (params.status) all = all.filter((m) => m.status === params.status);
        const needle = params.search?.trim().toLowerCase();
        if (needle) all = all.filter((m) => matchesSearch(m, needle));
        return all.map((m) => ({ ...m }));
      },
      { payload: params },
    );
  },

  get(id: ID): Promise<IVehicleModel> {
    return runApi("vehicleModelsApi", "get", () => {
      const found = models.find((m) => m.id === id);
      if (!found) throw new MockNotFoundError("vehicleModel", id);
      return { ...found };
    });
  },

  create(input: ICreateVehicleModelInput): Promise<IVehicleModel> {
    return runApi("vehicleModelsApi", "create", () => {
      validate(input);
      const now = new Date().toISOString();
      const model: IVehicleModel = {
        id: nextId(input),
        brand: input.brand.trim(),
        model: input.model.trim(),
        engine: input.engine.trim(),
        yearStart: input.yearStart,
        yearEnd: input.yearEnd,
        status: "ativo",
        createdBy: MOCK_ACTOR,
        createdAt: now,
        updatedAt: now,
      };
      models = [...models, model];
      return { ...model };
    });
  },

  update(id: ID, patch: IUpdateVehicleModelPatch): Promise<IVehicleModel> {
    return runApi("vehicleModelsApi", "update", () => {
      const index = models.findIndex((m) => m.id === id);
      if (index === -1) throw new MockNotFoundError("vehicleModel", id);
      const current = models[index]!;
      const merged: IVehicleModel = {
        ...current,
        brand: "brand" in patch ? (patch.brand ?? "").trim() : current.brand,
        model: "model" in patch ? (patch.model ?? "").trim() : current.model,
        engine: "engine" in patch ? (patch.engine ?? "").trim() : current.engine,
        yearStart: "yearStart" in patch ? patch.yearStart : current.yearStart,
        yearEnd: "yearEnd" in patch ? patch.yearEnd : current.yearEnd,
        status: "status" in patch ? (patch.status ?? current.status) : current.status,
        updatedBy: MOCK_ACTOR,
        updatedAt: new Date().toISOString(),
      };
      validate(
        {
          brand: merged.brand,
          model: merged.model,
          engine: merged.engine,
          yearStart: merged.yearStart,
          yearEnd: merged.yearEnd,
        },
        id,
      );
      models = models.map((m, i) => (i === index ? merged : m));
      return { ...merged };
    });
  },

  delete(id: ID): Promise<void> {
    return runApi("vehicleModelsApi", "delete", () => {
      const exists = models.some((m) => m.id === id);
      if (!exists) throw new MockNotFoundError("vehicleModel", id);
      models = models.filter((m) => m.id !== id);
      return undefined;
    });
  },
};
