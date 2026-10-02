-- =====================================================================
-- 0004: role-based access (client / employee / admin)
-- RLS + Storage policies + review RPCs + audit log
--
-- ADAPTED to this repo's schema (see Phase 0 report):
--   roles live in public.users(id -> auth.users, firm_id, role), NOT
--   public.profiles. current_user_role() reads public.users.
--   assignment previously: clients.assigned_employee_id + clients.linked_user_id.
--   This migration KEEPS those columns (back-compat) and ADDS
--   client_users + client_assignments; can_access_client() honors both.
--   documents gains: storage_path, checklist_item_id, uploaded_by_role,
--   reviewed_by, reviewed_at, is_new_for_staff (uploaded_by/firm scoping kept).
--   Legacy permissive policies from 0001/0003 on the touched tables are
--   dropped and replaced (same names would otherwise UNION and widen access).
--   Storage object path convention going forward: {client_id}/{filing_id}/{file}
--
-- Run in a transaction on a branch/staging DB first.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Supporting tables + new document columns
-- ---------------------------------------------------------------------

-- Which auth users belong to which client company (many users per client).
-- Coexists with legacy clients.linked_user_id (still honored, see below).
create table if not exists public.client_users (
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  primary key (client_id, user_id)
);

-- Which employee handles which client.
-- Coexists with legacy clients.assigned_employee_id (still honored).
create table if not exists public.client_assignments (
  client_id   uuid not null references public.clients(id) on delete cascade,
  employee_id uuid not null references auth.users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (client_id, employee_id)
);

-- Single-row settings table (admin toggle: widen employee visibility)
create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  employees_can_view_all_clients boolean not null default false
);
insert into public.app_settings (id) values (true) on conflict do nothing;

-- Staff-only notes on a document (clients get NO policy = no access)
create table if not exists public.document_notes (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  author_id   uuid not null default auth.uid() references auth.users(id),
  note        text not null,
  created_at  timestamptz not null default now()
);

-- Document-scoped audit log (firm-wide activity_log from 0001 is kept as-is)
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,  -- uploaded | viewed | downloaded | received | rejected | waived | deleted | reassigned
  document_id uuid,
  client_id   uuid,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_client_idx on public.audit_log (client_id, created_at desc);

create index if not exists client_users_user_idx on public.client_users (user_id);
create index if not exists client_assignments_emp_idx on public.client_assignments (employee_id);
create index if not exists documents_client_idx on public.documents (client_id);

-- New server-managed columns on documents (all nullable/backfilled-safe)
alter table public.documents
  add column if not exists storage_path text,
  add column if not exists checklist_item_id uuid references public.filing_document_checklist(id) on delete set null,
  add column if not exists uploaded_by_role text,
  add column if not exists reviewed_by uuid references public.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists is_new_for_staff boolean not null default true;
create index if not exists documents_checklist_idx on public.documents (checklist_item_id);
create index if not exists documents_new_for_staff_idx on public.documents (is_new_for_staff);

-- ---------------------------------------------------------------------
-- 2. Helper functions (SECURITY DEFINER so they bypass RLS on lookup
--    tables and avoid recursive policies)
-- ---------------------------------------------------------------------

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role() in ('employee','admin'), false)
$$;

-- New assignment table OR legacy clients.assigned_employee_id column
create or replace function public.is_assigned(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.client_assignments
    where client_id = p_client and employee_id = auth.uid()
  ) or exists (
    select 1 from public.clients
    where id = p_client and assigned_employee_id = auth.uid()
  )
$$;

-- New membership table OR legacy clients.linked_user_id column
create or replace function public.is_client_member(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.client_users
    where client_id = p_client and user_id = auth.uid()
  ) or exists (
    select 1 from public.clients
    where id = p_client and linked_user_id = auth.uid()
  )
$$;

-- Single source of truth for "can this user see this client's data?"
-- Firm-scoped (matches 0001): cross-firm rows are never visible, even to admins.
create or replace function public.can_access_client(p_client uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  r text;
begin
  if p_client is null or auth.uid() is null then
    return false;
  end if;

  -- Firm boundary first
  if not exists (
    select 1 from public.clients
    where id = p_client and firm_id = public.my_firm_id()
  ) then
    return false;
  end if;

  r := public.current_user_role();

  if r = 'admin' then
    return true;
  elsif r = 'employee' then
    return public.is_assigned(p_client)
        or coalesce((select employees_can_view_all_clients from public.app_settings limit 1), false);
  elsif r = 'client' then
    return public.is_client_member(p_client);
  end if;

  return false;
end $$;

-- Safe parse of the client id from a storage path "{client_id}/..."
create or replace function public.path_client_id(p_name text)
returns uuid language plpgsql immutable as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;

-- Writes audit rows (callable only from other SECURITY DEFINER code / service role)
create or replace function public.log_event(p_action text, p_doc uuid, p_client uuid, p_detail jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, action, document_id, client_id, detail)
  values (auth.uid(), p_action, p_doc, p_client, p_detail)
$$;

-- Lock down function execution: no anonymous access
revoke all on function public.current_user_role()  from public, anon;
revoke all on function public.is_admin()           from public, anon;
revoke all on function public.is_staff()           from public, anon;
revoke all on function public.is_assigned(uuid)    from public, anon;
revoke all on function public.is_client_member(uuid) from public, anon;
revoke all on function public.can_access_client(uuid) from public, anon;
revoke all on function public.log_event(text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.current_user_role()  to authenticated;
grant execute on function public.is_admin()           to authenticated;
grant execute on function public.is_staff()           to authenticated;
grant execute on function public.is_assigned(uuid)    to authenticated;
grant execute on function public.is_client_member(uuid) to authenticated;
grant execute on function public.can_access_client(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Enable RLS everywhere new
-- ---------------------------------------------------------------------
alter table public.client_users              enable row level security;
alter table public.client_assignments        enable row level security;
alter table public.app_settings              enable row level security;
alter table public.document_notes            enable row level security;
alter table public.audit_log                 enable row level security;

-- ---------------------------------------------------------------------
-- 4. Policies (legacy same-table policies from 0001/0003 are dropped
--    first so they cannot UNION with these and widen access)
-- ---------------------------------------------------------------------

-- clients: replace "clients admin all" / "clients employee assigned" / "clients own"
drop policy if exists "clients admin all" on public.clients;
drop policy if exists "clients employee assigned" on public.clients;
drop policy if exists "clients own" on public.clients;
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated
  using (public.can_access_client(id));

drop policy if exists clients_write_admin on public.clients;
create policy clients_write_admin on public.clients for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- client_users / client_assignments / app_settings
drop policy if exists client_users_select on public.client_users;
create policy client_users_select on public.client_users for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists client_users_admin on public.client_users;
create policy client_users_admin on public.client_users for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists assignments_select on public.client_assignments;
create policy assignments_select on public.client_assignments for select to authenticated
  using (employee_id = auth.uid() or public.is_admin());

drop policy if exists assignments_admin on public.client_assignments;
create policy assignments_admin on public.client_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists settings_select on public.app_settings;
create policy settings_select on public.app_settings for select to authenticated
  using (public.is_staff());

drop policy if exists settings_update on public.app_settings;
create policy settings_update on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- filings: replace "filings admin all" / "filings employee assigned" / "filings client own"
drop policy if exists "filings admin all" on public.filings;
drop policy if exists "filings employee assigned" on public.filings;
drop policy if exists "filings client own" on public.filings;
drop policy if exists filings_select on public.filings;
create policy filings_select on public.filings for select to authenticated
  using (public.can_access_client(client_id));

drop policy if exists filings_insert on public.filings;
create policy filings_insert on public.filings for insert to authenticated
  with check (public.can_access_client(client_id));

drop policy if exists filings_update_staff on public.filings;
create policy filings_update_staff on public.filings for update to authenticated
  using (public.is_staff() and public.can_access_client(client_id))
  with check (public.is_staff() and public.can_access_client(client_id));

-- admin delete preserved (0001 granted admin ALL incl. delete; no delete
-- policy would otherwise remove it)
drop policy if exists filings_delete_admin on public.filings;
create policy filings_delete_admin on public.filings for delete to authenticated
  using (public.is_admin() and public.can_access_client(client_id));

-- documents: replace "docs admin all" / "docs employee assigned" / "docs client shared"
drop policy if exists "docs admin all" on public.documents;
drop policy if exists "docs employee assigned" on public.documents;
drop policy if exists "docs client shared" on public.documents;
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (public.can_access_client(client_id));

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (public.can_access_client(client_id));

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update to authenticated
  using (
    public.is_staff() and public.can_access_client(client_id)
    or (uploaded_by = auth.uid() and public.can_access_client(client_id))
  )
  with check (public.can_access_client(client_id));

-- delete: admin anything; client only their own file, and only if not yet accepted
drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated
  using (
    public.is_admin()
    or (
      uploaded_by = auth.uid()
      and public.current_user_role() = 'client'
      and not exists (
        select 1 from public.filing_document_checklist c
        where c.document_id = documents.id and c.status = 'received'
      )
    )
  );

-- checklist: read-only through RLS; ALL writes go through the RPCs below.
-- Replaces "fdc admin all" / "fdc employee assigned" / "fdc employee review"
-- / "fdc client own" / "fdc client upload" (direct writes now denied by default).
drop policy if exists "fdc admin all" on public.filing_document_checklist;
drop policy if exists "fdc employee assigned" on public.filing_document_checklist;
drop policy if exists "fdc employee review" on public.filing_document_checklist;
drop policy if exists "fdc client own" on public.filing_document_checklist;
drop policy if exists "fdc client upload" on public.filing_document_checklist;
drop policy if exists checklist_select on public.filing_document_checklist;
create policy checklist_select on public.filing_document_checklist for select to authenticated
  using (exists (
    select 1 from public.filings f
    where f.id = filing_document_checklist.filing_id
      and public.can_access_client(f.client_id)
  ));

-- internal notes: staff only, scoped to accessible clients (no client policy = denied)
drop policy if exists notes_select on public.document_notes;
create policy notes_select on public.document_notes for select to authenticated
  using (public.is_staff() and exists (
    select 1 from public.documents d
    where d.id = document_notes.document_id and public.can_access_client(d.client_id)
  ));

drop policy if exists notes_insert on public.document_notes;
create policy notes_insert on public.document_notes for insert to authenticated
  with check (public.is_staff() and author_id = auth.uid() and exists (
    select 1 from public.documents d
    where d.id = document_notes.document_id and public.can_access_client(d.client_id)
  ));

-- audit log: admin read only; inserts happen via log_event()
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- 5. Trigger: stop clients tampering with server-controlled columns
-- ---------------------------------------------------------------------
create or replace function public.guard_document_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r text;
begin
  -- service role / migrations (no JWT user): allow
  if auth.uid() is null then
    return new;
  end if;

  r := public.current_user_role();

  if tg_op = 'INSERT' then
    new.uploaded_by      := auth.uid();
    new.uploaded_by_role := r;
    new.reviewed_by      := null;
    new.reviewed_at      := null;
    new.is_new_for_staff := (r = 'client');
    return new;
  end if;

  -- UPDATE
  if new.client_id is distinct from old.client_id
     or new.uploaded_by is distinct from old.uploaded_by
     or new.uploaded_by_role is distinct from old.uploaded_by_role then
    raise exception 'Immutable document fields cannot be changed';
  end if;

  if r = 'client' then
    if new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'Clients cannot change review fields';
    end if;
    -- a client replacing a file re-flags it for staff
    new.is_new_for_staff := true;
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_document_write on public.documents;
create trigger trg_guard_document_write
  before insert or update on public.documents
  for each row execute function public.guard_document_write();

-- Audit uploads and deletes automatically
create or replace function public.audit_document_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event('uploaded', new.id, new.client_id, jsonb_build_object('file', new.file_name));
    return new;
  elsif tg_op = 'DELETE' then
    perform public.log_event('deleted', old.id, old.client_id, jsonb_build_object('file', old.file_name));
    return old;
  end if;
  return null;
end $$;

drop trigger if exists trg_audit_document_change on public.documents;
create trigger trg_audit_document_change
  after insert or delete on public.documents
  for each row execute function public.audit_document_change();

-- ---------------------------------------------------------------------
-- 6. RPCs (the only way to change checklist state)
-- ---------------------------------------------------------------------

-- Client or staff: attach an uploaded document to a checklist item
create or replace function public.link_upload_to_checklist(p_item uuid, p_document uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_client_item uuid;
  v_client_doc  uuid;
  v_status      text;
begin
  select f.client_id, c.status into v_client_item, v_status
  from public.filing_document_checklist c
  join public.filings f on f.id = c.filing_id
  where c.id = p_item;

  select client_id into v_client_doc from public.documents where id = p_document;

  if v_client_item is null or v_client_doc is null or v_client_item <> v_client_doc then
    raise exception 'Document and checklist item do not belong to the same client';
  end if;

  if not public.can_access_client(v_client_item) then
    raise exception 'Not allowed';
  end if;

  if v_status = 'received' and not public.is_staff() then
    raise exception 'Item already accepted';
  end if;

  update public.filing_document_checklist
     set status = 'uploaded',
         document_id = p_document,
         rejection_reason = null,
         reviewed_by = null,
         reviewed_at = null
   where id = p_item;
end $$;

-- Staff: received | rejected | waived | pending
create or replace function public.review_checklist_item(p_item uuid, p_action text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_client uuid;
  v_doc    uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff only';
  end if;

  if p_action not in ('received','rejected','waived','pending') then
    raise exception 'Invalid action %', p_action;
  end if;

  if p_action = 'rejected' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required when rejecting';
  end if;

  select f.client_id, c.document_id into v_client, v_doc
  from public.filing_document_checklist c
  join public.filings f on f.id = c.filing_id
  where c.id = p_item;

  if v_client is null or not public.can_access_client(v_client) then
    raise exception 'Not allowed';
  end if;

  update public.filing_document_checklist
     set status = p_action,
         rejection_reason = case when p_action = 'rejected' then p_reason else null end,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_item;

  if v_doc is not null then
    update public.documents
       set reviewed_by = auth.uid(), reviewed_at = now(), is_new_for_staff = false
     where id = v_doc;
  end if;

  perform public.log_event(p_action, v_doc, v_client, jsonb_build_object('item', p_item, 'reason', p_reason));
end $$;

-- Staff: clear the "New" flag and log that the file was opened
create or replace function public.mark_document_seen(p_document uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_client uuid;
begin
  if not public.is_staff() then
    return;
  end if;

  select client_id into v_client from public.documents where id = p_document;
  if v_client is null or not public.can_access_client(v_client) then
    raise exception 'Not allowed';
  end if;

  update public.documents set is_new_for_staff = false where id = p_document;
  perform public.log_event('viewed', p_document, v_client);
end $$;

-- Call right before creating a signed download URL so downloads are audited
create or replace function public.log_document_download(p_document uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_client uuid;
begin
  select client_id into v_client from public.documents where id = p_document;
  if v_client is null or not public.can_access_client(v_client) then
    raise exception 'Not allowed';
  end if;
  perform public.log_event('downloaded', p_document, v_client);
end $$;

-- Status gate helper: call from filing-transition logic (Phase 4 wiring).
-- True when no mandatory requirement is still outstanding.
create or replace function public.filing_can_advance(p_filing uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1
    from public.filing_document_checklist c
    join public.document_requirements r on r.id = c.document_requirement_id
    where c.filing_id = p_filing
      and r.is_mandatory
      and c.status not in ('received','waived')
  )
$$;

revoke all on function public.link_upload_to_checklist(uuid, uuid)         from public, anon;
revoke all on function public.review_checklist_item(uuid, text, text)       from public, anon;
revoke all on function public.mark_document_seen(uuid)                      from public, anon;
revoke all on function public.log_document_download(uuid)                   from public, anon;
revoke all on function public.filing_can_advance(uuid)                      from public, anon;
grant execute on function public.link_upload_to_checklist(uuid, uuid)       to authenticated;
grant execute on function public.review_checklist_item(uuid, text, text)    to authenticated;
grant execute on function public.mark_document_seen(uuid)                   to authenticated;
grant execute on function public.log_document_download(uuid)                to authenticated;
grant execute on function public.filing_can_advance(uuid)                   to authenticated;

-- ---------------------------------------------------------------------
-- 7. Storage: private bucket + object policies
--    Path convention going forward: {client_id}/{filing_id}/{uuid}-{filename}
--    (Current app code uploads flat paths + public URLs; Phase 2 switches
--    uploads to this convention and signed URLs. Old flat-path objects have
--    path_client_id() = NULL -> denied by these policies, which is intended:
--    re-upload under the new convention.)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update set public = false;

drop policy if exists documents_storage_select on storage.objects;
create policy documents_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.can_access_client(public.path_client_id(name)));

drop policy if exists documents_storage_insert on storage.objects;
create policy documents_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.can_access_client(public.path_client_id(name)));

-- staff may overwrite/replace; clients upload new objects instead of updating.
-- NOTE: uploader-identity is enforced at the documents TABLE layer
-- (guard_document_write + documents_update/delete policies), not here, so this
-- stays independent of storage.objects owner/owner_id column naming across
-- Supabase versions.
drop policy if exists documents_storage_update on storage.objects;
create policy documents_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'documents' and public.is_staff() and public.can_access_client(public.path_client_id(name)))
  with check (bucket_id = 'documents' and public.is_staff() and public.can_access_client(public.path_client_id(name)));

-- delete: admin anything; otherwise scoped clients, with "accepted" guard living
-- in the table policy (storage has no visibility into checklist status).
drop policy if exists documents_storage_delete on storage.objects;
create policy documents_storage_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and public.can_access_client(public.path_client_id(name))
    and (public.is_admin() or public.current_user_role() = 'client')
  );

-- ---------------------------------------------------------------------
-- 8. Realtime (RLS is applied to postgres_changes for SELECT-able rows)
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.documents;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.filing_document_checklist;
exception when duplicate_object then null;
end $$;

commit;

-- =====================================================================
-- VERIFICATION SCRIPT (run separately, in staging, with real user UUIDs)
-- Replace the placeholders, then run each block and compare to "expect".
-- =====================================================================
/*
-- Impersonate a user inside the SQL editor:
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<CLIENT_A_USER_UUID>","role":"authenticated"}', true);

select count(*) from public.documents;                 -- expect: only Client A's documents
select count(*) from public.documents
  where client_id = '<CLIENT_B_UUID>';                 -- expect: 0
select count(*) from public.document_notes;           -- expect: 0 (clients never see notes)
select count(*) from public.audit_log;                -- expect: 0
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<EMPLOYEE_UUID>","role":"authenticated"}', true);

select distinct client_id from public.documents;      -- expect: only assigned clients (or all if setting is on)
delete from public.documents where true;             -- expect: 0 rows deleted (employees cannot delete)
select public.review_checklist_item('<ITEM_UUID>', 'rejected', null); -- expect: error "A reason is required"
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<ADMIN_UUID>","role":"authenticated"}', true);

select count(*) from public.documents;                -- expect: all documents
select count(*) from public.audit_log;                -- expect: all audit rows
rollback;
*/
