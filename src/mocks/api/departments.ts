import type { ID, IDepartment } from "@/shared/types";
import { selectAllDepartments } from "../store/selectors";
import { useMockStore } from "../store/mockStore";
import { MockNotFoundError, MockValidationError, runApi } from "./utils";

/**
 * Mock API surface for departments (PRD-211, Tasks 6/7 — revived `ITeam`).
 *
 * In mock mode the store is the source of truth: the department record carries
 * `sellerIds` directly (the seed populates it), so reads/updates work in place.
 * The Supabase impl instead derives `sellerIds` from `sellers.department_id`.
 */

export interface ICreateDepartmentInput {
  name: string;
  storeId: ID;
  managerId?: ID;
  sellerIds?: ID[];
}

export const departmentsApi = {
  list(params: { storeId?: ID } = {}): Promise<IDepartment[]> {
    return runApi(
      "departmentsApi",
      "list",
      () => {
        let all = selectAllDepartments();
        if (params.storeId) all = all.filter((d) => d.storeId === params.storeId);
        return [...all]
          .map((d) => ({ ...d, sellerIds: [...d.sellerIds] }))
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      },
      { payload: params },
    );
  },

  get(id: ID): Promise<IDepartment> {
    return runApi("departmentsApi", "get", () => {
      const found = selectAllDepartments().find((d) => d.id === id);
      if (!found) throw new MockNotFoundError("department", id);
      return { ...found, sellerIds: [...found.sellerIds] };
    });
  },

  create(input: ICreateDepartmentInput): Promise<IDepartment> {
    return runApi(
      "departmentsApi",
      "create",
      () => {
        if (!input.name.trim()) throw new MockValidationError("name is required", "name");
        const sellerIds = input.sellerIds ? [...input.sellerIds] : [];
        const created: IDepartment = {
          id: `dept-${crypto.randomUUID()}`,
          name: input.name.trim(),
          storeId: input.storeId,
          managerId: input.managerId ?? "",
          sellerIds,
          createdAt: new Date().toISOString(),
        };
        useMockStore.setState((state) => ({
          departments: [...state.departments, created],
          // Keep the seller side in sync (mirrors the Supabase derivation).
          sellers: state.sellers.map((s) =>
            sellerIds.includes(s.id) ? { ...s, departmentId: created.id } : s,
          ),
        }));
        return created;
      },
      { payload: input },
    );
  },

  update(id: ID, patch: Partial<Omit<IDepartment, "id" | "createdAt">>): Promise<IDepartment> {
    return runApi(
      "departmentsApi",
      "update",
      () => {
        let updated: IDepartment | null = null;
        useMockStore.setState((state) => {
          const nextSellerIds = patch.sellerIds ? [...patch.sellerIds] : undefined;
          const departments = state.departments.map((d) => {
            if (d.id !== id) return d;
            updated = {
              ...d,
              ...(patch.name !== undefined ? { name: patch.name } : {}),
              ...(patch.storeId !== undefined ? { storeId: patch.storeId } : {}),
              ...(patch.managerId !== undefined ? { managerId: patch.managerId } : {}),
              ...(nextSellerIds !== undefined ? { sellerIds: nextSellerIds } : {}),
            };
            return updated;
          });
          if (!updated) return state;
          // Reconcile the seller side when membership changes.
          if (nextSellerIds === undefined) return { departments };
          const sellers = state.sellers.map((s) => {
            const shouldBelong = nextSellerIds.includes(s.id);
            if (shouldBelong) return s.departmentId === id ? s : { ...s, departmentId: id };
            // Drop members no longer listed.
            return s.departmentId === id ? { ...s, departmentId: null } : s;
          });
          return { departments, sellers };
        });
        const result = updated as IDepartment | null;
        if (!result) throw new MockNotFoundError("department", id);
        return { ...result, sellerIds: [...result.sellerIds] };
      },
      { payload: { id, patch } },
    );
  },

  remove(id: ID): Promise<void> {
    return runApi(
      "departmentsApi",
      "remove",
      () => {
        const exists = selectAllDepartments().some((d) => d.id === id);
        if (!exists) throw new MockNotFoundError("department", id);
        useMockStore.setState((state) => ({
          departments: state.departments.filter((d) => d.id !== id),
          // Clear membership of the dissolved department's members.
          sellers: state.sellers.map((s) =>
            s.departmentId === id ? { ...s, departmentId: null } : s,
          ),
        }));
      },
      { payload: { id } },
    );
  },
};
