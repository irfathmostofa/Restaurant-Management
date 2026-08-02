-- ============================================================
-- Migration 012: Profiles, Staff Permission Rework & Order Columns
-- ============================================================
-- 1. Staff profile fields (phone, address, profile image, last login).
-- 2. Managers gain the ability to manage staff in their own branch:
--    create accounts, edit, activate/deactivate and reset passwords, but
--    never other branches, never owner/admin accounts, and never change
--    branch assignments.
-- 3. Orders gain discount + notes; payments gain vat + service_charge so
--    invoices can show every component separately.
-- 4. SECURITY DEFINER helpers for staff password resets and login tracking.

-- ---------- Staff profile fields ----------
alter table public.staff
  add column if not exists phone text;

alter table public.staff
  add column if not exists address text;

alter table public.staff
  add column if not exists profile_image_url text;

alter table public.staff
  add column if not exists last_login_at timestamptz;

-- ---------- Order fields for the POS ----------
alter table public.orders
  add column if not exists discount numeric(10,2) not null default 0 check (discount >= 0);

alter table public.orders
  add column if not exists notes text;

-- ---------- Payment split fields for invoices ----------
alter table public.payments
  add column if not exists vat numeric(10,2) not null default 0 check (vat >= 0);

alter table public.payments
  add column if not exists service_charge numeric(10,2) not null default 0 check (service_charge >= 0);

-- ---------- Indexes for the Invoice Management filters ----------
create index if not exists payments_invoice_no_idx on public.payments (invoice_no);
create index if not exists payments_paid_at_idx on public.payments (paid_at desc);
create index if not exists payments_cashier_idx on public.payments (cashier_id);

-- ============================================================
-- Staff RLS rework
-- ============================================================

-- Owner/admin: full management of every staff row.
drop policy if exists staff_write_owner on public.staff;
create policy staff_write_owner on public.staff
  for all using (public.is_owner())
  with check (public.is_owner());

-- Managers: manage staff in their own branch only. They may never target
-- owner/admin accounts and can never move a staff member to another branch.
drop policy if exists staff_write_manager on public.staff;
create policy staff_write_manager on public.staff
  for all using (
    (select role from public.current_staff()) = 'manager'
    and branch_id = public.branch_scope()
  )
  with check (
    (select role from public.current_staff()) = 'manager'
    and branch_id = public.branch_scope()
    and new.role not in ('owner', 'admin')
  );

-- Self service: every staff member may update their own profile row.
drop policy if exists staff_write_self on public.staff;
create policy staff_write_self on public.staff
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Hard guard: a self-update may never change role / branch / status / email,
-- and a manager can never touch another branch, owner/admin accounts or
-- reassign staff. This belt-and-braces trigger makes privilege escalation
-- impossible even if a policy is misconfigured later.
create or replace function public.protect_staff_privileges()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := (select role from public.current_staff());

  if v_role in ('owner', 'admin') then
    return new;
  end if;

  -- Self service: never allow changing identity fields on your own row.
  if old.user_id = auth.uid() then
    if new.role is distinct from old.role
       or new.branch_id is distinct from old.branch_id
       or new.active is distinct from old.active
       or new.user_id is distinct from old.user_id
       or new.email is distinct from old.email then
      new.role := old.role;
      new.branch_id := old.branch_id;
      new.active := old.active;
      new.user_id := old.user_id;
      new.email := old.email;
    end if;
    return new;
  end if;

  if v_role = 'manager' then
    if TG_OP = 'INSERT' then
      -- Creating staff: must land in the manager's own branch and never be
      -- an owner/admin account.
      if new.branch_id is distinct from public.branch_scope() then
        raise exception 'Managers can only assign staff to their own branch.';
      end if;
      if new.role in ('owner', 'admin') then
        raise exception 'Managers cannot create owner or admin accounts.';
      end if;
      return new;
    end if;
    -- UPDATE: same-branch only, no branch reassignment, no owner/admin rows.
    if old.branch_id is distinct from public.branch_scope() then
      raise exception 'Managers can only manage staff in their own branch.';
    end if;
    if new.branch_id is distinct from old.branch_id then
      raise exception 'Managers cannot change staff branch assignments.';
    end if;
    if new.role in ('owner', 'admin') or old.role in ('owner', 'admin') then
      raise exception 'Managers cannot manage owner or admin accounts.';
    end if;
    return new;
  end if;

  raise exception 'You do not have permission to modify this staff account.';
end;
$$;

drop trigger if exists protect_staff_privileges on public.staff;
create trigger protect_staff_privileges
before insert or update on public.staff
for each row execute function public.protect_staff_privileges();

-- ============================================================
-- Staff password reset (owner/admin: any staff; manager: own branch)
-- ============================================================
create or replace function public.admin_reset_password(target_user_id uuid, new_password text)
returns boolean
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_role text;
  v_ok boolean;
begin
  if new_password is null or length(new_password) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;

  v_role := (select role from public.current_staff());
  if v_role in ('owner', 'admin') then
    v_ok := exists (select 1 from public.staff s where s.user_id = target_user_id);
  elsif v_role = 'manager' then
    v_ok := exists (
      select 1 from public.staff s
      where s.user_id = target_user_id
        and s.branch_id = public.branch_scope()
        and s.role not in ('owner', 'admin')
    );
  else
    v_ok := false;
  end if;

  if not v_ok then
    raise exception 'You are not authorized to reset this password.';
  end if;

  update auth.users
  set encrypted_password = crypt(new_password, gen_salt('bf')),
      updated_at = now()
  where id = target_user_id;

  return found;
end;
$$;

-- ============================================================
-- Last-login tracking
-- ============================================================
-- Supabase updates auth.users.last_sign_in_at on every successful login;
-- mirror that onto the staff profile so the profile page can show it.
create or replace function public.sync_staff_last_login()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    update public.staff
    set last_login_at = new.last_sign_in_at
    where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_staff_last_login on auth.users;
create trigger sync_staff_last_login
after update of last_sign_in_at on auth.users
for each row execute function public.sync_staff_last_login();
