-- Enforce: only one admin per firm at the database level
-- Prevents any INSERT or UPDATE that would create a second admin

create or replace function public.enforce_single_admin()
returns trigger language plpgsql as $$
begin
  if NEW.role = 'admin' then
    if exists (
      select 1 from public.users
      where firm_id = NEW.firm_id
        and role = 'admin'
        and id <> NEW.id
    ) then
      raise exception 'Only one admin account is allowed per firm.';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_single_admin on public.users;
create trigger trg_single_admin
  before insert or update on public.users
  for each row execute function public.enforce_single_admin();

-- Prevent users from updating their own role
create or replace function public.prevent_self_role_change()
returns trigger language plpgsql as $$
begin
  if NEW.id = auth.uid() and OLD.role <> NEW.role then
    raise exception 'You cannot change your own role.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_no_self_role_change on public.users;
create trigger trg_no_self_role_change
  before update on public.users
  for each row execute function public.prevent_self_role_change();
