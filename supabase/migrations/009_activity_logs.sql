-- ============================================================
-- Migration 009: Activity Logs
-- ============================================================
-- Records every important operation (logins, logouts, orders, payments,
-- printing, kitchen updates, product/branch/staff/expense management,
-- settings changes). Only owners/admins can read the log; writes happen
-- exclusively through the SECURITY DEFINER log_activity() function so any
-- role can record an audit trail without bypassing RLS. A pg_cron job
-- purges records older than seven days.

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  staff_id uuid references public.staff(id) on delete set null,
  user_name text,
  role text,
  branch_id uuid references public.branches(id) on delete set null,
  module text not null,
  action text not null,
  description text,
  metadata jsonb,
  ip_address text,
  device_info text,
  created_at timestamptz not null default now()
);

-- ---------- Indexes (filters in the Activity Log viewer) ----------
create index if not exists activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_branch_idx on public.activity_logs (branch_id);
create index if not exists activity_logs_user_idx on public.activity_logs (user_id);
create index if not exists activity_logs_module_action_idx on public.activity_logs (module, action);

-- ---------- Audit writer (SECURITY DEFINER, callable by any role) ----------
create or replace function public.log_activity(
  p_module text,
  p_action text,
  p_description text default null,
  p_branch_id uuid default null,
  p_metadata jsonb default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_staff public.staff;
  v_user_id uuid;
  v_headers text;
  v_ip text;
  v_device text;
  v_id uuid;
begin
  v_user_id := auth.uid();
  v_staff := public.current_staff();
  -- Best-effort request metadata captured server-side when available.
  begin
    v_headers := current_setting('request.headers', true);
    if v_headers is not null then
      if v_headers like '%x-forwarded-for=%' then
        v_ip := btrim(split_part(split_part(v_headers, 'x-forwarded-for=', 2), ',', 1), '{} ');
      end if;
      if v_headers like '%user-agent=%' then
        v_device := btrim(split_part(v_headers, 'user-agent=', 2), '{}');
      end if;
    end if;
  exception when others then
    v_headers := null;
  end;

  insert into public.activity_logs
    (user_id, staff_id, user_name, role, branch_id, module, action, description, metadata, ip_address, device_info)
  values
    (v_user_id, v_staff.id, v_staff.name, v_staff.role,
     coalesce(p_branch_id, v_staff.branch_id),
     p_module, p_action, p_description, p_metadata,
     left(v_ip, 45), left(v_device, 255))
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------- RLS ----------
alter table public.activity_logs enable row level security;

-- Read: owners and admins only.
drop policy if exists activity_logs_read on public.activity_logs;
create policy activity_logs_read on public.activity_logs
  for select using (public.is_owner());

-- Defensive write policy: only owners/admins may write directly; the
-- log_activity() function is SECURITY DEFINER and bypasses RLS for staff.
drop policy if exists activity_logs_write on public.activity_logs;
create policy activity_logs_write on public.activity_logs
  for all using (public.is_owner())
  with check (public.is_owner());

-- ---------- Automatic cleanup (older than 7 days) ----------
-- pg_cron is the recommended scheduled job runner on Supabase. The job runs
-- daily at 03:00. Guarded so re-running the migration never duplicates it.
create or replace function public.cleanup_activity_logs()
returns void
language sql security definer
set search_path = public
as $$
  delete from public.activity_logs
  where created_at < now() - interval '7 days';
$$;

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  -- pg_cron unavailable (e.g. local Postgres): cleanup must be run manually
  -- via public.cleanup_activity_logs().
  raise notice 'pg_cron not available; run public.cleanup_activity_logs() manually.';
end;
$$;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'cron.schedule') then
    if not exists (select 1 from cron.job where jobname = 'cleanup-old-activity-logs') then
      perform cron.schedule(
        'cleanup-old-activity-logs',
        '0 3 * * *',
        $$select public.cleanup_activity_logs()$$
      );
    end if;
  end if;
end;
$$;
