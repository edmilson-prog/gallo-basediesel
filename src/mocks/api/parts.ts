import type { ID, IPart } from "@/shared/types";
import { selectAllParts, selectPartById } from "../store/selectors";
import { patchById, removeById, upsert } from "../store/mutations";
import {
  MockNotFoundError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export interface IListPartsParams extends IPaginationParams {
  search?: string;
  /** Filter by OEM code substring. */
  oem?: string;
  brand?: string;
  active?: boolean;
  inStock?: boolean;
  orderBy?: "name" | "stockAvailable" | "unitPrice";
  orderDir?: "asc" | "desc";
}

export const partsApi = {
  list(params: IListPartsParams = {}): Promise<IPaginatedResult<IPart>> {
    return runApi(
      "partsApi",
      "list",
      () => {
        let all = selectAllParts();
        if (typeof params.active === "boolean") all = all.filter((p) => p.active === params.active);
        if (params.brand) all = all.filter((p) => p.brand === params.brand);
        if (params.inStock) all = all.filter((p) => p.stockAvailable > 0);
        if (params.oem) {
          const q = params.oem.toLowerCase();
          all = all.filter((p) => p.oemCodes.some((c) => c.toLowerCase().includes(q)));
        }
        if (params.search) {
          const q = params.search.toLowerCase();
          all = all.filter((p) =>
            `${p.name} ${p.sku} ${p.oemCodes.join(" ")} ${p.brand}`.toLowerCase().includes(q),
          );
        }
        const sorted = [...all].sort((a, b) => sortParts(a, b, params));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  async get(id: ID): Promise<IPart> {
    return runApi("partsApi", "get", () => {
      const found = selectPartById(id);
      if (!found) throw new MockNotFoundError("part", id);
      return found;
    });
  },

  async findByOem(code: string): Promise<IPart[]> {
    return runApi("partsApi", "findByOem", () => {
      const q = code.toLowerCase();
      return selectAllParts().filter((p) => p.oemCodes.some((c) => c.toLowerCase() === q));
    });
  },

  async listEquivalents(id: ID): Promise<IPart[]> {
    return runApi("partsApi", "listEquivalents", () => {
      const part = selectPartById(id);
      if (!part) throw new MockNotFoundError("part", id);
      const all = selectAllParts();
      return part.equivalentPartIds
        .map((eid) => all.find((p) => p.id === eid))
        .filter((p): p is IPart => Boolean(p));
    });
  },

  async create(input: Omit<IPart, "id" | "createdAt" | "updatedAt">): Promise<IPart> {
    return runApi("partsApi", "create", () => {
      const now = new Date().toISOString();
      const part: IPart = {
        ...input,
        id: `part-${crypto.randomUUID()}`,
        createdAt: now,
        updatedAt: now,
      };
      upsert("parts", part);
      return part;
    });
  },

  async update(id: ID, patch: Partial<IPart>): Promise<IPart> {
    return runApi("partsApi", "update", () => {
      const updated = patchById("parts", id, { ...patch, updatedAt: new Date().toISOString() });
      if (!updated) throw new MockNotFoundError("part", id);
      return updated;
    });
  },

  async delete(id: ID): Promise<void> {
    return runApi("partsApi", "delete", () => {
      const removed = removeById("parts", id);
      if (!removed) throw new MockNotFoundError("part", id);
    });
  },
};

function sortParts(a: IPart, b: IPart, params: IListPartsParams): number {
  const dir = params.orderDir === "desc" ? -1 : 1;
  const key = params.orderBy ?? "name";
  if (key === "name") return a.name.localeCompare(b.name, "pt-BR") * dir;
  if (key === "stockAvailable") return (a.stockAvailable - b.stockAvailable) * dir;
  if (key === "unitPrice") return (a.unitPrice - b.unitPrice) * dir;
  return 0;
}
