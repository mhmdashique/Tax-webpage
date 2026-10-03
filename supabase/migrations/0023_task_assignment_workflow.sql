begin;

create table if not exists public.task_types (
  id uuid primary key default gen_random_uuid(),
  task_key text not null unique,
  name text not null,
  task_group text not null check (task_group in ('Client tasks', 'Employee tasks', 'Admin tasks')),
  default_title text not null,
  default_priority text not null check (default_priority in ('low', 'normal', 'high', 'urgent')),
  default_due_days integer not null default 3 check (default_due_days >= 0),
  allowed_creator_roles text[] not null,
  assignee_role text not null check (assignee_role in ('employee', 'client')),
  requires_filing boolean not null default false,
  requires_document boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.task_types (
  task_key, name, task_group, default_title, default_priority, default_due_days,
  allowed_creator_roles, assignee_role, requires_filing, requires_document
) values
  ('upload_documents', 'Upload documents', 'Client tasks', 'Upload requested documents', 'normal', 5, array['admin','employee'], 'client', false, false),
  ('reupload_document', 'Re-upload corrected file', 'Client tasks', 'Re-upload corrected file', 'high', 2, array['admin','employee'], 'client', false, true),
  ('create_invoice', 'Create invoice', 'Client tasks', 'Create invoice', 'normal', 5, array['admin','employee'], 'client', false, false),
  ('record_payment_client', 'Record payment / upload proof', 'Client tasks', 'Record payment and upload proof', 'high', 2, array['admin','employee'], 'client', false, false),
  ('approve_tax_summary', 'Approve tax summary or raise query', 'Client tasks', 'Review and approve tax summary', 'high', 2, array['admin','employee'], 'client', true, false),
  ('raise_query', 'Raise query', 'Client tasks', 'Respond to client query', 'high', 2, array['client'], 'employee', true, false),
  ('review_document', 'Review document', 'Employee tasks', 'Review uploaded document', 'normal', 2, array['admin','employee'], 'employee', false, true),
  ('resolve_validation_errors', 'Resolve validation errors', 'Employee tasks', 'Resolve validation errors', 'high', 2, array['admin','employee'], 'employee', true, false),
  ('prepare_gst_computation', 'Prepare GST computation', 'Employee tasks', 'Prepare GST computation', 'high', 3, array['admin','employee'], 'employee', true, false),
  ('advance_filing', 'Move filing to next stage', 'Employee tasks', 'Move filing to next stage', 'normal', 2, array['admin','employee'], 'employee', true, false),
  ('record_payment_employee', 'Record payment', 'Employee tasks', 'Record client payment', 'normal', 3, array['admin','employee'], 'employee', false, false),
  ('escalate_filing', 'Escalate filing', 'Employee tasks', 'Escalate at-risk filing', 'high', 1, array['admin','employee'], 'employee', true, false),
  ('submit_admin_approval', 'Submit for admin approval', 'Employee tasks', 'Submit filing for admin approval', 'high', 2, array['admin','employee'], 'employee', true, false),
  ('add_client_employee', 'Add client / employee', 'Admin tasks', 'Add client or employee', 'normal', 5, array['admin'], 'employee', false, false),
  ('assign_client', 'Assign client to employee', 'Admin tasks', 'Assign client to employee', 'normal', 2, array['admin'], 'employee', false, false),
  ('approve_draft', 'Approve or reject draft', 'Admin tasks', 'Review and approve draft', 'high', 2, array['admin'], 'employee', true, false),
  ('mark_filed', 'Mark filed with ARN', 'Admin tasks', 'Verify filing and mark filed', 'high', 1, array['admin'], 'employee', true, false),
  ('manage_rules', 'Manage tax rules', 'Admin tasks', 'Review tax rule settings', 'normal', 5, array['admin'], 'employee', false, false),
  ('review_gst_risk', 'Review overdue and late-fee risk', 'Admin tasks', 'Review GST payment risk', 'high', 1, array['admin'], 'employee', true, false)
on conflict (task_key) do nothing;

alter table public.tasks
  add column if not exists task_type_id uuid references public.task_types(id) on delete set null,
  add column if not exists document_id uuid references public.documents(id) on delete set null,
  add column if not exists created_by uuid references public.users(id) on delete set null,
  add column if not exists notes text,
  add column if not exists cancelled_reason text,
  add column if not exists completed_at timestamptz,
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'system'));

update public.tasks set priority = 'normal' where priority = 'medium';
update public.tasks set status = 'open' where status = 'todo';
update public.tasks set status = 'in_progress' where status = 'in-progress';

create table if not exists public.task_settings (
  id boolean primary key default true check (id),
  overload_open_task_threshold integer not null default 5 check (overload_open_task_threshold >= 0),
  updated_at timestamptz not null default now()
);
insert into public.task_settings (id) values (true) on conflict do nothing;
alter table public.task_settings enable row level security;

create table if not exists public.task_audit (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.task_notifications (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  recipient_email text not null,
  event_type text not null check (event_type in ('assigned', 'reassigned', 'overdue')),
  message text not null,
  created_at timestamptz not null default now(),
  email_sent_at timestamptz,
  read_at timestamptz
);
create index if not exists task_notifications_email_pending_idx
  on public.task_notifications (created_at) where email_sent_at is null;
create unique index if not exists task_notifications_deduplicate_idx
  on public.task_notifications (task_id, recipient_id, event_type);
create index if not exists tasks_assignment_status_due_idx on public.tasks (assigned_to, status, due_date);

alter table public.task_types enable row level security;
alter table public.task_audit enable row level security;
alter table public.task_notifications enable row level security;

create or replace function public.can_create_task_type(p_task_type uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.task_types tt
    where tt.id = p_task_type
      and public.is_approved()
      and public.current_user_role() = any(tt.allowed_creator_roles)
  )
$$;

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
  if p_client is not null and not public.can_access_client(p_client) then return false; end if;

  if caller_role = 'employee' then
    if not public.is_assigned(p_client) then return false; end if;
    return (target_role = 'employee' and p_assignee = auth.uid())
      or (target_role = 'client' and exists (
          select 1 from public.client_users cu where cu.client_id = p_client and cu.user_id = p_assignee
          union all
          select 1 from public.clients c where c.id = p_client and c.linked_user_id = p_assignee
        ));
  elsif caller_role = 'client' then
    return target_role = 'employee' and (
      exists (select 1 from public.clients c where c.id = p_client and c.assigned_employee_id = p_assignee)
      or exists (select 1 from public.client_assignments ca where ca.client_id = p_client and ca.employee_id = p_assignee)
    );
  end if;
  return false;
end
$$;

create or replace function public.task_can_access_client(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_client is null or public.can_access_client(p_client)
$$;

create or replace function public.task_client_employee_options(p_client uuid)
returns table (id uuid, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_approved() or p_client is null or not public.can_access_client(p_client) then
    raise exception 'You cannot access this client';
  end if;
  return query
    select distinct u.id, u.name
    from public.users u
    where u.firm_id = public.my_firm_id()
      and u.role = 'employee'
      and u.approval_status = 'approved'
      and (
        exists (select 1 from public.clients c where c.id = p_client and c.assigned_employee_id = u.id)
        or exists (select 1 from public.client_assignments ca where ca.client_id = p_client and ca.employee_id = u.id)
      )
    order by u.name;
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
    select distinct u.id, u.name
    from public.users u
    where u.firm_id = public.my_firm_id()
      and u.role = 'client'
      and u.approval_status = 'approved'
      and (
        exists (select 1 from public.client_users cu where cu.client_id = p_client and cu.user_id = u.id)
        or exists (select 1 from public.clients c where c.id = p_client and c.linked_user_id = u.id)
      )
    order by u.name;
end
$$;

drop policy if exists "tasks admin all" on public.tasks;
drop policy if exists "tasks employee own" on public.tasks;
drop policy if exists tasks_select_scoped on public.tasks;
create policy tasks_select_scoped on public.tasks for select to authenticated using (
  public.is_approved()
  and (
    (public.current_user_role() = 'admin' and firm_id = public.my_firm_id())
    or (
      public.current_user_role() = 'employee' and firm_id = public.my_firm_id()
      and (assigned_to = auth.uid() or (related_client_id is not null and public.can_access_client(related_client_id)))
    )
    or (
      public.current_user_role() = 'client' and (assigned_to = auth.uid() or created_by = auth.uid())
      and related_client_id is not null and public.can_access_client(related_client_id)
    )
  )
);
drop policy if exists tasks_insert_scoped on public.tasks;
create policy tasks_insert_scoped on public.tasks for insert to authenticated with check (
  public.is_approved()
  and created_by = auth.uid()
  and firm_id = public.my_firm_id()
  and public.can_create_task_type(task_type_id)
  and public.task_can_access_client(related_client_id)
  and (
    assigned_to is null and public.current_user_role() = 'admin'
    or public.task_assignee_allowed(task_type_id, related_client_id, assigned_to)
  )
  and (
    related_filing_id is null
    or exists (select 1 from public.filings f where f.id = related_filing_id and f.client_id = related_client_id)
  )
  and (
    document_id is null
    or exists (select 1 from public.documents d where d.id = document_id and d.client_id = related_client_id)
  )
);
drop policy if exists tasks_update_scoped on public.tasks;
drop policy if exists tasks_delete_scoped on public.tasks;
create policy tasks_delete_scoped on public.tasks for delete to authenticated using (
  public.is_approved() and public.current_user_role() = 'admin' and firm_id = public.my_firm_id()
);

create policy task_types_select on public.task_types for select to authenticated using (
  public.is_approved() and public.current_user_role() = any(allowed_creator_roles)
);
create policy task_settings_admin_select on public.task_settings for select to authenticated using (
  public.is_approved() and public.is_admin()
);
create policy task_settings_admin_update on public.task_settings for update to authenticated
  using (public.is_approved() and public.is_admin())
  with check (public.is_approved() and public.is_admin());
create policy task_audit_select on public.task_audit for select to authenticated using (
  exists (
    select 1 from public.tasks t where t.id = task_audit.task_id
      and public.is_approved()
      and (public.is_admin() or t.created_by = auth.uid() or t.assigned_to = auth.uid())
  )
);
create policy task_notifications_select on public.task_notifications for select to authenticated using (
  public.is_approved() and recipient_id = auth.uid()
);


create or replace function public.task_assignee_workload(p_task_type uuid, p_client uuid, p_assignee uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  open_count integer;
  overdue_count integer;
  threshold integer;
begin
  if public.current_user_role() = 'client' then
    raise exception 'Workload details are not available to client users';
  end if;
  if not public.task_assignee_allowed(p_task_type, p_client, p_assignee) then
    raise exception 'You cannot assign this task to that user';
  end if;
  select count(*) filter (where status not in ('done', 'cancelled')),
         count(*) filter (where status not in ('done', 'cancelled') and due_date < current_date)
    into open_count, overdue_count
    from public.tasks where assigned_to = p_assignee and firm_id = public.my_firm_id();
  select overload_open_task_threshold into threshold from public.task_settings where id;
  return jsonb_build_object(
    'open_count', coalesce(open_count, 0),
    'overdue_count', coalesce(overdue_count, 0),
    'overloaded', coalesce(open_count, 0) >= coalesce(threshold, 5),
    'threshold', coalesce(threshold, 5)
  );
end
$$;

create or replace function public.create_assigned_task(
  p_task_type uuid, p_title text, p_client uuid, p_filing uuid, p_document uuid,
  p_assignee uuid, p_priority text, p_due_date date, p_notes text,
  p_save_unassigned boolean default false
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  tt public.task_types%rowtype;
  task_id uuid;
  caller_role text := public.current_user_role();
  target_assignee uuid := p_assignee;
begin
  if not public.is_approved() or not public.can_create_task_type(p_task_type) then
    raise exception 'You do not have permission to create this task type';
  end if;
  select * into tt from public.task_types where id = p_task_type;
  if not found then raise exception 'Task type not found'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'Task title is required'; end if;
  if p_priority is not null and p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Invalid task priority';
  end if;
  if tt.requires_filing and p_filing is null then raise exception 'Choose a filing for this task'; end if;
  if tt.requires_document and p_document is null then raise exception 'Choose a document for this task'; end if;
  if p_client is null and caller_role <> 'admin' then raise exception 'Choose a client for this task'; end if;
  if p_client is not null and not public.can_access_client(p_client) then raise exception 'You cannot access this client'; end if;
  if p_filing is not null and not exists (
    select 1 from public.filings where id = p_filing and client_id = p_client and firm_id = public.my_firm_id()
  ) then raise exception 'The selected filing does not belong to this client'; end if;
  if p_document is not null and not exists (
    select 1 from public.documents where id = p_document and client_id = p_client
  ) then raise exception 'The selected document does not belong to this client'; end if;

  if p_save_unassigned then
    if caller_role <> 'admin' then raise exception 'Only admins can save an unassigned task'; end if;
    target_assignee := null;
  elsif not public.task_assignee_allowed(p_task_type, p_client, target_assignee) then
    raise exception 'You cannot assign this task to that user';
  end if;

  insert into public.tasks (
    firm_id, task_type_id, title, related_client_id, related_filing_id, document_id,
    assigned_to, created_by, priority, status, due_date, notes, source
  ) values (
    public.my_firm_id(), p_task_type, btrim(p_title), p_client, p_filing, p_document,
    target_assignee, auth.uid(), coalesce(p_priority, tt.default_priority), 'open',
    coalesce(p_due_date, current_date + tt.default_due_days), nullif(btrim(p_notes), ''), 'manual'
  ) returning id into task_id;

  insert into public.task_audit (task_id, actor_id, action, details)
  values (task_id, auth.uid(), 'task_created', jsonb_build_object(
    'task_type', tt.task_key, 'assigned_to', target_assignee, 'client_id', p_client
  ));
  if target_assignee is not null then
    insert into public.task_notifications (task_id, recipient_id, recipient_email, event_type, message)
    select task_id, u.id, u.email, 'assigned', 'A task was assigned to you: ' || btrim(p_title)
    from public.users u where u.id = target_assignee and u.email is not null;
  end if;
  return task_id;
end
$$;

create or replace function public.change_task_status(p_task uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.tasks%rowtype;
begin
  if not public.is_approved() or p_status not in ('open', 'in_progress', 'done', 'cancelled') then
    raise exception 'Invalid task status or user is not approved';
  end if;
  select * into t from public.tasks where id = p_task and firm_id = public.my_firm_id() for update;
  if not found then raise exception 'Task not found'; end if;
  if public.current_user_role() <> 'admin' and t.assigned_to <> auth.uid() then
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

create or replace function public.change_task_priority(p_task uuid, p_priority text)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.tasks%rowtype;
begin
  if not public.is_approved() or p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Invalid task priority or user is not approved';
  end if;
  select * into t from public.tasks where id = p_task and firm_id = public.my_firm_id() for update;
  if not found then raise exception 'Task not found'; end if;
  if public.current_user_role() <> 'admin' and (
    t.assigned_to <> auth.uid() or t.related_client_id is null or not public.is_assigned(t.related_client_id)
  ) then
    raise exception 'Only an admin or assigned employee can change task priority';
  end if;
  update public.tasks set priority = p_priority where id = p_task;
  insert into public.task_audit (task_id, actor_id, action, details)
  values (p_task, auth.uid(), 'priority_changed', jsonb_build_object('from', t.priority, 'to', p_priority));
end
$$;

create or replace function public.reassign_task(p_task uuid, p_assignee uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.tasks%rowtype;
begin
  if not public.is_approved() then raise exception 'Approved users only'; end if;
  select * into t from public.tasks where id = p_task and firm_id = public.my_firm_id() for update;
  if not found then raise exception 'Task not found'; end if;
  if public.current_user_role() <> 'admin' then
    if t.assigned_to <> auth.uid() or public.current_user_role() <> 'employee'
       or t.related_client_id is null or not public.is_assigned(t.related_client_id) then
      raise exception 'Only an admin or the assigned employee can reassign this task';
    end if;
  end if;
  if not public.task_assignee_allowed(t.task_type_id, t.related_client_id, p_assignee) then
    raise exception 'You cannot assign this task to that user';
  end if;
  if t.assigned_to = p_assignee then return; end if;
  update public.tasks set assigned_to = p_assignee where id = p_task;
  insert into public.task_audit (task_id, actor_id, action, details)
  values (p_task, auth.uid(), 'task_reassigned', jsonb_build_object(
    'from', t.assigned_to, 'to', p_assignee
  ));
  insert into public.task_notifications (task_id, recipient_id, recipient_email, event_type, message)
  select p_task, u.id, u.email, 'reassigned', 'Task reassigned: ' || t.title
    from public.users u where u.id in (t.assigned_to, p_assignee) and u.email is not null;
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
    on conflict (task_id, recipient_id, event_type) do nothing
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

create or replace function public.mark_task_notification_read(p_notification uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.task_notifications set read_at = coalesce(read_at, now())
   where id = p_notification and recipient_id = auth.uid() and public.is_approved();
  if not found then raise exception 'Notification not found'; end if;
end
$$;

create or replace function public.create_document_review_task()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  task_type uuid;
  assignee uuid;
  task_id uuid;
begin
  select id into task_type from public.task_types where task_key = 'review_document';
  select coalesce(c.assigned_employee_id, (
    select ca.employee_id from public.client_assignments ca where ca.client_id = new.client_id limit 1
  )) into assignee from public.clients c where c.id = new.client_id;
  if task_type is null or assignee is null then return new; end if;
  insert into public.tasks (
    firm_id, task_type_id, title, related_client_id, related_filing_id, document_id,
    assigned_to, created_by, priority, status, due_date, source
  ) values (
    new.firm_id, task_type, 'Review uploaded document: ' || new.file_name, new.client_id,
    new.filing_id, new.id, assignee, new.uploaded_by, 'normal', 'open', current_date + 2, 'system'
  ) returning id into task_id;
  insert into public.task_audit (task_id, actor_id, action, details)
  values (task_id, new.uploaded_by, 'document_review_task_created', jsonb_build_object('document_id', new.id));
  insert into public.task_notifications (task_id, recipient_id, recipient_email, event_type, message)
  select task_id, u.id, u.email, 'assigned', 'A document review task was assigned to you: ' || new.file_name
  from public.users u where u.id = assignee and u.email is not null;
  return new;
end
$$;

create or replace function public.sync_document_review_task()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  reupload_type uuid;
  review_type uuid;
  client_user uuid;
  task_id uuid;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'received' and new.document_id is not null then
    select id into review_type from public.task_types where task_key = 'review_document';
    update public.tasks set status = 'done', completed_at = now()
      where document_id = new.document_id and task_type_id = review_type
        and status not in ('done', 'cancelled');
    insert into public.task_audit (task_id, actor_id, action, details)
    select id, new.reviewed_by, 'document_accepted_task_completed',
      jsonb_build_object('checklist_id', new.id)
    from public.tasks where document_id = new.document_id and task_type_id = review_type
      and status = 'done';
  elsif new.status = 'rejected' and new.document_id is not null then
    select id into reupload_type from public.task_types where task_key = 'reupload_document';
    select coalesce(
      (select d.uploaded_by from public.documents d join public.users u on u.id = d.uploaded_by
        where d.id = new.document_id and u.role = 'client'),
      (select c.linked_user_id from public.filings f join public.clients c on c.id = f.client_id where f.id = new.filing_id),
      (select cu.user_id from public.client_users cu join public.users u on u.id = cu.user_id
        where cu.client_id = (select client_id from public.documents where id = new.document_id)
          and u.role = 'client' order by cu.user_id limit 1)
    ) into client_user;
    if reupload_type is null or client_user is null or exists (
      select 1 from public.tasks where document_id = new.document_id
        and task_type_id = reupload_type and status not in ('done', 'cancelled')
    ) then return new; end if;
    insert into public.tasks (
      firm_id, task_type_id, title, related_client_id, related_filing_id, document_id,
      assigned_to, created_by, priority, status, due_date, notes, source
    )
    select d.firm_id, reupload_type, 'Re-upload corrected file: ' || d.file_name,
      d.client_id, d.filing_id, d.id, client_user, new.reviewed_by, 'high', 'open',
      current_date + 2, new.rejection_reason, 'system'
    from public.documents d where d.id = new.document_id
    returning id into task_id;
    insert into public.task_audit (task_id, actor_id, action, details)
    values (task_id, new.reviewed_by, 'reupload_task_created', jsonb_build_object('document_id', new.document_id));
    insert into public.task_notifications (task_id, recipient_id, recipient_email, event_type, message)
    select task_id, u.id, u.email, 'assigned', 'A corrected file is required: ' || d.file_name
    from public.users u join public.documents d on d.id = new.document_id
    where u.id = client_user and u.email is not null;
  end if;
  return new;
end
$$;

drop trigger if exists trg_document_review_task on public.documents;
create trigger trg_document_review_task after insert on public.documents
  for each row execute function public.create_document_review_task();
drop trigger if exists trg_sync_document_review_task on public.filing_document_checklist;
create trigger trg_sync_document_review_task after update of status on public.filing_document_checklist
  for each row execute function public.sync_document_review_task();

revoke all on function public.can_create_task_type(uuid) from public, anon;
revoke all on function public.task_assignee_allowed(uuid, uuid, uuid) from public, anon;
revoke all on function public.task_can_access_client(uuid) from public, anon;
revoke all on function public.task_client_employee_options(uuid) from public, anon;
revoke all on function public.task_client_user_options(uuid) from public, anon;
revoke all on function public.task_assignee_workload(uuid, uuid, uuid) from public, anon;
revoke all on function public.create_assigned_task(uuid, text, uuid, uuid, uuid, uuid, text, date, text, boolean) from public, anon;
revoke all on function public.change_task_status(uuid, text, text) from public, anon;
revoke all on function public.change_task_priority(uuid, text) from public, anon;
revoke all on function public.reassign_task(uuid, uuid) from public, anon;
revoke all on function public.mark_task_notification_read(uuid) from public, anon;
revoke all on function public.queue_overdue_task_notifications() from public, anon;
revoke all on function public.create_document_review_task() from public, anon;
revoke all on function public.sync_document_review_task() from public, anon;
grant execute on function public.can_create_task_type(uuid) to authenticated;
grant execute on function public.task_assignee_allowed(uuid, uuid, uuid) to authenticated;
grant execute on function public.task_can_access_client(uuid) to authenticated;
grant execute on function public.task_client_employee_options(uuid) to authenticated;
grant execute on function public.task_client_user_options(uuid) to authenticated;
grant execute on function public.task_assignee_workload(uuid, uuid, uuid) to authenticated;
grant execute on function public.create_assigned_task(uuid, text, uuid, uuid, uuid, uuid, text, date, text, boolean) to authenticated;
grant execute on function public.change_task_status(uuid, text, text) to authenticated;
grant execute on function public.change_task_priority(uuid, text) to authenticated;
grant execute on function public.reassign_task(uuid, uuid) to authenticated;
grant execute on function public.mark_task_notification_read(uuid) to authenticated;
grant execute on function public.queue_overdue_task_notifications() to service_role;

commit;
