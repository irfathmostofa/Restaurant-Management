create or replace function public.protect_staff_privileges()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_role text;
begin
  -- Allow the system's own last-login sync through untouched: this fires
  -- with no authenticated request context (auth.uid() is null here), so
  -- the role checks below would otherwise always fall through and block
  -- it — breaking every login. Only bypass when last_login_at is the
  -- ONLY substantive change; anything else still goes through the guard.
  if TG_OP = 'UPDATE'
     and new.last_login_at is distinct from old.last_login_at
     and new.role is not distinct from old.role
     and new.branch_id is not distinct from old.branch_id
     and new.active is not distinct from old.active
     and new.user_id is not distinct from old.user_id
     and new.email is not distinct from old.email then
    return new;
  end if;

  v_role := (select role from public.current_staff());

  if v_role in ('owner', 'admin') then
    return new;
  end if;

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
      if new.branch_id is distinct from public.branch_scope() then
        raise exception 'Managers can only assign staff to their own branch.';
      end if;
      if new.role in ('owner', 'admin') then
        raise exception 'Managers cannot create owner or admin accounts.';
      end if;
      return new;
    end if;
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