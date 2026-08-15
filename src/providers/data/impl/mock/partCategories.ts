import type { ID, IPartCategory } from "@/shared/types";
import type {
  IListPartCategoriesParams,
  IPartCategoriesProvider,
  ISavePartCategoryInput,
} from "../../contracts/partCategories";

/**
 * Mock implementation of {@link IPartCategoriesProvider}.
 *
 * The catalog starts EMPTY, exactly like the freshly-migrated table: the ten
 * built-in families come from code, so an empty catalog is the real default
 * state, not a gap in the mock. Rows appear only once someone customises a
 * family or adds one.
 */

const SEED_STORE_ID = "00000000-0000-0000-0000-000000000001";
const MOCK_LATENCY_MS = 90;

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
}

let catalog: IPartCategory[] = [];
let sequence = 0;

/** Test-only: restore the empty catalog. */
export function __resetPartCategoriesForTests(): void {
  catalog = [];
  sequence = 0;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sorted(rows: IPartCategory[]): IPartCategory[] {
  return [...rows].sort(
    (a, b) => a.position - b.position || a.label.localeCompare(b.label, "pt-BR"),
  );
}

export const mockPartCategoriesProvider: IPartCategoriesProvider = {
  async list(params?: IListPartCategoriesParams): Promise<IPartCategory[]> {
    await delay();
    const storeId = params?.storeId ?? SEED_STORE_ID;
    let rows = catalog.filter((row) => row.storeId === storeId);
    if (params?.activeOnly) rows = rows.filter((row) => !row.archived);
    return sorted(rows);
  },

  async save(input: ISavePartCategoryInput): Promise<IPartCategory> {
    await delay();
    const storeId = input.storeId ?? SEED_STORE_ID;
    const existing = catalog.find((row) => row.storeId === storeId && row.value === input.value);

    if (existing) {
      const updated: IPartCategory = {
        ...existing,
        label: input.label,
        icon: input.icon,
        color: input.color,
        position: input.position ?? existing.position,
        archived: input.archived ?? existing.archived,
        updatedAt: nowIso(),
      };
      catalog = catalog.map((row) => (row.id === existing.id ? updated : row));
      return updated;
    }

    sequence += 1;
    const created: IPartCategory = {
      id: `part-category-${sequence}`,
      storeId,
      value: input.value,
      label: input.label,
      icon: input.icon,
      color: input.color,
      position: input.position ?? catalog.length,
      archived: input.archived ?? false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    catalog = [...catalog, created];
    return created;
  },

  async delete(id: ID): Promise<void> {
    await delay();
    catalog = catalog.filter((row) => row.id !== id);
  },
};
