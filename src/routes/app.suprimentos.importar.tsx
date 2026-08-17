import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";

export const Route = createFileRoute("/app/suprimentos/importar")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "supplies", action: "view" }),
  component: () => <div />,
});
