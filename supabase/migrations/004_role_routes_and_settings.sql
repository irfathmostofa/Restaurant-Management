-- ============================================================
-- Migration 004: Configurable Role Routes + Settings
-- ============================================================
-- Role landing pages become configurable (no app logic change needed to
-- point a role at a different screen after login), and a simple settings
-- key/value store is added for restaurant-level display data.

-- ---------- role_default_routes ----------
create table if not exists public.role_default_routes (
  role text primary key,
  route text not null,
  updated_at timestamptz not null default now()
);

insert into public.role_default_routes (role, route) values
  ('owner', '/admin/dashboard'),
  ('admin', '/admin/dashboard'),
  ('manager', '/admin/dashboard'),
  ('cashier', '/admin/billing'),
  ('waiter', '/admin/order-taking'),
  ('kitchen', '/admin/orders')
on conflict (role) do nothing;

-- ---------- settings ----------
create table if not exists public.settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value) values
  ('restaurant_name', 'RestaurantHub'),
  ('invoice_footer', 'Thank you for dining with us!'),
  ('default_prep_time', '5')
on conflict (key) do nothing;

-- ---------- updated_at triggers ----------
drop trigger if exists role_default_routes_updated_at on public.role_default_routes;
create trigger role_default_routes_updated_at before update on public.role_default_routes
for each row execute function public.set_updated_at();

drop trigger if exists settings_updated_at on public.settings;
create trigger settings_updated_at before update on public.settings
for each row execute function public.set_updated_at();

-- ---------- Helper functions ----------
create or replace function public.default_route_for(role_name text)
returns text
language sql stable security definer
set search_path = public
as $$
  select r.route
  from public.role_default_routes r
  where r.role = role_name
  limit 1;
$$;

create or replace function public.get_setting(setting_key text)
returns text
language sql stable security definer
set search_path = public
as $$
  select value
  from public.settings
  where key = setting_key
  limit 1;
$$;

-- ---------- RLS ----------
alter table public.role_default_routes enable row level security;
alter table public.settings enable row level security;

drop policy if exists role_default_routes_read on public.role_default_routes;
create policy role_default_routes_read on public.role_default_routes
  for select using (true);

drop policy if exists role_default_routes_write on public.role_default_routes;
create policy role_default_routes_write on public.role_default_routes
  for all using (public.is_owner())
  with check (public.is_owner());

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings
  for select using (true);

drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings
  for all using (public.is_owner())
  with check (public.is_owner());
