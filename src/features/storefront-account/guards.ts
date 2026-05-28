import { redirect } from "@tanstack/react-router";
import { readCustomerSessionSync } from "./store/customerAuthStore";

/**
 * Guard for storefront customer routes (`/loja/conta/*`).
 *
 * Redirects anonymous visitors to `/loja/login?return=<pathname>` so they
 * land back on the requested page after signing in.
 */
export function requireCustomerSession(pathname: string): void {
  const session = readCustomerSessionSync();
  if (!session) {
    throw redirect({
      to: "/loja/login",
      search: { return: pathname },
    });
  }
}
