import { DepartmentManager } from "../components/DepartmentManager";

/**
 * Departments settings page (PRD-211 Task 12). Thin wrapper around
 * {@link DepartmentManager} — the manager owns the full screen (glass header,
 * search, list, dialogs), mirroring how `RolesPage` hosts the role editor.
 */
export function DepartmentsPage() {
  return <DepartmentManager />;
}
