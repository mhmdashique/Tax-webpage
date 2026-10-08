-- Backfill proper actor names + readable actions on old anonymous audit rows.
-- New writes already include actor_id/actor_name; this repairs history so the
-- audit trail shows who did what instead of "Someone".

-- 0. The name column never shipped with the base schema — add it first.
--    (Without this, every actor_name write is rejected and reads show "Someone".)
alter table public.activity_log add column if not exists actor_name text;

-- 1. Names: resolve actor_id -> users.name where the row has no name yet.
update public.activity_log a
set actor_name = u.name
from public.users u
where a.actor_name is null
  and a.actor_id is not null
  and a.actor_id = u.id
  and u.name is not null
  and u.name <> '';

-- 2. Legacy terse actions -> the same readable sentences new writes use.
update public.activity_log a
set action = 'approved ' || coalesce(t.email, 'a user') || ' by ' || coalesce(a.actor_name, 'an admin')
from public.users t
where a.action = 'approved_user'
  and a.entity_type = 'user'
  and a.entity_id = t.id;

update public.activity_log a
set action = 'rejected ' || coalesce(t.email, 'a user') || ' by ' || coalesce(a.actor_name, 'an admin')
from public.users t
where a.action = 'rejected_user'
  and a.entity_type = 'user'
  and a.entity_id = t.id;

update public.activity_log
set action = 'synced the signup queue'
where action = 'synced_signups';
