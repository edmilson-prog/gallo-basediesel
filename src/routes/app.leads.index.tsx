import { createFileRoute } from "@tanstack/react-router";
import { LeadsPage } from "@/features/leads/pages/LeadsPage";
import { validateLeadsSearch } from "@/features/leads/hooks/useLeadsUrlState";

export const Route = createFileRoute("/app/leads/")({
  validateSearch: validateLeadsSearch,
  component: LeadsPage,
});
