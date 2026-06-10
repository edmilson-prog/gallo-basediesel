-- PRD-106 — Storage buckets + access policies.
--
-- Buckets:
--   product-images / avatars  → public (served via CDN URL; write = staff)
--   whatsapp-media            → private, store-scoped by path prefix
--                               ("<store_id>/<uuid>.<ext>"; fine-grained per-seller
--                               visibility is enforced at the media_assets metadata
--                               layer — the object path is opaque and only reachable
--                               through getSignedUrl on a visible asset)
--   fiscal-documents / quote-documents / imports-temp → private, staff-only
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('product-images',   'product-images',   true,  10485760),
  ('avatars',          'avatars',          true,   5242880),
  ('whatsapp-media',   'whatsapp-media',   false, 26214400),
  ('fiscal-documents', 'fiscal-documents', false, 26214400),
  ('quote-documents',  'quote-documents',  false, 26214400),
  ('imports-temp',     'imports-temp',     false, 52428800)
on conflict (id) do nothing;

-- Public buckets: read for everyone, writes restricted to staff.
create policy "storage_public_buckets_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('product-images', 'avatars'));

create policy "storage_public_buckets_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('product-images', 'avatars') and (select public.is_staff()));

create policy "storage_public_buckets_update" on storage.objects
  for update to authenticated
  using (bucket_id in ('product-images', 'avatars') and (select public.is_staff()))
  with check (bucket_id in ('product-images', 'avatars') and (select public.is_staff()));

create policy "storage_public_buckets_delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('product-images', 'avatars') and (select public.is_staff()));

-- whatsapp-media: store-scoped by the first path segment ("<store_id>/...").
create policy "storage_whatsapp_media_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and (storage.foldername(name))[1] = (select public.current_store_id()::text)
  );

create policy "storage_whatsapp_media_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'whatsapp-media'
    and (storage.foldername(name))[1] = (select public.current_store_id()::text)
  );

create policy "storage_whatsapp_media_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and (storage.foldername(name))[1] = (select public.current_store_id()::text)
  )
  with check (
    bucket_id = 'whatsapp-media'
    and (storage.foldername(name))[1] = (select public.current_store_id()::text)
  );

create policy "storage_whatsapp_media_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and (storage.foldername(name))[1] = (select public.current_store_id()::text)
  );

-- Staff-only private buckets (fiscal/quote documents, import staging).
create policy "storage_staff_buckets_select" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('fiscal-documents', 'quote-documents', 'imports-temp')
    and (select public.is_staff())
  );

create policy "storage_staff_buckets_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('fiscal-documents', 'quote-documents', 'imports-temp')
    and (select public.is_staff())
  );

create policy "storage_staff_buckets_update" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('fiscal-documents', 'quote-documents', 'imports-temp')
    and (select public.is_staff())
  )
  with check (
    bucket_id in ('fiscal-documents', 'quote-documents', 'imports-temp')
    and (select public.is_staff())
  );

create policy "storage_staff_buckets_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('fiscal-documents', 'quote-documents', 'imports-temp')
    and (select public.is_staff())
  );
