import { useAuth } from "@/features/auth/useAuth";

/** Cost & margin are internal data: only Owner and Gestor may reveal them. */
export function useCanViewCostMargin(): boolean {
  const { userRole } = useAuth();
  return userRole === "Owner" || userRole === "Gestor";
}
