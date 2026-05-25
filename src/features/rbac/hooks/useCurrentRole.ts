import type { RoleName } from "@/shared/types";
import { useAuth } from "@/features/auth/useAuth";

/** Returns the role of the currently signed-in user, or null when anonymous. */
export function useCurrentRole(): RoleName | null {
  const { userRole } = useAuth();
  return userRole;
}
