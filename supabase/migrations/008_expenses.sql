-- ============================================================
-- Migration 008: Expense Management
-- ============================================================
-- Adds expense categories and branch-scoped expenses so staff can record
-- rent, electricity, water, internet, salaries, maintenance, purchases,
-- marketing and miscellaneous costs, with optional attachments.

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  category_id uuid references public.expense_categories(id) on delete set null,
  title text not null,
  description text,
  amount numeric(12,2) not null check (amount >= 0),
  expense_date date not null default current_date,
  created_by uuid references public.staff(id) on delete set null,
  attachment_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.expense_categories (name) values
  ('Rent'), ('Electricity'), ('Water'), ('Internet'), ('Salaries'),
  ('Maintenance'), ('Purchases'), ('Marketing'), ('Miscellaneous')
on conflict (name) do nothing;

-- ---------- updated_at maintenance ----------
drop trigger if exists expenses_updated_at on public.expenses;
create trigger expenses_updated_at before update on public.expenses
for each row execute function public.set_updated_at();

-- ---------- Indexes ----------
create index if not exists expenses_branch_date_idx on public.expenses (branch_id, expense_date);
create index if not exists expenses_category_idx on public.expenses (category_id);
create index if not exists expenses_created_by_idx on public.expenses (created_by);

-- ---------- RLS ----------
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

-- Expense categories are reference data visible to any authenticated staff.
drop policy if exists expense_categories_read on public.expense_categories;
create policy expense_categories_read on public.expense_categories
  for select using (public.current_staff() is not null);

drop policy if exists expense_categories_write on public.expense_categories;
create policy expense_categories_write on public.expense_categories
  for all using (public.is_owner())
  with check (public.is_owner());

-- Expenses are branch-scoped: owners/admins see everything, branch staff see
-- their own branch. Branch staff may record expenses for their own branch.
drop policy if exists expenses_read on public.expenses;
create policy expenses_read on public.expenses
  for select using (
    public.is_owner()
    or branch_id = public.branch_scope()
  );

drop policy if exists expenses_write on public.expenses;
create policy expenses_write on public.expenses
  for all using (
    public.is_owner()
    or branch_id = public.branch_scope()
  )
  with check (
    public.is_owner()
    or branch_id = public.branch_scope()
  );

-- ---------- Expense attachment storage ----------
-- Public-read bucket so the (optional) attachment URL can be rendered
-- directly; only authenticated staff can upload / replace / delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('expense-attachments', 'expense-attachments', true, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "public_read_expense_attachments" on storage.objects;
create policy "public_read_expense_attachments" on storage.objects
  for select using (bucket_id = 'expense-attachments');

drop policy if exists "staff_write_expense_attachments" on storage.objects;
create policy "staff_write_expense_attachments" on storage.objects
  for all using (
    bucket_id = 'expense-attachments'
    and exists (
      select 1 from public.staff s
      where s.user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'expense-attachments'
    and exists (
      select 1 from public.staff s
      where s.user_id = auth.uid()
    )
  );
