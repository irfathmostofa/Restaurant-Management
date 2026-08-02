-- ============================================================
-- Migration 010: Tax & VAT Management
-- ============================================================
-- Global tax configuration lives in `tax_settings` (a single row). Branches
-- may override the global configuration via `branch_tax_settings`; every
-- field in an override row is optional (NULL = fall back to the global
-- value). The POS, invoices and reports read the merged result through
-- public.effective_tax_settings(branch_id).

create table if not exists public.tax_settings (
  id uuid primary key default gen_random_uuid(),
  is_vat_enabled boolean not null default false,
  vat_name text not null default 'VAT',
  vat_rate numeric(5,2) not null default 0 check (vat_rate >= 0),
  is_tax_enabled boolean not null default false,
  tax_name text not null default 'Tax',
  tax_rate numeric(5,2) not null default 0 check (tax_rate >= 0),
  service_charge_enabled boolean not null default false,
  service_charge_rate numeric(5,2) not null default 0 check (service_charge_rate >= 0),
  price_includes_tax boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Single global configuration row.
insert into public.tax_settings (is_vat_enabled, vat_name, vat_rate, is_tax_enabled, tax_name, tax_rate, service_charge_enabled, service_charge_rate, price_includes_tax)
select false, 'VAT', 0, false, 'Tax', 0, false, 0, false
where not exists (select 1 from public.tax_settings);

create table if not exists public.branch_tax_settings (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  is_vat_enabled boolean,
  vat_name text,
  vat_rate numeric(5,2),
  is_tax_enabled boolean,
  tax_name text,
  tax_rate numeric(5,2),
  service_charge_enabled boolean,
  service_charge_rate numeric(5,2),
  price_includes_tax boolean,
  updated_at timestamptz not null default now()
);

-- ---------- updated_at maintenance ----------
drop trigger if exists tax_settings_updated_at on public.tax_settings;
create trigger tax_settings_updated_at before update on public.tax_settings
for each row execute function public.set_updated_at();

drop trigger if exists branch_tax_settings_updated_at on public.branch_tax_settings;
create trigger branch_tax_settings_updated_at before update on public.branch_tax_settings
for each row execute function public.set_updated_at();

-- ---------- Merge helper: effective tax settings for a branch ----------
create or replace function public.effective_tax_settings(branch uuid)
returns public.tax_settings
language plpgsql stable security definer
set search_path = public
as $$
declare
  g public.tax_settings;
  b public.branch_tax_settings;
begin
  select * into g from public.tax_settings limit 1;
  if g is null then
    insert into public.tax_settings default values returning * into g;
  end if;

  select * into b from public.branch_tax_settings where branch_id = branch;
  if b is null then
    return g;
  end if;

  return row(
    g.id,
    coalesce(b.is_vat_enabled, g.is_vat_enabled),
    coalesce(b.vat_name, g.vat_name),
    coalesce(b.vat_rate, g.vat_rate),
    coalesce(b.is_tax_enabled, g.is_tax_enabled),
    coalesce(b.tax_name, g.tax_name),
    coalesce(b.tax_rate, g.tax_rate),
    coalesce(b.service_charge_enabled, g.service_charge_enabled),
    coalesce(b.service_charge_rate, g.service_charge_rate),
    coalesce(b.price_includes_tax, g.price_includes_tax),
    now()
  )::public.tax_settings;
end;
$$;

-- ---------- RLS ----------
alter table public.tax_settings enable row level security;
alter table public.branch_tax_settings enable row level security;

-- Staff need to read tax settings to run the POS; only owners/admins write.
drop policy if exists tax_settings_read on public.tax_settings;
create policy tax_settings_read on public.tax_settings
  for select using (public.current_staff() is not null);

drop policy if exists tax_settings_write on public.tax_settings;
create policy tax_settings_write on public.tax_settings
  for all using (public.is_owner())
  with check (public.is_owner());

drop policy if exists branch_tax_settings_read on public.branch_tax_settings;
create policy branch_tax_settings_read on public.branch_tax_settings
  for select using (public.branch_accessible(branch_id));

drop policy if exists branch_tax_settings_write on public.branch_tax_settings;
create policy branch_tax_settings_write on public.branch_tax_settings
  for all using (public.is_owner())
  with check (public.is_owner());
