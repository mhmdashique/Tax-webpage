-- =====================================================================
-- 0025: client task progress (seen / client status / review / comments)
--
-- Adds per-client-task progress tracking + a user-facing event history,
-- with all writes gated through SECURITY DEFINER RPCs (there is still no
-- direct UPDATE policy on tasks — clients can only change status via
-- change_task_status and comment via add_task_comment).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Columns on tasks
-- ---------------------------------------------------------------------
alter table public.tasks
  add column if not exists seen_at timestamptz,
  add column if not exists seen_by uuid references public.users(id) on delete set null,
  add column if not exists client_status text not null default 'not_seen'
    check (client_status in ('not_seen', 'seen', 'in_progress', 'done_by_client', 'reviewed', 'cancelled')),
  add column if not exists reviewed_by uuid references public.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reopened_reason text,
  add column if not exists last_client_activity_at timestamptz;

-- Backfill client tasks from their current status.
update public.tasks
   set client_status = case
     when status = 'cancelled' then 'cancelled'
     when status = 'done' then 'done_by_client'
     when status = 'in_progress' then 'in_progress'
     else 'not_seen'
   end
 where task_for = 'client';

-- ---------------------------------------------------------------------
-- 2. task_events: user-facing history (staff details panel + client panel)
-- ---------------------------------------------------------------------
create table if not exists public.task_events (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  event      text not null check (event in (
    'created', 'seen', 'status_changed', 'commented',
    'reminder_sent', 'reopened', 'reviewed', 'reassigned'
  )),
  actor_id   uuid references public.users(id) on delete set null,
  details    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists task_events_task_idx on public.task_events (task_id, created_at desc);

alter table public.task_events enable row level security;

-- Visibility helper: can the caller see this task at all?
-- (Mirrors tasks_select_scoped; SECURITY DEFINER so the policy itself
-- never queries the table it protects.)
create or replace function public.task_can_see(p_task uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  t public.tasks%rowtype;
  r text;
begin
  if p_task is null or auth.uid() is null or not public.is_approved() then
    return false;
  end if;
  select * into t from public.tasks where id = p_task;
  if not found or t.firm_id is distinct from public.my_firm_id() then
    return false;
  end if;
  r := public.current_user_role();
  if r = 'admin' then
    return true;
  elsif r = 'employee' then
    return t.assigned_to = auth.uid()
        or t.follow_up_owner = auth.uid()
        or (t.related_client_id is not null and public.can_access_client(t.related_client_id));
  elsif r = 'client' then
    return t.task_for = 'client' and t.client_visible and t.assigned_to = auth.uid()
       and t.related_client_id is not null and public.can_access_client(t.related_client_id);
  end if;
  return false;
end $$;

drop policy if exists task_events_select on public.task_events;
create policy task_events_select on public.task_events for select to authenticated
  using (public.task_can_see(task_id));
-- No INSERT/UPDATE/DELETE policies: rows are written only by the RPCs below.

-- Emit a 'created' event for every task, whatever path created it.
create or replace function public.log_task_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.task_events (task_id, event, actor_id, details)
  values (new.id, 'created', new.created_by,
          jsonb_build_object('title', new.title, 'task_for', new.task_for));
  return new;
end $$;

drop trigger if exists trg_task_created_event on public.tasks;
create trigger trg_task_created_event
  after insert on public.tasks
  for each row execute function public.log_task_created();

-- Backfill 'created' events for pre-existing tasks.
insert into public.task_events (task_id, event, actor_id, details, created_at)
select t.id, 'created', t.created_by,
       jsonb_build_object('title', t.title, 'task_for', t.task_for),
       t.created_at
  from public.tasks t
 where not exists (select 1 from public.task_events e where e.task_id = t.id and e.event = 'created');

-- ---------------------------------------------------------------------
-- 3. Notification event types for review flow + comments/questions
-- ---------------------------------------------------------------------
alter table public.task_notifications drop constraint if exists task_notifications_event_type_check;
alter table public.task_notifications add constraint task_notifications_event_type_check
  check (event_type in ('assigned', 'reassigned', 'overdue', 'reminder', 'review_needed', 'comment', 'question'));
-- Dedupe only the singleton types; reminders/comments/questions may repeat.
drop index if exists public.task_notifications_deduplicate_idx;
create unique index task_notifications_deduplicate_idx
  on public.task_notifications (task_id, recipient_id, event_type)
  where event_type in ('assigned', 'reassigned', 'overdue');

-- Small helper: notify staff watchers (follow-up owner + creator, not actor).
-- Plain inserts: review/comment/question notifications may repeat by design;
-- the dedupe index only covers assigned/reassigned/overdue, and an
-- ON CONFLICT clause for other types would raise (no matching index).
create or replace function public.notify_task_watchers(
  p_task uuid, p_title text, p_event text, p_message text, p_actor uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.task_notifications (task_id, recipient_id, recipient_email, event_type, message)
  select p_task, u.id, u.email, p_event, p_message
    from public.tasks t
    join public.users u on u.id in (t.follow_up_owner, t.created_by)
   where t.id = p_task
     and u.id is not null and u.id <> coalesce(p_actor, '00000000-0000-0000-0000-000000000000')
     and u.email is not null;
end $$;

-- ---------------------------------------------------------------------
-- 4. change_task_status: maintain client progress + notify watchers
--    (overrides 0024; same signature, same client permission rules)
-- ---------------------------------------------------------------------
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
  elsif caller_role <> 'admin' and t.assigned_to <> auth.uid() and t.follow_up_owner <> auth.uid() then
    raise exception 'Only the assignee, the follow-up owner or an admin can update this task';
  end if;

  if p_status = 'cancelled' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'A cancellation reason is required';
  end if;

  update public.tasks set status = p_status,
    cancelled_reason = case when p_status = 'cancelled' then btrim(p_reason) else cancelled_reason end,
    completed_at = case when p_status = 'done' then now() else null end,
    seen_at = case when caller_role = 'client' and seen_at is null then now() else seen_at end,
    seen_by = case when caller_role = 'client' and seen_by is null then auth.uid() else seen_by end,
    client_status = case
      when task_for <> 'client' then client_status
      when p_status = 'cancelled' then 'cancelled'
      when p_status = 'done' and caller_role = 'client' then 'done_by_client'
      when p_status = 'done' then 'reviewed'
      when p_status = 'in_progress' then 'in_progress'
      else 'seen'
    end,
    reviewed_by = case when p_status = 'done' and caller_role <> 'client' then auth.uid() else reviewed_by end,
    reviewed_at = case when p_status = 'done' and caller_role <> 'client' then now() else reviewed_at end,
    reopened_reason = case when p_status = 'open' then null else reopened_reason end,
    last_client_activity_at = case when caller_role = 'client' then now() else last_client_activity_at end
  where id = p_task;

  insert into public.task_audit (task_id, actor_id, action, details)
  values (p_task, auth.uid(), 'status_changed', jsonb_build_object(
    'from', t.status, 'to', p_status, 'reason', nullif(btrim(p_reason), '')
  ));
  insert into public.task_events (task_id, event, actor_id, details)
  values (p_task, 'status_changed', auth.uid(), jsonb_build_object(
    'from', t.status, 'to', p_status, 'reason', nullif(btrim(p_reason), '')
  ));

  -- Client marked done -> follow-up owner + creator must review.
  if p_status = 'done' and caller_role = 'client' then
    perform public.notify_task_watchers(p_task, t.title, 'review_needed',
      'Done by client — review needed: ' || t.title, auth.uid());
  end if;
  -- Staff changed a client task -> tell the client.
  if t.task_for = 'client' and caller_role <> 'client' and t.assigned_to is not null then
    insert into public.task_notifications (task_id, recipient_id, recipient_email, event_type, message)
    select p_task, u.id, u.email, 'comment', 'Update on your task: ' || t.title
    from public.users u where u.id = t.assigned_to and u.email is not null;
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 5. mark_task_seen: first open by the client (idempotent)
-- ---------------------------------------------------------------------
create or replace function public.mark_task_seen(p_task uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.tasks%rowtype;
begin
  if not public.is_approved() then raise exception 'Approved users only'; end if;
  select * into t from public.tasks
  where id = p_task and firm_id = public.my_firm_id()
  for update;
  if not found then raise exception 'Task not found'; end if;
  if public.current_user_role() <> 'client' or t.task_for <> 'client'
     or not t.client_visible or t.assigned_to <> auth.uid() then
    raise exception 'Only the assigned client can mark this task seen';
  end if;
  if t.seen_at is not null then return; end if;
  update public.tasks
     set seen_at = now(), seen_by = auth.uid(),
         client_status = case when client_status = 'not_seen' then 'seen' else client_status end,
         last_client_activity_at = now()
   where id = p_task;
  insert into public.task_events (task_id, event, actor_id, details)
  values (p_task, 'seen', auth.uid(), jsonb_build_object('at', now()));
end
$$;

-- ---------------------------------------------------------------------
-- 6. add_task_comment: client <-> staff thread on one task
-- ---------------------------------------------------------------------
create or replace function public.add_task_comment(p_task uuid, p_comment text, p_kind text default 'comment')
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.tasks%rowtype;
  caller_role text := public.current_user_role();
begin
  if not public.is_approved() or coalesce(btrim(p_comment), '') = '' then
    raise exception 'A comment is required';
  end if;
  if p_kind not in ('comment', 'question') then p_kind := 'comment'; end if;
  select * into t from public.tasks
  where id = p_task and firm_id = public.my_firm_id()
  for update;
  if not found then raise exception 'Task not found'; end if;

  if caller_role = 'client' then
    if t.task_for <> 'client' or not t.client_visible or t.assigned_to <> auth.uid() then
      raise exception 'Clients can comment only on their own visible client tasks';
    end if;
    update public.tasks set last_client_activity_at = now() where id = p_task;
    perform public.notify_task_watchers(p_task, t.title, p_kind,
      (case when p_kind = 'question' then 'Client question on: ' else 'Client comment on: ' end) || t.title,
      auth.uid());
  else
    if not public.task_can_see(p_task) then raise exception 'Task not found'; end if;
    if t.assigned_to is not null then
      insert into public.task_notifications (task_id, recipient_id, recipient_email, event_type, message)
      select p_task, u.id, u.email, p_kind, 'New message about your task: ' || t.title
      from public.users u where u.id = t.assigned_to and u.email is not null;
    end if;
  end if;

  insert into public.task_events (task_id, event, actor_id, details)
  values (p_task, 'commented', auth.uid(), jsonb_build_object('kind', p_kind, 'body', btrim(p_comment)));
  insert into public.task_audit (task_id, actor_id, action, details)
  values (p_task, auth.uid(), 'commented', jsonb_build_object('kind', p_kind));
end
$$;

-- ---------------------------------------------------------------------
-- 7. review_task: staff closes (reviewed) or reopens a done client task
-- ---------------------------------------------------------------------
create or replace function public.review_task(p_task uuid, p_action text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.tasks%rowtype;
begin
  if not public.is_approved() then raise exception 'Approved users only'; end if;
  if p_action not in ('reviewed', 'reopen') then raise exception 'Invalid review action'; end if;
  select * into t from public.tasks
  where id = p_task and firm_id = public.my_firm_id() and task_for = 'client'
  for update;
  if not found then raise exception 'Client task not found'; end if;
  if public.current_user_role() <> 'admin' and t.follow_up_owner <> auth.uid() then
    raise exception 'Only the follow-up owner or an admin can review this task';
  end if;

  if p_action = 'reviewed' then
    if t.status <> 'done' then raise exception 'Only done tasks can be marked reviewed'; end if;
    update public.tasks
       set client_status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_task;
    insert into public.task_events (task_id, event, actor_id, details)
    values (p_task, 'reviewed', auth.uid(), jsonb_build_object('at', now()));
  else
    if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required when reopening'; end if;
    update public.tasks
       set status = 'open', client_status = 'seen', completed_at = null,
           reviewed_by = null, reviewed_at = null, reopened_reason = btrim(p_reason)
     where id = p_task;
    insert into public.task_events (task_id, event, actor_id, details)
    values (p_task, 'reopened', auth.uid(), jsonb_build_object('reason', btrim(p_reason)));
  end if;

  insert into public.task_audit (task_id, actor_id, action, details)
  values (p_task, auth.uid(), p_action, jsonb_build_object('reason', nullif(btrim(p_reason), '')));

  if t.assigned_to is not null then
    insert into public.task_notifications (task_id, recipient_id, recipient_email, event_type, message)
    select p_task, u.id, u.email,
           case when p_action = 'reviewed' then 'comment' else 'question' end,
           case when p_action = 'reviewed'
             then 'Your task was reviewed: ' || t.title
             else 'Your task was reopened: ' || t.title || ' — ' || btrim(p_reason) end
    from public.users u where u.id = t.assigned_to and u.email is not null;
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 8. update_task_details: staff edits due date / priority / notes (audited)
-- ---------------------------------------------------------------------
create or replace function public.update_task_details(
  p_task uuid, p_due_date date default null,
  p_priority text default null, p_notes text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  t public.tasks%rowtype;
  caller_role text := public.current_user_role();
  changes jsonb := '{}'::jsonb;
begin
  if not public.is_approved() then raise exception 'Approved users only'; end if;
  if p_priority is not null and p_priority not in ('low', 'normal', 'medium', 'high', 'urgent') then
    raise exception 'Invalid priority';
  end if;
  select * into t from public.tasks
  where id = p_task and firm_id = public.my_firm_id()
  for update;
  if not found then raise exception 'Task not found'; end if;
  if caller_role <> 'admin'
     and t.follow_up_owner <> auth.uid()
     and t.assigned_to <> auth.uid() then
    raise exception 'Only staff responsible for this task can edit it';
  end if;
  if caller_role = 'client' then raise exception 'Clients cannot edit task details'; end if;

  if p_due_date is not null and p_due_date is distinct from t.due_date then
    changes := changes || jsonb_build_object('due_date', jsonb_build_object('from', t.due_date, 'to', p_due_date));
  end if;
  if p_priority is not null and p_priority is distinct from t.priority then
    changes := changes || jsonb_build_object('priority', jsonb_build_object('from', t.priority, 'to', p_priority));
  end if;
  if p_notes is not null and p_notes is distinct from coalesce(t.notes, '') then
    changes := changes || jsonb_build_object('notes', true);
  end if;
  if changes = '{}'::jsonb then return; end if;

  update public.tasks
     set due_date = coalesce(p_due_date, due_date),
         priority = coalesce(p_priority, priority),
         notes = case when p_notes is not null then nullif(btrim(p_notes), '') else notes end
   where id = p_task;
  insert into public.task_audit (task_id, actor_id, action, details)
  values (p_task, auth.uid(), 'details_edited', changes);
  insert into public.task_events (task_id, event, actor_id, details)
  values (p_task, 'status_changed', auth.uid(), jsonb_build_object('details_edited', changes));
end
$$;

-- ---------------------------------------------------------------------
-- 9. task_dashboard_counts: role-scoped counts for every dashboard
-- ---------------------------------------------------------------------
create or replace function public.task_dashboard_counts()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r text := public.current_user_role();
  f uuid := public.my_firm_id();
  out jsonb;
begin
  if not public.is_approved() then
    return jsonb_build_object('role', r, 'open_tasks', 0, 'due_soon', 0,
      'overdue', 0, 'waiting_on_clients', 0, 'done_by_client', 0);
  end if;

  with scoped as (
    select *
      from public.tasks t
     where t.firm_id = f
       and (r = 'admin'
         or (r = 'employee' and (t.assigned_to = auth.uid() or t.follow_up_owner = auth.uid()
              or (t.related_client_id is not null and public.can_access_client(t.related_client_id))))
         or (r = 'client' and t.task_for = 'client' and t.client_visible and t.assigned_to = auth.uid()
              and t.related_client_id is not null and public.can_access_client(t.related_client_id))))
  select jsonb_build_object(
    'role', r,
    'open_tasks', count(*) filter (where status not in ('done', 'cancelled')),
    'due_soon', count(*) filter (where status not in ('done', 'cancelled')
      and due_date is not null and due_date <= current_date + 3 and due_date >= current_date),
    'overdue', count(*) filter (where status not in ('done', 'cancelled')
      and due_date is not null and due_date < current_date),
    'waiting_on_clients', count(*) filter (where task_for = 'client'
      and status not in ('done', 'cancelled')
      and (r = 'admin' or follow_up_owner = auth.uid())),
    'done_by_client', count(*) filter (where task_for = 'client'
      and client_status = 'done_by_client' and status <> 'cancelled'
      and (r = 'admin' or follow_up_owner = auth.uid() or assigned_to = auth.uid()))
  ) into out from scoped;
  return out;
end
$$;

-- ---------------------------------------------------------------------
-- 10. Grants + realtime
-- ---------------------------------------------------------------------
revoke all on function public.task_can_see(uuid) from public, anon;
revoke all on function public.mark_task_seen(uuid) from public, anon;
revoke all on function public.add_task_comment(uuid, text, text) from public, anon;
revoke all on function public.review_task(uuid, text, text) from public, anon;
revoke all on function public.update_task_details(uuid, date, text, text) from public, anon;
revoke all on function public.task_dashboard_counts() from public, anon;
revoke all on function public.notify_task_watchers(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.task_can_see(uuid) to authenticated;
grant execute on function public.mark_task_seen(uuid) to authenticated;
grant execute on function public.add_task_comment(uuid, text, text) to authenticated;
grant execute on function public.review_task(uuid, text, text) to authenticated;
grant execute on function public.update_task_details(uuid, date, text, text) to authenticated;
grant execute on function public.task_dashboard_counts() to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.task_events;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null;
end $$;

commit;
