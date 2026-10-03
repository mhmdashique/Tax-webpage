-- Fix: allow assignment of tasks with no related_client_id (e.g. admin tasks)
-- Previously p_client IS NULL caused task_assignee_allowed to return false,
-- raising "You cannot assign this task to that user" for clientless tasks.

create or replace function public.task_assignee_allowed(p_task_type uuid, p_client uuid, p_assignee uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  caller_role text := public.current_user_role();
  target_role text;
  target_firm uuid;
  expected_role text;
begin
  if p_assignee is null or not public.is_approved() then return false; end if;
  select role, firm_id into target_role, target_firm from public.users where id = p_assignee;
  if target_role is null or target_firm is distinct from public.my_firm_id() then return false; end if;
  select assignee_role into expected_role from public.task_types where id = p_task_type;
  if target_role is distinct from expected_role then return false; end if;

  if caller_role = 'admin' then return true; end if;
  -- Only block on client access when a client is actually specified
  if p_client is not null and not public.can_access_client(p_client) then return false; end if;

  if caller_role = 'employee' then
    if p_client is not null and not public.is_assigned(p_client) then return false; end if;
    return (target_role = 'employee' and p_assignee = auth.uid())
      or (target_role = 'client' and p_client is not null and exists (
          select 1 from public.client_users cu where cu.client_id = p_client and cu.user_id = p_assignee
          union all
          select 1 from public.clients c where c.id = p_client and c.linked_user_id = p_assignee
        ));
  elsif caller_role = 'client' then
    return target_role = 'employee' and p_client is not null and (
      exists (select 1 from public.clients c where c.id = p_client and c.assigned_employee_id = p_assignee)
      or exists (select 1 from public.client_assignments ca where ca.client_id = p_client and ca.employee_id = p_assignee)
    );
  end if;
  return false;
end $$;
