import { createFileRoute, redirect } from "@tanstack/react-router";
import { readCurrentUserSync } from "@/features/auth/guards";
import { defaultRedirectForRole } from "@/features/auth/roleMap";

/**
 * Root route — decides where to send the user based on auth state.
 *  - Not authenticated → /auth/login
 *  - Authenticated → wherever their role lives (`defaultRedirectForRole`)
 *
 * This used to carry its own role list — Owner/Vendedor to /app/inicio, Cliente
 * to /loja, and *everyone else* to /sem-permissao. That silently caught Gestor,
 * SDR, VendedorExterno and Financeiro: opening the domain without a path (a
 * bookmark, a shortcut, typing it) landed a logged-in Gestor on a permission
 * wall, while signing in normally worked — because sign-in used
 * `defaultRedirectForRole` and this route did not.
 *
 * Same rule, two copies, drifting apart. There is now one copy.
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const user = readCurrentUserSync();
    if (!user) {
      throw redirect({ to: "/auth/login" });
    }
    throw redirect({ to: defaultRedirectForRole(user.role) });
  },
});
