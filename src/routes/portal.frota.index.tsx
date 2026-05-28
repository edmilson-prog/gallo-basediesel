import { createFileRoute } from "@tanstack/react-router";
import { PortalFleetPage } from "@/features/b2b-portal";

export const Route = createFileRoute("/portal/frota/")({
  component: PortalFleetPage,
});
