import { createFileRoute } from "@tanstack/react-router";
import { ContactsPage } from "@/features/contacts/pages/ContactsPage";

export const Route = createFileRoute("/app/agenda")({
  component: ContactsPage,
});
