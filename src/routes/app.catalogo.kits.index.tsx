import { createFileRoute } from "@tanstack/react-router";
import { ServiceKitsListPage } from "@/features/service-kits";

export const Route = createFileRoute("/app/catalogo/kits/")({
  component: ServiceKitsListPage,
});
