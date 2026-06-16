import type { ID, IDepartment } from "@/shared/types";

/** Input to create a department (PRD-211 — revived `ITeam`). */
export interface ICreateDepartmentInput {
  name: string;
  storeId: ID;
  managerId?: ID;
  sellerIds?: ID[];
}

/**
 * Contract for department (departamento) management — the dormant `ITeam`
 * entity revived and repositioned for org grouping (PRD-211, Tasks 6/7).
 *
 * @see ../../../mocks/api/departments.ts
 */
export interface IDepartmentsProvider {
  /** Lists departments, optionally narrowed to one store. */
  list(params?: { storeId?: ID }): Promise<IDepartment[]>;
  /** Resolves a single department by id, with its member ids. */
  get(id: ID): Promise<IDepartment>;
  /** Creates a department and optionally assigns its initial members. */
  create(input: ICreateDepartmentInput): Promise<IDepartment>;
  /** Patches a department (name/manager/membership). */
  update(id: ID, patch: Partial<Omit<IDepartment, "id" | "createdAt">>): Promise<IDepartment>;
  /** Deletes a department — clears `department_id` of its members first. */
  remove(id: ID): Promise<void>;
}
