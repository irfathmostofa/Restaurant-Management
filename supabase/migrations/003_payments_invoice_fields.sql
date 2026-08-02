-- ============================================================
-- Migration 003: Invoice-ready Payment Fields + Cashier Role
-- ============================================================
-- Adds the fields the customer invoice needs (discount, tax, paid/change,
-- invoice number, cashier) and introduces the `cashier` staff role.

-- ---------- staff role: add cashier ----------
do $$
declare con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'public.staff'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%role%'
  limit 1;

  if con_name is not null then
    execute format('alter table public.staff drop constraint %I', con_name);
  end if;
end $$;

alter table public.staff
  add constraint staff_role_check
  check (role in ('owner', 'admin', 'manager', 'waiter', 'kitchen', 'cashier'));

-- ---------- payments invoice fields ----------
alter table public.payments
  add column if not exists branch_id uuid references public.branches(id) on delete cascade;

alter table public.payments
  add column if not exists invoice_no text;

alter table public.payments
  add column if not exists subtotal numeric(10,2) not null default 0 check (subtotal >= 0);

alter table public.payments
  add column if not exists discount numeric(10,2) not null default 0 check (discount >= 0);

alter table public.payments
  add column if not exists tax numeric(10,2) not null default 0 check (tax >= 0);

alter table public.payments
  add column if not exists paid_amount numeric(10,2) not null default 0 check (paid_amount >= 0);

alter table public.payments
  add column if not exists change_amount numeric(10,2) not null default 0 check (change_amount >= 0);

alter table public.payments
  add column if not exists cashier_id uuid references public.staff(id) on delete set null;

-- ---------- Backfill branch_id from the parent order ----------
update public.payments p
set branch_id = o.branch_id
from public.orders o
where o.id = p.order_id
  and p.branch_id is null;

-- Existing payments had no discount/tax; keep their totals for history.
update public.payments p
set subtotal = p.amount,
    paid_amount = p.amount
where p.subtotal = 0 and p.amount > 0;

-- ---------- Trigger: snapshot branch_id on insert/update ----------
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

-- ---------- Indexes ----------
create index if not exists payments_branch_id_idx on public.payments (branch_id);
