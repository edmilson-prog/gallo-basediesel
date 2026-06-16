import { departmentsApi } from "@/mocks";
import { auditLog } from "@/features/rbac";
import type { ID, IDepartment } from "@/shared/types";
import type { ICreateDepartmentInput, IDepartmentsProvider } from "../../contracts/departments";

/**
 * Mock implementation of {@link IDepartmentsProvider} (PRD-211, Tasks 6/7).
 *
 * Thin adapter over `departmentsApi` (mock store), adding the audit trail on
 * every mutation. In mock mode the store holds `sellerIds` directly; the
 * Supabase impl derives them from `sellers.department_id`.
 */
export const mockDepartmentsProvider: IDepartmentsProvider = {
  list: (params) => departmentsApi.list(params),
  get: (id) => departmentsApi.get(id),

  async create(input: ICreateDepartmentInput) {
    const created = await departmentsApi.create(input);
    auditLog({
      action: "department.create",
      resource: "department",
      resourceId: created.id,
      storeId: created.storeId,
      after: created,
    });
    return created;
  },

  async update(id: ID, patch: Partial<Omit<IDepartment, "id" | "createdAt">>) {
    const before = await departmentsApi.get(id);
    const updated = await departmentsApi.update(id, patch);
    auditLog({
      action: "department.update",
      resource: "department",
      resourceId: id,
      storeId: updated.storeId,
      before,
      after: updated,
    });
    return updated;
  },

  async remove(id: ID) {
    const before = await departmentsApi.get(id);
    await departmentsApi.remove(id);
    auditLog({
      action: "department.delete",
      resource: "department",
      resourceId: id,
      storeId: before.storeId,
      before,
    });
  },
};
