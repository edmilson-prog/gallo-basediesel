import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout for the Agenda: the contact list at `/app/agenda` and triage at
 * `/app/agenda/triagem`. It renders nothing of its own — each child owns its
 * whole screen, including its header.
 */
export const Route = createFileRoute("/app/agenda")({
  component: () => <Outlet />,
});
