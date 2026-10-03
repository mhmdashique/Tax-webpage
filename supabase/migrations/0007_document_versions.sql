-- 0007: client document versioning + editable metadata (non-destructive).
-- Only CREATEs a new table and ADDs nullable columns; no drops/rewrites,
-- no deletion of existing rows or Storage objects.
--
-- Model:
--   documents row = logical document (current pointer: file_name/file_url/
--   storage_path/version_no/notes reflect the LATEST version).
--   document_versions row = immutable snapshot per upload (v1, v2, ...).
-- Replace flow: upload new Storage object -> insert versions row (N+1) ->
-- update documents pointer. History is never updated or deleted by clients.

begin;

-- Editable metadata on the logical document (all nullable/backfill-safe).
alter table public.documents
  add column if not exists notes text,
  add column if not exists version_no int not null default 1;

-- Immutable per-upload snapshots.
create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_no int not null,
  file_name text not null,
  file_url text not null,
  storage_path text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version_no)
);
create index if not exists document_versions_doc_idx on public.document_versions (document_id, version_no);

-- Backfill v1 snapshots for pre-0007 documents (idempotent).
insert into public.document_versions (document_id, version_no, file_name, file_url, storage_path, uploaded_by, created_at)
select d.id, 1, d.file_name, d.file_url, d.storage_path, d.uploaded_by, d.created_at
from public.documents d
where not exists (select 1 from public.document_versions v where v.document_id = d.id)
on conflict (document_id, version_no) do nothing;

-- Server stamps uploader (service role / migrations bypass: auth.uid() null).
create or replace function public.guard_version_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.uploaded_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_version_insert on public.document_versions;
create trigger trg_guard_version_insert
  before insert on public.document_versions
  for each row execute function public.guard_version_insert();

alter table public.document_versions enable row level security;

-- Read: anyone who can access the parent document's client.
drop policy if exists versions_select on public.document_versions;
create policy versions_select on public.document_versions for select to authenticated
  using (exists (
    select 1 from public.documents d
    where d.id = document_versions.document_id
      and public.can_access_client(d.client_id)
  ));

-- Append: uploader must access the parent client; version_no monotonicity and
-- documents-pointer updates are enforced app-side + via documents_update RLS.
drop policy if exists versions_insert on public.document_versions;
create policy versions_insert on public.document_versions for insert to authenticated
  with check (exists (
    select 1 from public.documents d
    where d.id = document_versions.document_id
      and public.can_access_client(d.client_id)
  ));

-- No update/delete policies for clients/employees: history is immutable.
-- Admins clean up only via service role (e.g. orphaned objects after a failed
-- DB insert), never historical versions of live documents.
drop policy if exists versions_delete_admin on public.document_versions;
create policy versions_delete_admin on public.document_versions for delete to authenticated
  using (public.is_admin());

commit;
