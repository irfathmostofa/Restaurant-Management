-- ============================================================
-- Migration 001: Kitchen Required Products
-- ============================================================
-- Adds the `requires_kitchen` flag to menu items and tracks kitchen
-- preparation state on individual order items.

-- ---------- menu_items.requires_kitchen ----------
alter table public.menu_items
  add column if not exists requires_kitchen boolean not null default true;

-- ---------- order_items kitchen fields ----------
-- branch_id: denormalized so Realtime filters and branch-scoped queries work.
alter table public.order_items
  add column if not exists branch_id uuid references public.branches(id) on delete cascade;

alter table public.order_items
  add column if not exists requires_kitchen boolean not null default true;

alter table public.order_items
  add column if not exists kitchen_status text not null default 'ready'
    check (kitchen_status in ('pending', 'preparing', 'ready'));

alter table public.order_items
  add column if not exists estimated_prep_time int not null default 5 check (estimated_prep_time >= 0);

alter table public.order_items
  add column if not exists prep_started_at timestamptz;

-- ---------- Backfill branch_id from the parent order ----------
update public.order_items oi
set branch_id = o.branch_id
from public.orders o
where o.id = oi.order_id
  and oi.branch_id is null;

-- ---------- Trigger: snapshot branch_id on insert/update ----------
create or replace function public.sync_order_item_branch()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.branch_id is null then
    select o.branch_id into new.branch_id
    from public.orders o
    where o.id = new.order_id;
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_branch_sync on public.order_items;
create trigger order_items_branch_sync
before insert or update on public.order_items
for each row execute function public.sync_order_item_branch();

-- ---------- Indexes ----------
create index if not exists order_items_branch_id_idx on public.order_items (branch_id);
create index if not exists order_items_kitchen_status_idx on public.order_items (kitchen_status);
