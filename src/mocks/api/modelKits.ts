import type {
  ID,
  IVehicleModelKit,
  IKitItem,
  ModelKitCategory,
  ModelKitStatus,
} from "@/shared/types";
import { SEED_MODEL_KITS } from "../data/seedModelKits";
import { selectAllQuotes } from "../store/selectors";
import { MockNotFoundError, MockValidationError, runApi } from "./utils";

export interface IListModelKitsParams {
  modelId?: ID;
  status?: ModelKitStatus;
  category?: ModelKitCategory;
  search?: string;
}

export interface ICreateModelKitInput {
  modelId: ID;
  storeId: ID;
  name: string;
  category: ModelKitCategory;
  status?: ModelKitStatus;
  items: IKitItem[];
}

export interface IUpdateModelKitPatch {
  name?: string;
  category?: ModelKitCategory;
  status?: ModelKitStatus;
  items?: IKitItem[];
}

const MOCK_ACTOR = "mock-user";
const NOW = "2026-06-03T12:00:00.000Z";

// In-memory store seeded from SEED_MODEL_KITS. Writes persist for the session and
// reset on reload (Fase 1 mock semantics). TanStack Query invalidation drives UI.
let kits: IVehicleModelKit[] = SEED_MODEL_KITS.map((k) => ({
  ...k,
  items: k.items.map((i) => ({ ...i })),
}));

let createdSeq = 0;
function nextId(): ID {
  createdSeq += 1;
  return `mkit-${createdSeq}`;
}

function clone(k: IVehicleModelKit): IVehicleModelKit {
  return { ...k, items: k.items.map((i) => ({ ...i })) };
}

function validate(input: Pick<ICreateModelKitInput, "modelId" | "name" | "items">): void {
  if (!input.modelId) {
    throw new MockValidationError("O kit precisa estar vinculado a um modelo.", "modelId");
  }
  if (!input.name || !input.name.trim()) {
    throw new MockValidationError("O nome do kit é obrigatório.", "name");
  }
  if (!input.items || input.items.length === 0) {
    throw new MockValidationError("Adicione ao menos uma peça ao kit.", "items");
  }
  for (const it of input.items) {
    if (!it.partId) {
      throw new MockValidationError("Item do kit sem peça vinculada.", "items");
    }
    if (!Number.isInteger(it.defaultQuantity) || it.defaultQuantity < 1) {
      throw new MockValidationError("Quantidade deve ser um inteiro ≥ 1.", "items");
    }
  }
}

function matches(kit: IVehicleModelKit, params: IListModelKitsParams): boolean {
  if (params.modelId && kit.modelId !== params.modelId) return false;
  if (params.status && kit.status !== params.status) return false;
  if (params.category && kit.category !== params.category) return false;
  if (params.search) {
    const q = params.search.trim().toLowerCase();
    if (q && !kit.name.toLowerCase().includes(q)) return false;
  }
  return true;
}

export const modelKitsApi = {
  list(params: IListModelKitsParams = {}): Promise<IVehicleModelKit[]> {
    return runApi("modelKitsApi", "list", () => kits.filter((k) => matches(k, params)).map(clone), {
      payload: params,
    });
  },

  get(id: ID): Promise<IVehicleModelKit> {
    return runApi("modelKitsApi", "get", () => {
      const found = kits.find((k) => k.id === id);
      if (!found) throw new MockNotFoundError("modelKit", id);
      return clone(found);
    });
  },

  applicationCounts(kitIds: ID[]): Promise<Record<ID, number>> {
    return runApi(
      "modelKitsApi",
      "applicationCounts",
      () => {
        const wanted = new Set(kitIds);
        const counts: Record<ID, number> = {};
        if (wanted.size === 0) return counts;
        for (const quote of selectAllQuotes()) {
          for (const kitId of quote.appliedKitIds ?? []) {
            if (wanted.has(kitId)) counts[kitId] = (counts[kitId] ?? 0) + 1;
          }
        }
        return counts;
      },
      { payload: { kitIds } },
    );
  },

  create(input: ICreateModelKitInput): Promise<IVehicleModelKit> {
    return runApi("modelKitsApi", "create", () => {
      validate(input);
      const kit: IVehicleModelKit = {
        id: nextId(),
        modelId: input.modelId,
        storeId: input.storeId,
        name: input.name.trim(),
        category: input.category,
        status: input.status ?? "rascunho",
        items: input.items.map((i) => ({ ...i })),
        createdBy: MOCK_ACTOR,
        createdAt: NOW,
        updatedAt: NOW,
      };
      kits = [...kits, kit];
      return clone(kit);
    });
  },

  update(id: ID, patch: IUpdateModelKitPatch): Promise<IVehicleModelKit> {
    return runApi("modelKitsApi", "update", () => {
      const index = kits.findIndex((k) => k.id === id);
      if (index === -1) throw new MockNotFoundError("modelKit", id);
      const current = kits[index]!;
      const merged: IVehicleModelKit = {
        ...current,
        name: "name" in patch ? (patch.name ?? "").trim() : current.name,
        category: "category" in patch ? (patch.category ?? current.category) : current.category,
        status: "status" in patch ? (patch.status ?? current.status) : current.status,
        items:
          "items" in patch
            ? (patch.items ?? []).map((i) => ({ ...i }))
            : current.items.map((i) => ({ ...i })),
        updatedAt: NOW,
        updatedBy: MOCK_ACTOR,
      };
      validate({ modelId: merged.modelId, name: merged.name, items: merged.items });
      kits = kits.map((k, i) => (i === index ? merged : k));
      return clone(merged);
    });
  },

  remove(id: ID): Promise<void> {
    return runApi("modelKitsApi", "remove", () => {
      const exists = kits.some((k) => k.id === id);
      if (!exists) throw new MockNotFoundError("modelKit", id);
      kits = kits.filter((k) => k.id !== id);
      return undefined;
    });
  },
};
