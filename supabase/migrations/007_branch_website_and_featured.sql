-- ============================================================
-- Migration 007: Public Website Branch Fields + Featured Items
-- ============================================================
-- Extends branches with the fields the public "Our Branches" cards need
-- (description, opening hours, map link, image) and adds a featured flag
-- to menu items so admins can showcase dishes on the homepage.

alter table public.branches
  add column if not exists description text;

alter table public.branches
  add column if not exists opening_hours text;

alter table public.branches
  add column if not exists map_link text;

alter table public.branches
  add column if not exists image_url text;

alter table public.menu_items
  add column if not exists is_featured boolean not null default false;

-- Partial index so the public homepage only scans featured, available items.
create index if not exists menu_items_featured_idx
  on public.menu_items (branch_id)
  where is_featured = true;

-- Demo data so the sections are visible out of the box.
update public.branches
set description = 'A cozy neighbourhood bistro serving fresh, honest food all day.',
    opening_hours = 'Mon-Sun: 11:00 AM - 11:00 PM',
    map_link = 'https://maps.google.com/?q=Downtown+Bistro'
where name = 'Downtown Bistro'
  and description is null;

update public.branches
set description = 'Riverside dining with a seasonal menu and local craft drinks.',
    opening_hours = 'Tue-Sun: 12:00 PM - 10:00 PM',
    map_link = 'https://maps.google.com/?q=Riverside+Kitchen'
where name = 'Riverside Kitchen'
  and description is null;

-- Mark a few demo dishes as popular.
update public.menu_items set is_featured = true
where name in ('Grilled Chicken', 'Chocolate Lava Cake', 'Garlic Bread', 'Fresh Lemonade');
