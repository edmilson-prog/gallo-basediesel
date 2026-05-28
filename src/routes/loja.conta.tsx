import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AccountLayout, requireCustomerSession } from "@/features/storefront-account";

export const Route = createFileRoute("/loja/conta")({
  beforeLoad: ({ location }) => requireCustomerSession(location.pathname),
  component: AccountLayoutRoute,
});

function AccountLayoutRoute() {
  return (
    <AccountLayout>
      <Outlet />
    </AccountLayout>
  );
}
