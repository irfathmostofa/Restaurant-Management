-- ============================================================
-- Migration 002: Configurable Branch-wise Payment Methods
-- ============================================================
-- Replaces the hardcoded enum-like `payments.method` column with a
-- foreign key to a configurable `payment_methods` table, and adds a
-- per-branch enable/disable bridge table.

-- ---------- payment_methods ----------
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  icon text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

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

-- ---------- branch_payment_methods ----------
create table if not exists public.branch_payment_methods (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  payment_method_id uuid not null references public.payment_methods(id) on delete cascade,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch_id, payment_method_id)
);

-- ---------- payments: switch method -> payment_method_id ----------
alter table public.payments
  add column if not exists payment_method_id uuid references public.payment_methods(id) on delete set null;

-- Backfill existing rows by matching the old enum values to seeded codes.
-- (Guarded: the legacy `method` column only exists on pre-upgrade databases.)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'method'
  ) then
    update public.payments p
    set payment_method_id = pm.id
    from public.payment_methods pm
    where p.payment_method_id is null
      and lower(trim(p.method)) = pm.code;
  end if;
end $$;

-- Anything that could not be matched falls back to Cash.
update public.payments p
set payment_method_id = (select id from public.payment_methods where code = 'cash')
where p.payment_method_id is null;

-- Now enforce the FK for new rows.
alter table public.payments
  alter column payment_method_id set not null;

-- Drop the old enum column (data has been preserved via the FK).
alter table public.payments
  drop column if exists method;

-- ---------- Seed branch_payment_methods for existing branches ----------
insert into public.branch_payment_methods (branch_id, payment_method_id, is_enabled)
select b.id, pm.id, true
from public.branches b
cross join public.payment_methods pm
where pm.is_active = true
  and not exists (
    select 1 from public.branch_payment_methods bpm
    where bpm.branch_id = b.id and bpm.payment_method_id = pm.id
  );

-- ---------- Trigger: auto-enable all active methods for new branches ----------
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

-- ---------- RLS ----------
alter table public.payment_methods enable row level security;
alter table public.branch_payment_methods enable row level security;

drop policy if exists payment_methods_read on public.payment_methods;
create policy payment_methods_read on public.payment_methods
  for select using (true);

drop policy if exists payment_methods_write on public.payment_methods;
create policy payment_methods_write on public.payment_methods
  for all using (public.is_owner())
  with check (public.is_owner());

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

-- ---------- Indexes ----------
create index if not exists branch_payment_methods_branch_idx on public.branch_payment_methods (branch_id);
create index if not exists payments_payment_method_id_idx on public.payments (payment_method_id);
