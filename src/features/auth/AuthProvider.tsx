import { MockAuthProvider } from "./MockAuthProvider";
import { ObservabilityUserSync } from "./ObservabilityUserSync";
import { SupabaseAuthProvider } from "./SupabaseAuthProvider";
import { AUTH_SOURCE } from "./authSource";

// Re-export the context surface so existing imports from "./AuthProvider"
// (e.g. useAuth) keep working after the split into authContext.ts.
export { AuthContext } from "./authContext";
export type { IAuthContextValue, IAuthResult } from "./authContext";

/**
 * Selects the auth backend by `VITE_AUTH_SOURCE` (PRD-107). Both backends expose
 * the identical `IAuthContextValue`, so the ~100 consumers and the synchronous
 * guards/data-scoping readers are unaffected. `mock` stays the default.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (AUTH_SOURCE === "supabase") {
    return (
      <SupabaseAuthProvider>
        <ObservabilityUserSync />
        {children}
      </SupabaseAuthProvider>
    );
  }
  return (
    <MockAuthProvider>
      <ObservabilityUserSync />
      {children}
    </MockAuthProvider>
  );
}
