-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  contact_info text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null check (role in ('owner', 'admin', 'manager', 'waiter', 'kitchen', 'cashier')),
  branch_id uuid references public.branches(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text,
  price numeric(10,2) not null default 0 check (price >= 0),
  photo_url text,
  is_available boolean not null default true,
  requires_kitchen boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  number text not null,
  capacity int not null default 4 check (capacity > 0),
  status text not null default 'available' check (status in ('available', 'occupied', 'reserved', 'cleaning')),
  created_at timestamptz not null default now(),
  unique (branch_id, number)
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  table_id uuid references public.tables(id) on delete set null,
  customer_name text not null,
  contact text,
  party_size int not null default 2 check (party_size > 0),
  date date not null,
  time time not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  table_id uuid references public.tables(id) on delete set null,
  type text not null default 'dine-in' check (type in ('dine-in', 'takeaway')),
  status text not null default 'received' check (status in ('received', 'preparing', 'ready', 'served', 'paid', 'cancelled')),
  staff_id uuid references public.staff(id) on delete set null,
  customer_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  name text not null,
  quantity int not null default 1 check (quantity > 0),
  notes text,
  price_at_order numeric(10,2) not null default 0 check (price_at_order >= 0),
  requires_kitchen boolean not null default true,
  kitchen_status text not null default 'ready'
    check (kitchen_status in ('pending', 'preparing', 'ready')),
  estimated_prep_time int not null default 5 check (estimated_prep_time >= 0),
  prep_started_at timestamptz,
  created_at timestamptz not null default now()
);

-- Payment methods are now a configurable, branch-aware lookup table.
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  icon text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Which payment methods each branch has enabled.
create table if not exists public.branch_payment_methods (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  payment_method_id uuid not null references public.payment_methods(id) on delete cascade,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch_id, payment_method_id)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 0),
  payment_method_id uuid not null references public.payment_methods(id) on delete set null,
  invoice_no text,
  subtotal numeric(10,2) not null default 0 check (subtotal >= 0),
  discount numeric(10,2) not null default 0 check (discount >= 0),
  tax numeric(10,2) not null default 0 check (tax >= 0),
  paid_amount numeric(10,2) not null default 0 check (paid_amount >= 0),
  change_amount numeric(10,2) not null default 0 check (change_amount >= 0),
  cashier_id uuid references public.staff(id) on delete set null,
  paid_at timestamptz not null default now()
);

-- Configurable role landing pages (login redirects read from here).
create table if not exists public.role_default_routes (
  role text primary key,
  route text not null,
  updated_at timestamptz not null default now()
);

-- Simple key/value settings (restaurant name, invoice footer, defaults...).
create table if not exists public.settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

-- updated_at maintenance for rows we write in-app
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists branches_updated_at on public.branches;
create trigger branches_updated_at before update on public.branches
for each row execute function public.set_updated_at();

drop trigger if exists staff_updated_at on public.staff;
create trigger staff_updated_at before update on public.staff
for each row execute function public.set_updated_at();

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists role_default_routes_updated_at on public.role_default_routes;
create trigger role_default_routes_updated_at before update on public.role_default_routes
for each row execute function public.set_updated_at();

drop trigger if exists settings_updated_at on public.settings;
create trigger settings_updated_at before update on public.settings
for each row execute function public.set_updated_at();

-- ---------- Helper: current staff profile (role-aware) ----------
-- Returns the staff row matching the current auth user, or NULL.
create or replace function public.current_staff()
returns public.staff
language sql stable security definer
set search_path = public
as $$
  select s.*
  from public.staff s
  where s.user_id = auth.uid()
    and s.active = true
  limit 1;
$$;

-- ---------- Helper: is the current user an owner/admin ----------
create or replace function public.is_owner()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    case when (select role from public.current_staff()) in ('owner', 'admin')
         then true else false
    end;
$$;

-- ---------- Helper: branch scope for the current staff user ----------
-- Owner/admin -> NULL (all branches). Others -> their branch_id.
-- NULL is the "no restriction" sentinel used by the RLS policies below.
create or replace function public.branch_scope()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select (select branch_id from public.current_staff() where role not in ('owner', 'admin'));
$$;

-- ---------- Helper: branch access check (used by view policies) ----------
-- True when the current user (anonymous/public included) can access the branch.
-- NOTE: intentionally does NOT query public.branches — doing so would recurse
-- through the branches RLS policy. Active/inactive filtering is handled by the
-- caller's policy (branches_public_read only exposes active branches).
create or replace function public.branch_accessible(bid uuid)
returns boolean
language sql stable
set search_path = public
as $$
  select
    bid is not null
    and (
      coalesce(public.is_owner(), false)
      or (select branch_id from public.current_staff()) = bid
      or auth.role() = 'anon'
      or auth.role() = 'authenticated'
    );
$$;

-- ---------- Helper: count open reservation slots ----------
-- SECURITY DEFINER so anonymous/authenticated visitors can query
-- availability without exposing the reservations table itself.
create or replace function public.reserved_tables(branch uuid, on_date date)
returns int
language sql stable security definer
set search_path = public
as $$
  select count(distinct t.id)::int
  from public.tables t
  where t.branch_id = branch
    and t.status = 'available'
    and t.id in (
      select r.table_id
      from public.reservations r
      where r.branch_id = branch
        and r.date = on_date
        and r.status = 'confirmed'
    );
$$;

-- ---------- Helper: count tables still available ----------
create or replace function public.available_tables(branch uuid)
returns int
language sql stable security definer
set search_path = public
as $$
  select count(*)::int
  from public.tables t
  where t.branch_id = branch
    and t.status = 'available';
$$;

-- ---------- Helper: default landing route for a role ----------
-- Public read so any authenticated user can resolve their landing page
-- immediately after sign-in (before the staff profile is re-fetched).
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

-- ---------- Helper: read a settings value ----------
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

-- ---------- Trigger: keep staff.email in sync with auth.users ----------
create or replace function public.handle_new_staff()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.staff
  set email = auth.users.email
  from auth.users
  where auth.users.id = staff.user_id
    and staff.user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists on_staff_user_update on public.staff;
create trigger on_staff_user_update
after insert or update of user_id on public.staff
for each row execute function public.handle_new_staff();

-- ---------- Trigger: snapshot branch_id on order_items ----------
-- Guarantees every item carries its branch so Realtime filters and
-- branch-scoped queries work even if a client forgets to send it.
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

-- ---------- Trigger: snapshot branch_id on payments ----------
create or replace function public.sync_payment_branch()
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

drop trigger if exists payments_branch_sync on public.payments;
create trigger payments_branch_sync
before insert or update on public.payments
for each row execute function public.sync_payment_branch();

-- ---------- Trigger: auto-enable all active payment methods for a new branch ----------
create or replace function public.seed_branch_payment_methods()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.branch_payment_methods (branch_id, payment_method_id, is_enabled)
  select new.id, pm.id, true
  from public.payment_methods pm
  where pm.is_active = true
  on conflict (branch_id, payment_method_id) do nothing;
  return new;
end;
$$;

drop trigger if exists branches_seed_payment_methods on public.branches;
create trigger branches_seed_payment_methods
after insert on public.branches
for each row execute function public.seed_branch_payment_methods();

-- ============================================================
-- RLS
-- ============================================================
alter table public.branches enable row level security;
alter table public.staff enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.tables enable row level security;
alter table public.reservations enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_methods enable row level security;
alter table public.branch_payment_methods enable row level security;
alter table public.role_default_routes enable row level security;
alter table public.settings enable row level security;

-- ---------- Branches: active branches public, all branches for staff ----------
drop policy if exists branches_public_read on public.branches;
create policy branches_public_read on public.branches
  for select using (is_active = true);

drop policy if exists branches_staff_read on public.branches;
create policy branches_staff_read on public.branches
  for select using (public.branch_accessible(id));

drop policy if exists branches_staff_write on public.branches;
create policy branches_staff_write on public.branches
  for all using (public.is_owner())
  with check (public.is_owner());

-- ---------- Staff ----------
drop policy if exists staff_read_branch on public.staff;
create policy staff_read_branch on public.staff
  for select using (
    public.is_owner()
    or branch_id = public.branch_scope()
  );

drop policy if exists staff_write_owner on public.staff;
create policy staff_write_owner on public.staff
  for all using (
    public.is_owner() or user_id = auth.uid()
  )
  with check (
    public.is_owner()
    or (user_id = auth.uid() and role in ('waiter', 'kitchen', 'cashier'))
  );

-- ---------- Categories (branch scoped) ----------
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories
  for select using (public.branch_accessible(branch_id));

drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories
  for all using (
    public.is_owner()
    or branch_id = public.branch_scope()
  )
  with check (
    public.is_owner()
    or branch_id = public.branch_scope()
  );

-- ---------- Menu items (branch scoped; available items public) ----------
drop policy if exists menu_items_public_read on public.menu_items;
create policy menu_items_public_read on public.menu_items
  for select using (
    is_available = true
    and branch_id in (select b.id from public.branches b where b.is_active = true)
  );

drop policy if exists menu_items_staff_read on public.menu_items;
create policy menu_items_staff_read on public.menu_items
  for select using (public.branch_accessible(branch_id));

drop policy if exists menu_items_staff_write on public.menu_items;
create policy menu_items_staff_write on public.menu_items
  for all using (
    public.is_owner()
    or branch_id = public.branch_scope()
  )
  with check (
    public.is_owner()
    or branch_id = public.branch_scope()
  );

-- ---------- Tables (branch scoped; table numbers are not sensitive) ----------
drop policy if exists tables_read on public.tables;
create policy tables_read on public.tables
  for select using (public.branch_accessible(branch_id));

drop policy if exists tables_write on public.tables;
create policy tables_write on public.tables
  for all using (
    public.is_owner()
    or branch_id = public.branch_scope()
  )
  with check (
    public.is_owner()
    or branch_id = public.branch_scope()
  );

-- ---------- Reservations (public insert, staff read/manage) ----------
drop policy if exists reservations_public_insert on public.reservations;
create policy reservations_public_insert on public.reservations
  for insert with check (auth.role() = 'anon' or auth.role() = 'authenticated');

drop policy if exists reservations_staff_read on public.reservations;
create policy reservations_staff_read on public.reservations
  for select using (
    public.is_owner()
    or branch_id = public.branch_scope()
  );

drop policy if exists reservations_staff_write on public.reservations;
create policy reservations_staff_write on public.reservations
  for all using (
    public.is_owner()
    or branch_id = public.branch_scope()
  )
  with check (
    public.is_owner()
    or branch_id = public.branch_scope()
  );

-- ---------- Orders (staff scoped) ----------
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders
  for select using (
    public.is_owner()
    or branch_id = public.branch_scope()
  );

drop policy if exists orders_write on public.orders;
create policy orders_write on public.orders
  for all using (
    public.is_owner()
    or branch_id = public.branch_scope()
  )
  with check (
    public.is_owner()
    or branch_id = public.branch_scope()
  );

-- ---------- Order items (inherit order's branch scope) ----------
drop policy if exists order_items_read on public.order_items;
create policy order_items_read on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (public.is_owner() or o.branch_id = public.branch_scope())
    )
  );

drop policy if exists order_items_write on public.order_items;
create policy order_items_write on public.order_items
  for all using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (public.is_owner() or o.branch_id = public.branch_scope())
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (public.is_owner() or o.branch_id = public.branch_scope())
    )
  );

-- ---------- Payments (inherit order's branch scope) ----------
drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (public.is_owner() or o.branch_id = public.branch_scope())
    )
  );

drop policy if exists payments_write on public.payments;
create policy payments_write on public.payments
  for all using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (public.is_owner() or o.branch_id = public.branch_scope())
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (public.is_owner() or o.branch_id = public.branch_scope())
    )
  );

-- ---------- Payment methods (public reference data) ----------
drop policy if exists payment_methods_read on public.payment_methods;
create policy payment_methods_read on public.payment_methods
  for select using (true);

drop policy if exists payment_methods_write on public.payment_methods;
create policy payment_methods_write on public.payment_methods
  for all using (public.is_owner())
  with check (public.is_owner());

-- ---------- Branch payment methods (branch scoped) ----------
drop policy if exists branch_payment_methods_read on public.branch_payment_methods;
create policy branch_payment_methods_read on public.branch_payment_methods
  for select using (public.branch_accessible(branch_id));

drop policy if exists branch_payment_methods_write on public.branch_payment_methods;
create policy branch_payment_methods_write on public.branch_payment_methods
  for all using (
    public.is_owner()
    or branch_id = public.branch_scope()
  )
  with check (
    public.is_owner()
    or branch_id = public.branch_scope()
  );

-- ---------- Role default routes (public read, owner manage) ----------
drop policy if exists role_default_routes_read on public.role_default_routes;
create policy role_default_routes_read on public.role_default_routes
  for select using (true);

drop policy if exists role_default_routes_write on public.role_default_routes;
create policy role_default_routes_write on public.role_default_routes
  for all using (public.is_owner())
  with check (public.is_owner());

-- ---------- Settings (public read, owner manage) ----------
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings
  for select using (true);

drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings
  for all using (public.is_owner())
  with check (public.is_owner());

-- ============================================================
-- REALTIME
-- ============================================================
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

-- ============================================================
-- SEED DATA
-- ============================================================

-- ---------- Settings ----------
insert into public.settings (key, value) values
  ('restaurant_name', 'RestaurantHub'),
  ('invoice_footer', 'Thank you for dining with us!'),
  ('default_prep_time', '5')
on conflict (key) do nothing;

-- ---------- Role landing pages (configurable in Admin -> Settings) ----------
insert into public.role_default_routes (role, route) values
  ('owner', '/admin/dashboard'),
  ('admin', '/admin/dashboard'),
  ('manager', '/admin/dashboard'),
  ('cashier', '/admin/billing'),
  ('waiter', '/admin/order-taking'),
  ('kitchen', '/admin/orders')
on conflict (role) do nothing;

-- ---------- Payment methods ----------
insert into public.payment_methods (name, code, icon) values
  ('Cash', 'cash', '💵'),
  ('Card', 'card', '💳'),
  ('bKash', 'bkash', '📱'),
  ('Nagad', 'nagad', '📱'),
  ('Rocket', 'rocket', '🚀'),
  ('Bank Transfer', 'bank_transfer', '🏦'),
  ('QR Payment', 'qr', '📷'),
  ('UPI', 'upi', '🔗')
on conflict (code) do nothing;

-- ---------- Demo branch + owner ----------
insert into public.branches (name, address, contact_info)
select 'Downtown Bistro', '123 Main Street, Cityville', '+1 555-0100'
where not exists (select 1 from public.branches);

insert into public.branches (name, address, contact_info)
select 'Riverside Kitchen', '45 River Road, Cityville', '+1 555-0120'
where not exists (select 1 from public.branches b where b.name = 'Riverside Kitchen');

-- ---------- Branch payment method defaults ----------
-- Enables every active method for the demo branches (row insert only fires
-- the seeding trigger on new branches, so seed the existing ones explicitly).
insert into public.branch_payment_methods (branch_id, payment_method_id, is_enabled)
select b.id, pm.id, true
from public.branches b
cross join public.payment_methods pm
where pm.is_active = true
  and not exists (
    select 1 from public.branch_payment_methods bpm
    where bpm.branch_id = b.id and bpm.payment_method_id = pm.id
  );

-- Example per-branch configuration so the feature is visible out of the box:
-- Downtown Bistro keeps everything; Riverside Kitchen disables card/UPI/QR
-- to mimic a branch that prefers local mobile wallets.
update public.branch_payment_methods set is_enabled = false
where payment_method_id in (
  select id from public.payment_methods where code in ('card', 'upi', 'qr')
)
and branch_id in (
  select id from public.branches where name = 'Riverside Kitchen'
);

insert into public.categories (branch_id, name, sort_order)
select b.id, 'Starters', 1
from public.branches b
where b.name = 'Downtown Bistro'
  and not exists (select 1 from public.categories c where c.branch_id = b.id and c.name = 'Starters');

insert into public.categories (branch_id, name, sort_order)
select b.id, 'Mains', 2
from public.branches b
where b.name = 'Downtown Bistro'
  and not exists (select 1 from public.categories c where c.branch_id = b.id and c.name = 'Mains');

insert into public.categories (branch_id, name, sort_order)
select b.id, 'Desserts', 3
from public.branches b
where b.name = 'Downtown Bistro'
  and not exists (select 1 from public.categories c where c.branch_id = b.id and c.name = 'Desserts');

insert into public.categories (branch_id, name, sort_order)
select b.id, 'Drinks', 4
from public.branches b
where b.name = 'Downtown Bistro'
  and not exists (select 1 from public.categories c where c.branch_id = b.id and c.name = 'Drinks');

insert into public.menu_items (branch_id, category_id, name, description, price, requires_kitchen, sort_order)
select b.id, c.id, 'Garlic Bread', 'Toasted baguette with garlic butter', 4.50, true, 1
from public.branches b
join public.categories c on c.branch_id = b.id and c.name = 'Starters'
where b.name = 'Downtown Bistro'
  and not exists (select 1 from public.menu_items m where m.branch_id = b.id and m.name = 'Garlic Bread');

insert into public.menu_items (branch_id, category_id, name, description, price, requires_kitchen, sort_order)
select b.id, c.id, 'Grilled Chicken', 'Herb-marinated chicken breast', 16.00, true, 1
from public.branches b
join public.categories c on c.branch_id = b.id and c.name = 'Mains'
where b.name = 'Downtown Bistro'
  and not exists (select 1 from public.menu_items m where m.branch_id = b.id and m.name = 'Grilled Chicken');

insert into public.menu_items (branch_id, category_id, name, description, price, requires_kitchen, sort_order)
select b.id, c.id, 'Chocolate Lava Cake', 'Warm cake with molten center', 7.00, true, 1
from public.branches b
join public.categories c on c.branch_id = b.id and c.name = 'Desserts'
where b.name = 'Downtown Bistro'
  and not exists (select 1 from public.menu_items m where m.branch_id = b.id and m.name = 'Chocolate Lava Cake');

insert into public.menu_items (branch_id, category_id, name, description, price, requires_kitchen, sort_order)
select b.id, c.id, 'Fresh Lemonade', 'House-made lemonade', 3.50, false, 1
from public.branches b
join public.categories c on c.branch_id = b.id and c.name = 'Drinks'
where b.name = 'Downtown Bistro'
  and not exists (select 1 from public.menu_items m where m.branch_id = b.id and m.name = 'Fresh Lemonade');

insert into public.menu_items (branch_id, category_id, name, description, price, requires_kitchen, sort_order)
select b.id, c.id, 'Mineral Water', 'Chilled bottled water', 1.50, false, 2
from public.branches b
join public.categories c on c.branch_id = b.id and c.name = 'Drinks'
where b.name = 'Downtown Bistro'
  and not exists (select 1 from public.menu_items m where m.branch_id = b.id and m.name = 'Mineral Water');

insert into public.menu_items (branch_id, category_id, name, description, price, requires_kitchen, sort_order)
select b.id, c.id, 'Cold Drink', 'Soft drink, ice cold', 2.00, false, 3
from public.branches b
join public.categories c on c.branch_id = b.id and c.name = 'Drinks'
where b.name = 'Downtown Bistro'
  and not exists (select 1 from public.menu_items m where m.branch_id = b.id and m.name = 'Cold Drink');

insert into public.tables (branch_id, number, capacity)
select b.id, 'T1', 4
from public.branches b
where b.name = 'Downtown Bistro'
  and not exists (select 1 from public.tables t where t.branch_id = b.id and t.number = 'T1');

insert into public.tables (branch_id, number, capacity)
select b.id, 'T2', 6
from public.branches b
where b.name = 'Downtown Bistro'
  and not exists (select 1 from public.tables t where t.branch_id = b.id and t.number = 'T2');

insert into public.tables (branch_id, number, capacity)
select b.id, 'T3', 2
from public.branches b
where b.name = 'Downtown Bistro'
  and not exists (select 1 from public.tables t where t.branch_id = b.id and t.number = 'T3');

-- ============================================================
-- Storage (Supabase Storage buckets + object-level RLS)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('branding', 'branding', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Public read for images in both buckets.
drop policy if exists "public_read_product_images" on storage.objects;
create policy "public_read_product_images" on storage.objects
  for select using (bucket_id in ('product-images', 'branding'));

-- Authenticated staff may upload / replace / delete images.
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
