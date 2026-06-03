import type { ID, IServiceKit, IServiceKitItem, PartCategory } from "@/shared/types";
import { SEED_SERVICE_KITS } from "../data/seedServiceKits";
import { MockNotFoundError, MockValidationError, runApi } from "./utils";

export interface IListServiceKitsParams {
  storeId?: ID;
}

export interface ICreateServiceKitInput {
  storeId: ID;
  name: string;
  description?: string;
  vehicleApplication?: { brand: string; model: string };
  category?: PartCategory;
  items: IServiceKitItem[];
}

// In-memory store seeded from SEED_SERVICE_KITS. Kits are NOT part of the
// bootstrapped Zustand dataset, so a module-level mutable array is the simplest
// backing store; TanStack Query invalidation drives UI refresh. Writes persist
// for the session and reset on reload (Fase 1 mock semantics).
let kits: IServiceKit[] = SEED_SERVICE_KITS.map((k) => ({ ...k, items: [...k.items] }));

let createdSeq = 0;
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32);
}
function nextId(name: string): ID {
  createdSeq += 1;
  return `kit-${slugify(name) || "kit"}-${createdSeq}`;
}

function validate(input: Pick<ICreateServiceKitInput, "name" | "items">): void {
  if (!input.name || !input.name.trim()) {
    throw new MockValidationError("O nome do kit é obrigatório.", "name");
  }
  if (!input.items || input.items.length === 0) {
    throw new MockValidationError("O kit precisa de ao menos uma peça.", "items");
  }
  for (const it of input.items) {
    if (!Number.isInteger(it.quantity) || it.quantity < 1) {
      throw new MockValidationError("Quantidade deve ser um inteiro ≥ 1.", "items");
    }
  }
}

export const serviceKitsApi = {
  list(params: IListServiceKitsParams = {}): Promise<IServiceKit[]> {
    return runApi(
      "serviceKitsApi",
      "list",
      () => {
        let all = kits;
        if (params.storeId) all = all.filter((k) => k.storeId === params.storeId);
        return all.map((k) => ({ ...k, items: [...k.items] }));
      },
      { payload: params },
    );
  },

  create(input: ICreateServiceKitInput): Promise<IServiceKit> {
    return runApi("serviceKitsApi", "create", () => {
      validate(input);
      const kit: IServiceKit = {
        id: nextId(input.name),
        storeId: input.storeId,
        name: input.name.trim(),
        description: input.description?.trim() || undefined,
        vehicleApplication: input.vehicleApplication,
        category: input.category,
        items: input.items.map((i) => ({ ...i })),
      };
      kits = [...kits, kit];
      return { ...kit, items: [...kit.items] };
    });
  },

  update(id: ID, patch: Partial<ICreateServiceKitInput>): Promise<IServiceKit> {
    return runApi("serviceKitsApi", "update", () => {
      const index = kits.findIndex((k) => k.id === id);
      if (index === -1) throw new MockNotFoundError("serviceKit", id);
      // index is valid — element exists (guarded above).
      const current = kits[index]!;
      const merged: IServiceKit = {
        id: current.id,
        storeId: "storeId" in patch ? (patch.storeId ?? current.storeId) : current.storeId,
        name: "name" in patch ? (patch.name ?? "").trim() : current.name,
        description:
          "description" in patch ? patch.description?.trim() || undefined : current.description,
        vehicleApplication:
          "vehicleApplication" in patch ? patch.vehicleApplication : current.vehicleApplication,
        category: "category" in patch ? patch.category : current.category,
        items:
          "items" in patch
            ? (patch.items ?? []).map((i) => ({ ...i }))
            : current.items.map((i) => ({ ...i })),
      };
      validate({ name: merged.name, items: merged.items });
      kits = kits.map((k, i) => (i === index ? merged : k));
      return { ...merged, items: [...merged.items] };
    });
  },

  remove(id: ID): Promise<void> {
    return runApi("serviceKitsApi", "remove", () => {
      const exists = kits.some((k) => k.id === id);
      if (!exists) throw new MockNotFoundError("serviceKit", id);
      kits = kits.filter((k) => k.id !== id);
      return undefined;
    });
  },

  duplicate(id: ID): Promise<IServiceKit> {
    return runApi("serviceKitsApi", "duplicate", () => {
      const source = kits.find((k) => k.id === id);
      if (!source) throw new MockNotFoundError("serviceKit", id);
      const copy: IServiceKit = {
        ...source,
        id: nextId(`${source.name} copia`),
        name: `${source.name} (cópia)`,
        items: source.items.map((i) => ({ ...i })),
      };
      kits = [...kits, copy];
      return { ...copy, items: [...copy.items] };
    });
  },
};
