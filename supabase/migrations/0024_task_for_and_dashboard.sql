begin;

alter table public.tasks
  add column if not exists task_for text not null default 'employee'
    check (task_for in ('employee', 'client')),
  add column if not exists follow_up_owner uuid references public.users(id) on delete set null,
  add column if not exists client_visible boolean not null default false,
  add column if not exists notify_client boolean not null default true,
  add column if not exists last_reminder_at timestamptz;

update public.tasks t
set task_for = case when tt.assignee_role = 'client' then 'client' else 'employee' end,
    client_visible = (tt.assignee_role = 'client'),
    follow_up_owner = case when tt.assignee_role = 'client' then coalesce(
      (select c.assigned_employee_id from public.clients c where c.id = t.related_client_id),
      (select ca.employee_id from public.client_assignments ca where ca.client_id = t.related_client_id order by ca.assigned_at limit 1)
    ) else null end
from public.task_types tt
where tt.id = t.task_type_id;

create or replace function public.set_task_for_fields()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  assignee_role text;
begin
  select tt.assignee_role into assignee_role
  from public.task_types tt where tt.id = new.task_type_id;

  if assignee_role = 'client' then
    new.task_for := 'client';
    new.client_visible := true;
    if new.follow_up_owner is null and new.related_client_id is not null then
      select coalesce(
        (select c.assigned_employee_id from public.clients c where c.id = new.related_client_id),
        (select ca.employee_id from public.client_assignments ca where ca.client_id = new.related_client_id order by ca.assigned_at limit 1)
      ) into new.follow_up_owner;
    end if;
  else
    new.task_for := 'employee';
    new.client_visible := false;
    new.follow_up_owner := null;
  end if;
  return new;
end
$$;

drop trigger if exists trg_set_task_for_fields on public.tasks;
create trigger trg_set_task_for_fields before insert or update of task_type_id, related_client_id, follow_up_owner
on public.tasks for each row execute function public.set_task_for_fields();

create or replace function public.task_employee_client_options(p_employee uuid)
returns table (id uuid, name text, business_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_approved()
    or (public.current_user_role() <> 'admin' and p_employee <> auth.uid())
    or not exists (
      select 1 from public.users u
      where u.id = p_employee and u.firm_id = public.my_firm_id()
        and u.role = 'employee' and u.approval_status = 'approved'
    ) then
    raise exception 'You cannot view this employee client list';
  end if;

  return query
    select c.id, c.name, c.business_name
    from public.clients c
    where c.firm_id = public.my_firm_id()
      and (
        c.assigned_employee_id = p_employee
        or exists (
          select 1 from public.client_assignments ca
          where ca.client_id = c.id and ca.employee_id = p_employee
        )
      )
    order by coalesce(c.business_name, c.name);
end
$$;

create or replace function public.task_client_user_options(p_client uuid)
returns table (id uuid, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_approved() or p_client is null or not public.can_access_client(p_client) then
    raise exception 'You cannot access this client';
  end if;
  return query
    select options.id, options.name
    from (
      select distinct u.id, u.name, (u.id = c.linked_user_id) is true as is_primary
      from public.users u
      join public.clients c on c.id = p_client and c.firm_id = public.my_firm_id()
      where u.firm_id = public.my_firm_id()
        and u.role = 'client'
        and u.approval_status = 'approved'
        and (
          exists (select 1 from public.client_users cu where cu.client_id = p_client and cu.user_id = u.id)
          or c.linked_user_id = u.id
        )
    ) options
    order by options.is_primary desc, options.name;
end
$$;

create or replace function public.queue_overdue_task_notifications()
returns integer language plpgsql security definer set search_path = public as $$
declare
  t record;
  queued integer := 0;
  notification_id uuid;
begin
  for t in
    select tasks.id, tasks.title, tasks.assigned_to, users.email
    from public.tasks
    join public.users on users.id = tasks.assigned_to
    where tasks.status not in ('done', 'cancelled')
      and tasks.due_date < current_date
      and tasks.assigned_to is not null
      and users.email is not null
  loop
    insert into public.task_notifications (task_id, recipient_id, recipient_email, event_type, message)
    values (t.id, t.assigned_to, t.email, 'overdue', 'Task overdue: ' || t.title)
    on conflict (task_id, recipient_id, event_type) where event_type <> 'reminder' do nothing
    returning id into notification_id;
    if notification_id is not null then
      insert into public.task_audit (task_id, action, details)
      values (t.id, 'overdue_notification_queued', jsonb_build_object('notification_id', notification_id));
      queued := queued + 1;
    end if;
    notification_id := null;
  end loop;
  return queued;
end
$$;

drop policy if exists tasks_select_scoped on public.tasks;
create policy tasks_select_scoped on public.tasks for select to authenticated using (
  public.is_approved()
  and (
    (public.current_user_role() = 'admin' and firm_id = public.my_firm_id())
    or (
      public.current_user_role() = 'employee' and firm_id = public.my_firm_id()
      and (
        assigned_to = auth.uid()
        or follow_up_owner = auth.uid()
        or (related_client_id is not null and public.can_access_client(related_client_id))
      )
    )
    or (
      public.current_user_role() = 'client'
      and task_for = 'client' and client_visible and assigned_to = auth.uid()
      and related_client_id is not null and public.can_access_client(related_client_id)
    )
  )
);

create or replace function public.create_task_for_assignment(
  p_task_type uuid,
  p_task_for text,
  p_title text,
  p_client uuid,
  p_filing uuid,
  p_document uuid,
  p_assignee uuid,
  p_follow_up_owner uuid,
  p_priority text,
  p_due_date date,
  p_notes text,
  p_save_unassigned boolean default false,
  p_notify_client boolean default true
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  tt public.task_types%rowtype;
  task_id uuid;
  follow_up uuid := p_follow_up_owner;
  owner_role text;
  owner_firm uuid;
begin
  if not public.is_approved() then raise exception 'Approved users only'; end if;
  if p_task_for is null or p_task_for not in ('employee', 'client') then
    raise exception 'Choose whether this is an employee or client task';
  end if;
  if p_task_for = 'client' and p_save_unassigned then
    raise exception 'Client tasks cannot be saved unassigned';
  end if;

  select * into tt from public.task_types where id = p_task_type;
  if not found then raise exception 'Task type not found'; end if;
  if (p_task_for = 'client' and tt.assignee_role <> 'client')
     or (p_task_for = 'employee' and tt.assignee_role <> 'employee') then
    raise exception 'Choose a task type for the selected task audience';
  end if;
  if p_task_for = 'client' and p_client is null then
    raise exception 'Choose a client for a client task';
  end if;

  if p_task_for = 'client' then
    if follow_up is null and p_client is not null then
      select coalesce(
        (select c.assigned_employee_id from public.clients c where c.id = p_client),
        (select ca.employee_id from public.client_assignments ca where ca.client_id = p_client order by ca.assigned_at limit 1)
      ) into follow_up;
    end if;
    if follow_up is null then raise exception 'Choose a follow-up employee for this client task'; end if;
    if public.current_user_role() = 'employee' and follow_up <> auth.uid() then
      raise exception 'Employees can only follow up on their own client tasks';
    end if;
    select role, firm_id into owner_role, owner_firm from public.users
    where id = follow_up and approval_status = 'approved';
    if owner_role is distinct from 'employee' or owner_firm is distinct from public.my_firm_id() then
      raise exception 'Follow-up owner must be an employee in your firm';
    end if;
  else
    follow_up := null;
  end if;

  task_id := public.create_assigned_task(
    p_task_type, p_title, p_client, p_filing, p_document, p_assignee,
    p_priority, p_due_date, p_notes, p_save_unassigned
  );

  update public.tasks
    set follow_up_owner = follow_up,
        notify_client = coalesce(p_notify_client, true)
    where id = task_id;

  if p_task_for = 'client' then
    if not coalesce(p_notify_client, true) then
      delete from public.task_notifications
      where task_notifications.task_id = task_id
        and recipient_id = p_assignee and event_type = 'assigned';
    end if;

    insert into public.task_notifications (task_id, recipient_id, recipient_email, event_type, message)
    select task_id, u.id, u.email, 'assigned', 'A client task is waiting for follow-up: ' || p_title
    from public.users u
    where u.id = follow_up and u.email is not null
      and follow_up <> p_assignee
    on conflict (task_id, recipient_id, event_type) where event_type <> 'reminder' do nothing;
  end if;

  insert into public.task_audit (task_id, actor_id, action, details)
  values (task_id, auth.uid(), 'task_audience_set', jsonb_build_object(
    'task_for', p_task_for, 'follow_up_owner', follow_up, 'notify_client', coalesce(p_notify_client, true)
  ));

  return task_id;
end
$$;

create or replace function public.change_task_status(p_task uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.tasks%rowtype;
  caller_role text := public.current_user_role();
begin
  if not public.is_approved() or p_status is null
     or p_status not in ('open', 'in_progress', 'done', 'cancelled') then
    raise exception 'Invalid task status or user is not approved';
  end if;
  select * into t from public.tasks
  where id = p_task and firm_id = public.my_firm_id()
  for update;
  if not found then raise exception 'Task not found'; end if;

  if caller_role = 'client' then
    if t.task_for <> 'client' or not t.client_visible or t.assigned_to <> auth.uid()
       or p_status not in ('open', 'in_progress', 'done') then
      raise exception 'Clients can update only their own visible client tasks';
    end if;
  elsif caller_role <> 'admin' and t.assigned_to <> auth.uid() then
    raise exception 'Only the assignee or an admin can update this task';
  end if;

  if p_status = 'cancelled' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'A cancellation reason is required';
  end if;
  update public.tasks set status = p_status,
    cancelled_reason = case when p_status = 'cancelled' then btrim(p_reason) else cancelled_reason end,
    completed_at = case when p_status = 'done' then now() else null end
  where id = p_task;
  insert into public.task_audit (task_id, actor_id, action, details)
  values (p_task, auth.uid(), 'status_changed', jsonb_build_object(
    'from', t.status, 'to', p_status, 'reason', nullif(btrim(p_reason), '')
  ));
end
$$;

create or replace function public.send_task_reminder(p_task uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.tasks%rowtype;
  email_address text;
begin
  if not public.is_approved() then raise exception 'Approved users only'; end if;
  select * into t from public.tasks
  where id = p_task and firm_id = public.my_firm_id()
  for update;
  if not found or t.task_for <> 'client' or t.assigned_to is null then
    raise exception 'Client task not found';
  end if;
  if public.current_user_role() <> 'admin' and t.follow_up_owner <> auth.uid() then
    raise exception 'Only the follow-up owner or an admin can remind the client';
  end if;
  if t.last_reminder_at >= now() - interval '24 hours' then
    raise exception 'A reminder was already sent in the last 24 hours';
  end if;

  select email into email_address from public.users where id = t.assigned_to;
  if email_address is null then raise exception 'The assigned client user has no email address'; end if;

  update public.tasks set last_reminder_at = now() where id = p_task;
  insert into public.task_notifications (task_id, recipient_id, recipient_email, event_type, message)
  values (t.id, t.assigned_to, email_address, 'reminder', 'Reminder: ' || t.title);
  insert into public.task_audit (task_id, actor_id, action, details)
  values (t.id, auth.uid(), 'client_reminder_sent', jsonb_build_object('recipient_id', t.assigned_to));
end
$$;

create or replace function public.reassign_task_follow_up(p_task uuid, p_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.tasks%rowtype;
  target_email text;
begin
  if not public.is_approved() or public.current_user_role() <> 'admin' then
    raise exception 'Only an admin can change a client task follow-up owner';
  end if;
  select * into t from public.tasks
  where id = p_task and firm_id = public.my_firm_id() and task_for = 'client'
  for update;
  if not found then raise exception 'Client task not found'; end if;
  if not exists (
    select 1 from public.users u
    where u.id = p_owner and u.firm_id = public.my_firm_id()
      and u.role = 'employee' and u.approval_status = 'approved'
  ) then raise exception 'Follow-up owner must be an approved employee in this firm'; end if;
  if t.follow_up_owner = p_owner then return; end if;

  update public.tasks set follow_up_owner = p_owner where id = p_task;
  insert into public.task_audit (task_id, actor_id, action, details)
  values (p_task, auth.uid(), 'follow_up_owner_reassigned', jsonb_build_object(
    'from', t.follow_up_owner, 'to', p_owner
  ));
  insert into public.task_notifications (task_id, recipient_id, recipient_email, event_type, message)
  select p_task, u.id, u.email, 'reassigned', 'Client task follow-up reassigned: ' || t.title
  from public.users u
  where u.id in (t.follow_up_owner, p_owner) and u.email is not null
  on conflict (task_id, recipient_id, event_type) where event_type <> 'reminder' do nothing;
end
$$;

alter table public.task_notifications drop constraint if exists task_notifications_event_type_check;
alter table public.task_notifications add constraint task_notifications_event_type_check
  check (event_type in ('assigned', 'reassigned', 'overdue', 'reminder'));
drop index if exists public.task_notifications_deduplicate_idx;
create unique index task_notifications_deduplicate_idx
  on public.task_notifications (task_id, recipient_id, event_type)
  where event_type <> 'reminder';

revoke all on function public.set_task_for_fields() from public, anon, authenticated;
revoke all on function public.task_employee_client_options(uuid) from public, anon;
revoke all on function public.create_assigned_task(uuid, text, uuid, uuid, uuid, uuid, text, date, text, boolean) from public, anon, authenticated;
revoke all on function public.create_task_for_assignment(uuid, text, text, uuid, uuid, uuid, uuid, uuid, text, date, text, boolean, boolean) from public, anon;
revoke all on function public.send_task_reminder(uuid) from public, anon;
revoke all on function public.reassign_task_follow_up(uuid, uuid) from public, anon;
revoke all on function public.queue_overdue_task_notifications() from public, anon, authenticated;
revoke all on function public.change_task_status(uuid, text, text) from public, anon;
grant execute on function public.task_employee_client_options(uuid) to authenticated;
grant execute on function public.create_task_for_assignment(uuid, text, text, uuid, uuid, uuid, uuid, uuid, text, date, text, boolean, boolean) to authenticated;
grant execute on function public.send_task_reminder(uuid) to authenticated;
grant execute on function public.reassign_task_follow_up(uuid, uuid) to authenticated;
grant execute on function public.queue_overdue_task_notifications() to service_role;
grant execute on function public.change_task_status(uuid, text, text) to authenticated;

commit;
