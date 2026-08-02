-- ============================================================
-- Migration 011: Dynamic Currency
-- ============================================================
-- Replaces the hardcoded currency symbol with a configurable single-row
-- settings table (name, ISO code, symbol, symbol position, decimal
-- precision). Every monetary display in the website, POS, invoices,
-- reports and expenses formats through the stored configuration.

create table if not exists public.currency_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'US Dollar',
  iso_code text not null default 'USD',
  symbol text not null default '$',
  symbol_position text not null default 'before' check (symbol_position in ('before', 'after')),
  decimal_precision int not null default 2 check (decimal_precision between 0 and 4),
  thousand_separator text not null default ',',
  updated_at timestamptz not null default now()
);

insert into public.currency_settings (name, iso_code, symbol, symbol_position, decimal_precision, thousand_separator)
select 'US Dollar', 'USD', '$', 'before', 2, ','
where not exists (select 1 from public.currency_settings);

drop trigger if exists currency_settings_updated_at on public.currency_settings;
create trigger currency_settings_updated_at before update on public.currency_settings
for each row execute function public.set_updated_at();

-- Public read (the public website renders prices); owner/admin manages.
alter table public.currency_settings enable row level security;

drop policy if exists currency_settings_read on public.currency_settings;
create policy currency_settings_read on public.currency_settings
  for select using (true);

drop policy if exists currency_settings_write on public.currency_settings;
create policy currency_settings_write on public.currency_settings
  for all using (public.is_owner())
  with check (public.is_owner());
