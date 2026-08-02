-- ============================================================
-- Migration 005: Enable Supabase Realtime for order/kitchen tables
-- ============================================================
-- Kitchen status updates, ETA changes, order-ready notifications and
-- payment status updates all flow through Realtime. This ensures the
-- required tables are members of the supabase_realtime publication.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
      alter publication supabase_realtime add table public.orders;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_items') then
      alter publication supabase_realtime add table public.order_items;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payments') then
      alter publication supabase_realtime add table public.payments;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tables') then
      alter publication supabase_realtime add table public.tables;
    end if;
  end if;
end $$;
