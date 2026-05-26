import { createFileRoute } from "@tanstack/react-router";
import { LeadDetailPage } from "@/features/leads/pages/LeadDetailPage";

export const Route = createFileRoute("/app/leads/$id")({
  component: LeadDetailPage,
});
