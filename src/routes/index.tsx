import { createFileRoute, redirect } from "@tanstack/react-router";
import { readCurrentUserSync } from "@/features/auth/guards";

/**
 * Root route — decides where to send the user based on auth state.
 *  - Not authenticated → /auth/login
 *  - Owner/Vendedor → /app/inicio
 *  - Cliente → /loja
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const user = readCurrentUserSync();
    if (!user) {
      throw redirect({ to: "/auth/login" });
    }
    if (user.role === "Owner" || user.role === "Vendedor") {
      throw redirect({ to: "/app/inicio" });
    }
    if (user.role === "Cliente") {
      throw redirect({ to: "/loja" });
    }
    throw redirect({ to: "/sem-permissao" });
  },
});
