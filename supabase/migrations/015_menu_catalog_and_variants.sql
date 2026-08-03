-- ============================================================
-- Migration 015: Global Menu Catalog + Branch Availability + Variants
-- ============================================================

-- ---------- 0. Drop policies that reference branch_id before altering ----------
-- (must happen before dropping the column further down)
drop policy if exists categories_read on public.categories;
drop policy if exists categories_write on public.categories;
drop policy if exists menu_items_public_read on public.menu_items;
drop policy if exists menu_items_staff_read on public.menu_items;
drop policy if exists menu_items_staff_write on public.menu_items;

-- ---------- 1. Categories -> global ----------
do $$
declare
  r record;
  keep_id uuid;
begin
  for r in select lower(trim(name)) as norm from public.categories group by 1 having count(*) > 1 loop
    select id into keep_id from public.categories where lower(trim(name)) = r.norm order by created_at limit 1;
    update public.menu_items set category_id = keep_id
    where category_id in (select id from public.categories where lower(trim(name)) = r.norm and id <> keep_id);
    delete from public.categories where lower(trim(name)) = r.norm and id <> keep_id;
  end loop;
end $$;

alter table public.categories drop column if exists branch_id;
alter table public.categories add constraint categories_name_key unique (name);

-- ---------- 2. menu_items -> global catalog ----------
create table if not exists public._menu_item_branch_map (
  old_item_id uuid,
  canonical_item_id uuid,
  branch_id uuid,
  was_available boolean
);
insert into public._menu_item_branch_map (old_item_id, canonical_item_id, branch_id, was_available)
select m.id, m.id, m.branch_id, m.is_available
from public.menu_items m;

do $$
declare
  r record;
  keep_id uuid;
begin
  for r in select lower(trim(name)) as norm from public.menu_items group by 1 having count(*) > 1 loop
    select id into keep_id from public.menu_items where lower(trim(name)) = r.norm order by created_at limit 1;
    update public._menu_item_branch_map set canonical_item_id = keep_id
    where old_item_id in (select id from public.menu_items where lower(trim(name)) = r.norm);
    update public.order_items set menu_item_id = keep_id
    where menu_item_id in (select id from public.menu_items where lower(trim(name)) = r.norm and id <> keep_id);
    delete from public.menu_items where lower(trim(name)) = r.norm and id <> keep_id;
  end loop;
end $$;

alter table public.menu_items drop column if exists branch_id;
alter table public.menu_items add column if not exists has_variants boolean not null default false;
alter table public.menu_items add constraint menu_items_name_key unique (name);
alter table public.menu_items drop column if exists is_available;