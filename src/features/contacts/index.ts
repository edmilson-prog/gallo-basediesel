export { ContactsPage } from "./pages/ContactsPage";
export { TriagePage } from "./pages/TriagePage";

// Surfaced for the customer ficha's "Contatos" tab, which shows the same people
// from the company's side. Re-exported through the barrel so the ficha never
// reaches into this feature's internals — the two views must agree on how a
// contact is labelled and initialled, and one source keeps them from drifting.
export { contactInitials } from "./engine/contactInitials";
export { CONTACT_SOURCE_LABELS } from "./utils/labels";
export { LinkCustomerDialog } from "./components/modals/LinkCustomerDialog";
