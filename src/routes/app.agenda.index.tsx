import { createFileRoute } from "@tanstack/react-router";
import { ContactsPage } from "@/features/contacts/pages/ContactsPage";

export interface IAgendaSearch {
  /** Pre-fills the contact search — used by "Agendar retorno" on the customer detail page. */
  q?: string;
}

export const Route = createFileRoute("/app/agenda/")({
  validateSearch: (search: Record<string, unknown>): IAgendaSearch => ({
    q: typeof search.q === "string" && search.q.trim() !== "" ? search.q : undefined,
  }),
  component: ContactsPage,
});
