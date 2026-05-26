import { createFileRoute } from "@tanstack/react-router";
import { PartDetailPage } from "@/features/catalog/pages/PartDetailPage";

export const Route = createFileRoute("/app/catalogo/$id")({
  component: PartDetailPage,
});
