import type { IRole, RoleName } from "@/shared/types";
import { selectAllRoles } from "../store/selectors";
import { MockNotFoundError, runApi } from "./utils";

export const rolesApi = {
  list(): Promise<IRole[]> {
    return runApi("rolesApi", "list", () => [...selectAllRoles()]);
  },

  async getByName(name: RoleName): Promise<IRole> {
    return runApi("rolesApi", "getByName", () => {
      const found = selectAllRoles().find((r) => r.slug === name);
      if (!found) throw new MockNotFoundError("role", name);
      return found;
    });
  },
};
