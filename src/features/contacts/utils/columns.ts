import type { ContactsOrderBy } from "@/providers/data";

/** Every column the dense table can show. `nome` is mandatory. */
export const CONTACT_COLUMNS = [
  "nome",
  "phone",
  "customer",
  "role",
  "email",
  "city",
  "owner",
  "tags",
  "last",
  "status",
  "source",
] as const;

export type ContactColumn = (typeof CONTACT_COLUMNS)[number];

/** Columns the user may hide — `nome` is not among them. */
export const OPTIONAL_CONTACT_COLUMNS = CONTACT_COLUMNS.filter(
  (id): id is Exclude<ContactColumn, "nome"> => id !== "nome",
);

export type OptionalContactColumn = (typeof OPTIONAL_CONTACT_COLUMNS)[number];

export const CONTACT_COLUMN_LABELS: Record<ContactColumn, string> = {
  nome: "Nome",
  phone: "WhatsApp/telefone",
  customer: "Cliente/empresa",
  role: "Cargo ou função",
  email: "E-mail",
  city: "Cidade/UF",
  owner: "Responsável",
  tags: "Etiquetas",
  last: "Último contato",
  status: "Status",
  source: "Origem",
};

/** Default widths, in px, taken from the design kit. */
export const CONTACT_COLUMN_WIDTHS: Record<ContactColumn, number> = {
  nome: 210,
  phone: 150,
  customer: 210,
  role: 150,
  email: 220,
  city: 150,
  owner: 130,
  tags: 150,
  last: 120,
  status: 100,
  source: 110,
};

/**
 * Which columns are sortable, and the provider key each maps to.
 *
 * `tags` has no meaningful single-column order, so it is deliberately absent —
 * a header that looks clickable but does nothing is worse than a plain one.
 */
export const CONTACT_COLUMN_SORT_KEY: Partial<Record<ContactColumn, ContactsOrderBy>> = {
  nome: "name",
  phone: "phone",
  customer: "customer",
  role: "role",
  email: "email",
  city: "city",
  owner: "owner",
  last: "lastContactAt",
  status: "status",
  source: "source",
};

/** localStorage key for the resizable-column widths. */
export const CONTACT_COLUMN_WIDTHS_STORAGE_KEY = "gallo-contacts-column-widths";
