import { createFileRoute, redirect } from "@tanstack/react-router";
import { readPortalSessionSync } from "@/features/b2b-portal";

export const Route = createFileRoute("/portal/")({
  beforeLoad: () => {
    throw redirect({ to: readPortalSessionSync() ? "/portal/inicio" : "/portal/login" });
  },
});
