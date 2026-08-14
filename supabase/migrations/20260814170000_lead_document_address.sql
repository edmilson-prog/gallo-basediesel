-- Two columns on `leads` so the conversion checklist in the Atendimento panel
-- can be FILLED where it is shown, instead of only naming what is missing.
--
-- Context. Turning a lead into a customer needs, at minimum, a real full name
-- and a CPF/CNPJ (see ConvertLeadModal.validate: B2C = fullName + 11 digits,
-- B2B = razão + fantasia + CNPJ + contato). Until now none of that could live
-- on the lead: `leads` had name/phone/email and nothing else, so the seller had
-- to open the conversion modal and type everything in one sitting, with no way
-- to record "the customer already told me their CNPJ" during the conversation.
-- The new panel (ui_kits/atendimento/painel/painel-lead-v2-conversao.html) makes
-- that a progressive checklist, which requires somewhere to put the answers.
--
-- `document` holds digits only (no mask): the app strips them with
-- `onlyDigits()` before writing, and every reader that formats does so from
-- digits (formatCnpj / formatCpf). Storing the mask would make the same
-- document compare unequal to itself depending on who typed it.
--
-- `address` mirrors `customers.address` — same jsonb shape (ICustomerAddress:
-- street/number/complement/district/city/state/zipCode) — so conversion copies
-- the object across instead of translating it. For B2B the modal already fills
-- this from the Receita lookup; the column lets that answer survive a seller
-- who looked the CNPJ up today and converts tomorrow.
--
-- No backfill and no default: an existing lead genuinely has neither, and
-- writing an empty object would make "never informed" indistinguishable from
-- "informed as blank" — which is exactly the distinction the checklist reads.
--
-- RLS: adding columns to a table that already has RLS enabled changes nothing.
-- The lead reaches the panel through `lead_via_conversation`, which returns
-- `setof public.leads` via `select l.*`, so both columns flow through the
-- conversation gate automatically with no RPC change.

begin;

set local lock_timeout = '3s';

alter table public.leads
  add column if not exists document text,
  add column if not exists address jsonb;

comment on column public.leads.document is
  'CPF (11) or CNPJ (14), digits only — no mask. Copied to customers.cpf/cnpj on conversion.';
comment on column public.leads.address is
  'Postal address, same jsonb shape as customers.address (ICustomerAddress).';

-- Digits-only, and only at a length that can actually BE a document. A partial
-- number typed halfway is not persisted by the UI (it writes on confirm), so
-- rejecting it here costs nothing and keeps the column trustworthy for the
-- duplicate guard, which compares against customers.cpf/cnpj — both stored the
-- same way.
alter table public.leads
  add constraint leads_document_digits
  check (document is null or document ~ '^[0-9]{11}$' or document ~ '^[0-9]{14}$')
  not valid;

-- `not valid` above skips the full-table scan on ALTER; validating separately
-- takes only a SHARE UPDATE EXCLUSIVE lock, so readers and writers keep
-- running. Every existing row is NULL, so this passes trivially today — it is
-- written this way to stay safe if the migration is ever applied late, against
-- a table that already received writes from a deployed frontend.
alter table public.leads validate constraint leads_document_digits;

commit;
