// src/routes/app.configuracoes.tours.tsx
import { createFileRoute } from "@tanstack/react-router";
import { ToursSettingsPage } from "@/features/tour";

export const Route = createFileRoute("/app/configuracoes/tours")({
  component: ToursSettingsPage,
});
