create or replace function public.release_table_on_order_close()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status in ('paid', 'cancelled')
     and old.status is distinct from new.status
     and new.table_id is not null
  then
    update public.tables
    set status = 'available'
    where id = new.table_id
      and status <> 'available';
  end if;
  return new;
end;
$$;