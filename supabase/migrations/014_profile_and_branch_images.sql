-- ============================================================
-- Migration 014: Storage buckets for branch & staff profile images
-- ============================================================
-- Adds the public buckets used by the Branches (branch-images) and
-- Profile (profile-images) screens. Mirrors the object-level RLS
-- pattern from migrations 006 and 008: public read, authenticated
-- staff may upload / replace / delete.

-- ---------- Buckets ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('branch-images', 'branch-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('profile-images', 'profile-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- ---------- Object-level RLS ----------
drop policy if exists "public_read_branch_profile_images" on storage.objects;
create policy "public_read_branch_profile_images" on storage.objects
  for select using (bucket_id in ('branch-images', 'profile-images'));

drop policy if exists "staff_write_branch_profile_images" on storage.objects;
create policy "staff_write_branch_profile_images" on storage.objects
  for all using (
    bucket_id in ('branch-images', 'profile-images')
    and exists (
      select 1 from public.staff s
      where s.user_id = auth.uid()
    )
  )
  with check (
    bucket_id in ('branch-images', 'profile-images')
    and exists (
      select 1 from public.staff s
      where s.user_id = auth.uid()
    )
  );
