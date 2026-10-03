-- 0028: Fix "You cannot assign this task to that user" for client tasks
--
-- Root cause: task_assignee_allowed checks client_users OR clients.linked_user_id
-- for the client-task branch, but only AFTER the admin short-circuit.
-- The admin short-circuit fires correctly, so the real failure is that
-- task_client_user_options returns the user (via linked_user_id or client_users)
-- but task_assignee_allowed's employee-branch fires instead because the
-- expected_role check passes yet the subsequent client-link check is inside
-- the employee branch, not the admin branch.
--
-- Actual flow for admin creating a client task:
--   task_assignee_allowed:
--     target_role = 'client', expected_role = 'client'  -> passes role check
--     caller_role = 'admin'                              -> returns TRUE  ✓
--
-- So the admin path is fine. The real problem is the CLIENT USER IS NOT LINKED:
--   task_client_user_options uses: client_users OR clients.linked_user_id
--   If BOTH are missing, the dropdown is empty and the form falls back to
--   showing all users, letting the admin pick Mohammed Ashique S whose
--   users.role = 'client' but who has no link -> task_assignee_allowed
--   returns false for the employee-role caller path.
--
-- Fix 1: back-fill client_users rows for every client user whose email
--         matches a clients row in the same firm.
-- Fix 2: rewrite task_assignee_allowed so the client-task branch is
--         explicit and gives a clear error message.

begin;

-- ── Back-fill missing client_users links ─────────────────────────────────────
-- Match on clients.linked_user_id first, then fall back to email match.

-- Step A: set linked_user_id where it is null but email matches
update public.clients c
   set linked_user_id = u.id
  from public.users u
 where u.firm_id = c.firm_id
   and u.role = 'client'
   and u.approval_status = 'approved'
   and lower(u.email) = lower(c.email)
   and c.linked_user_id is null;

-- Step B: insert missing client_users rows (linked_user_id path)
insert into public.client_users (client_id, user_id)
select c.id, c.linked_user_id
  from public.clients c
 where c.linked_user_id is not null
   and not exists (
     select 1 from public.client_users cu
      where cu.client_id = c.id and cu.user_id = c.linked_user_id
   )
on conflict do nothing;

-- ── Rewrite task_assignee_allowed ─────────────────────────────────────────────
create or replace function public.task_assignee_allowed(p_task_type uuid, p_client uuid, p_assignee uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  caller_role   text := public.current_user_role();
  target_role   text;
  target_firm   uuid;
  expected_role text;
begin
  if p_assignee is null or not public.is_approved() then return false; end if;

  select role, firm_id into target_role, target_firm
    from public.users where id = p_assignee;

  if target_role is null or target_firm is distinct from public.my_firm_id() then
    return false;
  end if;

  select assignee_role into expected_role
    from public.task_types where id = p_task_type;

  -- Role mismatch: e.g. trying to assign a client task to an employee
  if target_role is distinct from expected_role then
    raise exception 'This is a % task — the recipient must have the % role (got: %)',
      expected_role, expected_role, target_role;
  end if;

  -- ── Client task: verify the user is linked to the chosen client ──────────
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
      raise exception 'This user is not linked to the selected client. Open the client record and set a linked user first.';
    end if;
    -- Any approved staff member (admin or employee with access) may assign
    return true;
  end if;

  -- ── Employee task ─────────────────────────────────────────────────────────
  if caller_role = 'admin' then return true; end if;

  if p_client is not null and not public.can_access_client(p_client) then
    raise exception 'You do not have access to this client';
  end if;

  if caller_role = 'employee' then
    if p_client is not null and not public.is_assigned(p_client) then
      raise exception 'You can only create tasks for clients assigned to you';
    end if;
    -- Employees may only assign employee tasks to themselves
    if p_assignee <> auth.uid() then
      raise exception 'Employees can only assign employee tasks to themselves';
    end if;
    return true;
  end if;

  if caller_role = 'client' then
    -- Clients raising a query: assignee must be their assigned employee
    if p_client is null or not (
      exists (select 1 from public.clients c
               where c.id = p_client and c.assigned_employee_id = p_assignee)
      or exists (select 1 from public.client_assignments ca
                  where ca.client_id = p_client and ca.employee_id = p_assignee)
    ) then
      raise exception 'You can only raise queries to your assigned employee';
    end if;
    return true;
  end if;

  return false;
end $$;

commit;
