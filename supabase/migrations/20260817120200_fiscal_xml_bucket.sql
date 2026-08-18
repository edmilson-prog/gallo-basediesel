-- PRD-216 (Tally) — bucket do XML original, para auditoria fiscal.
--
-- PRIVADO. O XML da NF-e carrega CNPJ, endereço e preço de custo do
-- fornecedor — este repositório é público e já teve exposição de PII.
-- Leitura só via URL assinada, nunca por bucket público.

insert into storage.buckets (id, name, public)
values ('fiscal-xml', 'fiscal-xml', false)
on conflict (id) do nothing;

-- Caminho: <store_id>/<access_key>.xml — o prefixo é o que a policy usa para
-- confinar cada loja à sua própria pasta.

drop policy if exists "fiscal_xml_read" on storage.objects;
create policy "fiscal_xml_read" on storage.objects for select to authenticated
using (
  bucket_id = 'fiscal-xml'
  and (select public.is_staff())
  and (storage.foldername(name))[1] = (select public.current_store_id())::text
);

drop policy if exists "fiscal_xml_write" on storage.objects;
create policy "fiscal_xml_write" on storage.objects for insert to authenticated
with check (
  bucket_id = 'fiscal-xml'
  and (select public.is_staff())
  and (storage.foldername(name))[1] = (select public.current_store_id())::text
);
