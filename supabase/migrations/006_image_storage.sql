-- ============================================================
-- Migration 006: Supabase Storage for images
-- ============================================================
-- Creates public buckets for menu-item photos and branding (logo)
-- and lets authenticated staff upload/replace/delete images while
-- keeping public read access. Image optimisation happens on the
-- client before upload (see src/lib/storage.js), so no server-side
-- resizing is required.

-- ---------- Buckets ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('branding', 'branding', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ---------- Object-level RLS ----------
drop policy if exists "public_read_product_images" on storage.objects;
create policy "public_read_product_images" on storage.objects
  for select using (bucket_id in ('product-images', 'branding'));

drop policy if exists "staff_write_product_images" on storage.objects;
create policy "staff_write_product_images" on storage.objects
  for all using (
    bucket_id in ('product-images', 'branding')
    and exists (
      select 1 from public.staff s
      where s.user_id = auth.uid()
    )
  )
  with check (
    bucket_id in ('product-images', 'branding')
    and exists (
      select 1 from public.staff s
      where s.user_id = auth.uid()
    )
  );
