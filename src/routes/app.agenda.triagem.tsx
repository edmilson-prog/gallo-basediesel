import { createFileRoute } from "@tanstack/react-router";
import { TriagePage } from "@/features/contacts/pages/TriagePage";

/**
 * Triage lives under the same `contact` RBAC resource as the Agenda list —
 * it is the same data, worked through a different surface, so it needs no
 * resource of its own (which would require a DB seed to be visible at all).
 */
export const Route = createFileRoute("/app/agenda/triagem")({
  component: TriagePage,
});
