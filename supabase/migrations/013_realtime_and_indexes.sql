-- ============================================================
-- Migration 013: Realtime + Supporting Indexes
-- ============================================================
-- Extends the realtime publication to the new/modified tables used by the
-- enhanced UI and adds a few supporting indexes for the report queries.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservations') then
      alter publication supabase_realtime add table public.reservations;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expenses') then
      alter publication supabase_realtime add table public.expenses;
    end if;
  end if;
end $$;

-- Reports: sales grouped by branch / payment method / date.
create index if not exists orders_branch_created_idx on public.orders (branch_id, created_at);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists reservations_branch_date_idx on public.reservations (branch_id, date);
create index if not exists staff_branch_idx on public.staff (branch_id);
