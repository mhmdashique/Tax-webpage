-- 0029: assign orphan clients so task creation works.
--
-- Root cause of "couldn't create the task" for employees:
--   task_assignee_allowed() requires public.is_assigned(p_client) for the
--   employee role, and employees_can_view_all_clients only affects visibility.
--   Clients with no assigned_employee_id AND no client_assignments row are
--   therefore un-actionable for every employee: the Client picker may list
--   them, but create_task_for_assignment always raises
--   'You are not assigned to the selected client'.
--
-- Fix: back-fill the assignment, but ONLY where it is unambiguous — firms
-- with exactly one approved employee. Firms with zero or several approved
-- employees are left untouched; an admin assigns those from the client
-- profile (Assigned employee picker). Idempotent: only touches clients that
-- still have no assignment anywhere.
do $$
declare
  f record;
  emp uuid;
  emp_count integer;
begin
  for f in
    select distinct c.firm_id as firm_id
    from public.clients c
    where c.firm_id is not null
  loop
    select count(*) into emp_count
    from public.users u
    where u.firm_id = f.firm_id
      and u.role = 'employee'
      and u.approval_status = 'approved';

    if emp_count = 1 then
      select u.id into emp
      from public.users u
      where u.firm_id = f.firm_id
        and u.role = 'employee'
        and u.approval_status = 'approved'
      limit 1;

      update public.clients c
      set assigned_employee_id = emp
      where c.firm_id = f.firm_id
        and c.assigned_employee_id is null
        and not exists (
          select 1 from public.client_assignments ca where ca.client_id = c.id
        );
    end if;
  end loop;
end $$;
