import { createFileRoute } from "@tanstack/react-router";
import { PortalLoginPage } from "@/features/b2b-portal";

export const Route = createFileRoute("/portal/login")({
  component: PortalLoginPage,
});
