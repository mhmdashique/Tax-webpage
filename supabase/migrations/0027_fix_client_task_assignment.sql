-- 0027: Fix client task assignment
--
-- Problems fixed:
-- 1. task_assignee_allowed returned false (generic error) when the client user
--    wasn't in client_users AND wasn't in clients.linked_user_id.
-- 2. Admin path skipped the client-link check entirely for client tasks,
--    so any user could be picked and then fail at create_assigned_task.
-- 3. Descriptive RAISE messages so the UI can show the real reason.

create or replace function public.task_assignee_allowed(p_task_type uuid, p_client uuid, p_assignee uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  caller_role  text := public.current_user_role();
  target_role  text;
  target_firm  uuid;
  expected_role text;
begin
  if p_assignee is null or not public.is_approved() then
    raise exception 'You must be logged in and approved to assign tasks';
  end if;

  select role, firm_id into target_role, target_firm
    from public.users where id = p_assignee;

  if target_role is null or target_firm is distinct from public.my_firm_id() then
    raise exception 'That user does not belong to your firm';
  end if;

  select assignee_role into expected_role
    from public.task_types where id = p_task_type;

  if target_role is distinct from expected_role then
    raise exception 'This is a % task — the recipient must have the % role, not %',
      expected_role, expected_role, target_role;
  end if;

  -- For client tasks: verify the user is actually linked to the chosen client
  if expected_role = 'client' then
    if p_client is null then
      raise exception 'Choose a client before assigning a client task';
    end if;
    if not exists (
      select 1 from public.client_users cu
       where cu.client_id = p_client and cu.user_id = p_assignee
      union all
      select 1 from public.clients c
       where c.id = p_client and c.linked_user_id = p_assignee
    ) then
      raise exception 'This user is not linked to the selected client. Add them in the client record first.';
    end if;
    return true;
  end if;

  -- Employee tasks: admin can assign to anyone in the firm
  if caller_role = 'admin' then return true; end if;

  if p_client is not null and not public.can_access_client(p_client) then
    raise exception 'You do not have access to this client';
  end if;

  if caller_role = 'employee' then
    if p_client is not null and not public.is_assigned(p_client) then
      raise exception 'You can only create tasks for clients assigned to you';
    end if;
    if p_assignee <> auth.uid() then
      raise exception 'Employees can only assign employee tasks to themselves';
    end if;
    return true;
  end if;

  if caller_role = 'client' then
    if p_client is null or not (
      exists (select 1 from public.clients c where c.id = p_client and c.assigned_employee_id = p_assignee)
      or exists (select 1 from public.client_assignments ca where ca.client_id = p_client and ca.employee_id = p_assignee)
    ) then
      raise exception 'You can only raise queries to your assigned employee';
    end if;
    return true;
  end if;

  return false;
end $$;

-- Also fix the auto-link: when a client user signs up and a clients row
-- already has their email, insert the client_users row automatically.
create or replace function public.ensure_client_user_link(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  u public.users%rowtype;
  c public.clients%rowtype;
begin
  select * into u from public.users where id = p_user;
  if not found or u.role <> 'client' then return; end if;

  -- Link via clients.linked_user_id
  select * into c from public.clients
   where firm_id = u.firm_id
     and (linked_user_id = p_user or lower(email) = lower(u.email))
   limit 1;

  if not found then return; end if;

  -- Ensure linked_user_id is set
  if c.linked_user_id is null then
    update public.clients set linked_user_id = p_user where id = c.id;
  end if;

  -- Ensure client_users row exists
  insert into public.client_users (client_id, user_id)
  values (c.id, p_user)
  on conflict do nothing;
end $$;

-- Back-fill any existing client users that are missing their client_users row
do $$
declare
  u record;
begin
  for u in
    select id from public.users where role = 'client' and approval_status = 'approved'
  loop
    perform public.ensure_client_user_link(u.id);
  end loop;
end $$;
