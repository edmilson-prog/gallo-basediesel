// src/routes/app.configuracoes.tours.tsx
import { createFileRoute } from "@tanstack/react-router";
import { ToursSettingsPage } from "@/features/tour";
import { requireAuth } from "@/features/auth/guards";

export const Route = createFileRoute("/app/configuracoes/tours")({
  beforeLoad: ({ location }) => requireAuth(location.pathname),
  component: ToursSettingsPage,
});
