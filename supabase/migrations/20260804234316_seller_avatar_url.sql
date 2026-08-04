-- "Meu perfil" (PRD-019) — profile photo.
--
-- The `avatars` bucket already exists (public, 5 MB — PRD-106 migration
-- 20260610014819). Two things were missing:
--   1. a column to persist the resulting public URL on the seller row;
--   2. a way for a NON-staff user to upload their OWN photo. The existing
--      `storage_public_buckets_*` write policies require `public.is_staff()`
--      (owner/manager), so a Vendedor/SDR/Financeiro could never replace their
--      own picture.
--
-- The self-service policies below are ADDITIVE (policies are OR-ed) and are
-- scoped to the caller's own path prefix, `avatars/<auth uid>/...`, which is
-- exactly what `sellers.uploadAvatar` writes. Staff keep their existing wider
-- access; nobody gains write access to anyone else's object.

alter table public.sellers
  add column if not exists avatar_url text;

comment on column public.sellers.avatar_url is
  'Public URL of the profile photo in the `avatars` bucket. NULL = initials fallback.';

-- Self-service writes on `avatars/<auth uid>/...` for any signed-in user.
drop policy if exists "storage_avatars_self_insert" on storage.objects;
create policy "storage_avatars_self_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "storage_avatars_self_update" on storage.objects;
create policy "storage_avatars_self_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "storage_avatars_self_delete" on storage.objects;
create policy "storage_avatars_self_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
