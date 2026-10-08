-- Attribute old anonymous document-upload audit rows to the person who uploaded.
-- Chain 1 (staff uploads): activity.entity_id -> documents.uploaded_by -> users.
-- Chain 2 (client uploads): activity.entity_id -> documents.client_id
--          -> clients.linked_user_id -> users.
-- Idempotent: only touches rows that are still anonymous and not yet suffixed.

-- Guard against older environments where 0031 has not yet added the column.
alter table public.activity_log add column if not exists actor_name text;

-- Chain 1: uploader recorded on the document row.
update public.activity_log a
set actor_id = d.uploaded_by,
    actor_name = u.name,
    action = a.action || ' by ' || u.name
from public.documents d
join public.users u on u.id = d.uploaded_by
where a.entity_type = 'document'
  and a.entity_id = d.id
  and (a.actor_name is null or a.actor_name = '')
  and a.action not like '% by %'
  and u.name is not null
  and u.name <> '';

-- Chain 2: fall back to the owning client's linked login.
update public.activity_log a
set actor_id = c.linked_user_id,
    actor_name = u.name,
    action = a.action || ' by ' || u.name
from public.documents d
join public.clients c on c.id = d.client_id
join public.users u on u.id = c.linked_user_id
where a.entity_type = 'document'
  and a.entity_id = d.id
  and (a.actor_name is null or a.actor_name = '')
  and a.action not like '% by %'
  and u.name is not null
  and u.name <> '';
