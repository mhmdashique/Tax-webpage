-- 0028: validate task creators and recipients independently.
--
-- Client task recipients remain in tasks.assigned_to; staff responsible for
-- follow-up remain in tasks.follow_up_owner.

begin;

create or replace function public.task_assignee_allowed(
  p_task_type uuid,
  p_client uuid,
  p_assignee uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_role text := public.current_user_role();
  target_role text;
  target_firm uuid;
  target_approval_status text;
  expected_role text;
begin
  if auth.uid() is null or not public.is_approved() then
    raise exception 'You must be logged in and approved to assign tasks';
  end if;

  if caller_role not in ('admin', 'employee', 'client') then
    raise exception 'Only approved staff or client users can create tasks';
  end if;

  if p_assignee is null then
    raise exception 'Choose a task recipient';
  end if;

  select u.role, u.firm_id, u.approval_status
    into target_role, target_firm, target_approval_status
    from public.users u
   where u.id = p_assignee;

  if target_role is null or target_firm is distinct from public.my_firm_id() then
    raise exception 'The selected user does not belong to your firm';
  end if;
  if target_approval_status is distinct from 'approved' then
    raise exception 'The selected user is not approved';
  end if;

  select tt.assignee_role
    into expected_role
    from public.task_types tt
   where tt.id = p_task_type;

  if expected_role is null then
    raise exception 'The selected task type does not exist';
  end if;
  if target_role is distinct from expected_role then
    raise exception 'This task requires a % recipient, but the selected user is a %',
      expected_role, target_role;
  end if;

  if p_client is not null and not exists (
    select 1
      from public.clients c
     where c.id = p_client
       and c.firm_id = public.my_firm_id()
  ) then
    raise exception 'The selected client does not belong to your firm';
  end if;

  if caller_role = 'admin' then
    if expected_role = 'client' then
      if p_client is null then
        raise exception 'Choose a client before assigning a client task';
      end if;
      if not exists (
        select 1
          from public.client_users cu
         where cu.client_id = p_client and cu.user_id = p_assignee
        union all
        select 1
          from public.clients c
         where c.id = p_client and c.linked_user_id = p_assignee
      ) then
        raise exception 'This user is not linked to the selected client';
      end if;
    end if;
    return true;
  end if;

  if p_client is not null and not public.can_access_client(p_client) then
    raise exception 'You do not have access to the selected client';
  end if;

  if caller_role = 'employee' then
    if p_client is not null and not public.is_assigned(p_client) then
      raise exception 'You are not assigned to the selected client';
    end if;

    if expected_role = 'client' then
      if p_client is null then
        raise exception 'Choose a client before assigning a client task';
      end if;
      if not exists (
        select 1
          from public.client_users cu
         where cu.client_id = p_client and cu.user_id = p_assignee
        union all
        select 1
          from public.clients c
         where c.id = p_client and c.linked_user_id = p_assignee
      ) then
        raise exception 'This user is not linked to the selected client';
      end if;
      return true;
    end if;

    if p_assignee <> auth.uid() then
      raise exception 'Employees can only assign employee tasks to themselves';
    end if;
    return true;
  end if;

  if caller_role = 'client' then
    if expected_role <> 'employee' then
      raise exception 'Clients can only raise tasks for their assigned employee';
    end if;
    if p_client is null or not public.can_access_client(p_client) then
      raise exception 'You do not have access to the selected client';
    end if;
    if not (
      exists (
        select 1
          from public.clients c
         where c.id = p_client and c.assigned_employee_id = p_assignee
      )
      or exists (
        select 1
          from public.client_assignments ca
         where ca.client_id = p_client and ca.employee_id = p_assignee
      )
    ) then
      raise exception 'The selected employee is not assigned to this client';
    end if;
    return true;
  end if;

  return false;
end
$$;

commit;
