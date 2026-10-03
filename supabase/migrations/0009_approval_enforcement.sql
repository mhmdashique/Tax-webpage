-- =====================================================================
-- 0009: close the approval-enforcement gaps left by 0008.
--
-- Background: migration 0004 replaced the 0001 policies on
-- clients / filings / documents (plus checklist, notes, audit, storage)
-- with new policies (clients_select, filings_select, documents_select, ...)
-- that route through the helper functions is_admin() / is_staff() /
-- can_access_client(). Migration 0008 dropped/recreated only the OLD 0001
-- policy names, so the 0004 policies were left WITHOUT any approval gate.
--
-- This migration gates approval at the HELPER level (single choke point)
-- and adds explicit is_approved() checks to every remaining table whose
-- policies still bypass it (firms, signatures, notifications_settings).
-- Tables whose 0008 policies already gate reads / updates are also checked
-- below: their WITH CHECK clauses must gate inserts independently.
--
-- Net effect: pending / rejected users can read ONLY their own public.users
-- row (for the status screens) and NOTHING else. All writes are denied.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. is_approved() — canonical check (recreated idempotently; 0008 may
--    already have created it). SECURITY DEFINER so RLS cannot block it,
--    revoked from anon, granted to authenticated.
-- ---------------------------------------------------------------------
create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and approval_status = 'approved'
  )
$$;

revoke all on function public.is_approved() from public, anon;
grant execute on function public.is_approved() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Gate the 0004 helpers on approval.
--    Every 0004 data policy routes through one of these, so this single
--    change enforces approval on: clients, filings, documents, checklist
--    (read + all RPC writes), document_notes, audit_log, client_users,
--    client_assignments, app_settings, and the documents storage bucket.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role() = 'admin', false)
     and public.is_approved()
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role() in ('employee','admin'), false)
     and public.is_approved()
$$;

create or replace function public.can_access_client(p_client uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  r text;
begin
  if p_client is null or auth.uid() is null then
    return false;
  end if;

  -- Hard gate: pending / rejected users see no client data at all.
  if not public.is_approved() then
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

-- ---------------------------------------------------------------------
-- 3. Tables whose policies bypass the helpers above: add explicit gates.
-- ---------------------------------------------------------------------

-- Firms: members could read their firm row while pending. Require approval.
drop policy if exists "firm read own" on public.firms;
create policy "firm read own" on public.firms for select using (
  id = public.my_firm_id() and public.is_approved()
);
drop policy if exists "firm admin write" on public.firms;
create policy "firm admin write" on public.firms for all using (
  id = public.my_firm_id() and public.my_role() = 'admin' and public.is_approved()
) with check (id = public.my_firm_id() and public.is_approved());

-- Signatures: owner policy had no approval gate. Pending users must see nothing.
drop policy if exists "signatures owner" on public.signatures;
create policy "signatures owner" on public.signatures for all using (
  user_id = auth.uid() and public.is_approved()
) with check (user_id = auth.uid() and public.is_approved());
drop policy if exists "signatures admin read" on public.signatures;
create policy "signatures admin read" on public.signatures for select using (
  public.my_role() = 'admin' and public.is_approved()
);

-- Notifications settings: owner-only table, add the approval gate.
drop policy if exists "notif owner" on public.notifications_settings;
create policy "notif owner" on public.notifications_settings for all using (
  user_id = auth.uid() and public.is_approved()
) with check (user_id = auth.uid() and public.is_approved());

-- Approval must be enforced by WITH CHECK as well as USING: INSERT policies
-- evaluate WITH CHECK only, so an approval check in USING is not sufficient.
alter policy "users admin write" on public.users
  with check (firm_id = public.my_firm_id() and public.is_approved());
alter policy "clients admin all" on public.clients
  with check (firm_id = public.my_firm_id() and public.is_approved());
alter policy "filings admin all" on public.filings
  with check (firm_id = public.my_firm_id() and public.is_approved());
alter policy "tasks admin all" on public.tasks
  with check (firm_id = public.my_firm_id() and public.is_approved());
alter policy "tasks employee own" on public.tasks
  with check (firm_id = public.my_firm_id() and public.is_approved());
alter policy "docs admin all" on public.documents
  with check (firm_id = public.my_firm_id() and public.is_approved());
alter policy "messages participants" on public.messages
  with check (
    firm_id = public.my_firm_id()
    and sender_id = auth.uid()
    and public.is_approved()
  );
alter policy "payments admin all" on public.payments
  with check (firm_id = public.my_firm_id() and public.is_approved());
alter policy "escalations firm" on public.escalations
  with check (firm_id = public.my_firm_id() and public.is_approved());
alter policy client_users_select on public.client_users
  using (
    public.is_approved()
    and (user_id = auth.uid() or public.is_admin())
  );
alter policy assignments_select on public.client_assignments
  using (
    public.is_approved()
    and (employee_id = auth.uid() or public.is_admin())
  );

-- 0003 reference-table policies also predate the approval gate. Keep their
-- authenticated-read/admin-write behavior for approved users only.
alter policy "jurisdictions read all" on public.jurisdictions
  using (auth.role() = 'authenticated' and public.is_approved());
alter policy "jurisdictions admin write" on public.jurisdictions
  using (public.my_role() = 'admin' and public.is_approved())
  with check (public.my_role() = 'admin' and public.is_approved());
alter policy "tax_types read all" on public.tax_types
  using (auth.role() = 'authenticated' and public.is_approved());
alter policy "tax_types admin write" on public.tax_types
  using (public.my_role() = 'admin' and public.is_approved())
  with check (public.my_role() = 'admin' and public.is_approved());
alter policy "jtt read all" on public.jurisdiction_tax_types
  using (auth.role() = 'authenticated' and public.is_approved());
alter policy "jtt admin write" on public.jurisdiction_tax_types
  using (public.my_role() = 'admin' and public.is_approved())
  with check (public.my_role() = 'admin' and public.is_approved());
alter policy "docreq read all" on public.document_requirements
  using (auth.role() = 'authenticated' and public.is_approved());
alter policy "docreq admin write" on public.document_requirements
  using (public.my_role() = 'admin' and public.is_approved())
  with check (public.my_role() = 'admin' and public.is_approved());
alter policy "trt admin all" on public.tax_rule_templates
  using (
    firm_id = public.my_firm_id()
    and public.my_role() = 'admin'
    and public.is_approved()
  )
  with check (firm_id = public.my_firm_id() and public.is_approved());
alter policy "trt member read" on public.tax_rule_templates
  using (firm_id = public.my_firm_id() and public.is_approved());

-- 0004's client-owned delete branch did not pass through a gated helper.
drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated
  using (
    public.is_admin()
    or (
      uploaded_by = auth.uid()
      and public.current_user_role() = 'client'
      and public.can_access_client(client_id)
      and not exists (
        select 1 from public.filing_document_checklist c
        where c.document_id = documents.id and c.status = 'received'
      )
    )
  );

-- This SECURITY DEFINER status helper is callable directly, so scope its
-- result to approved users who can access the filing's client.
create or replace function public.filing_can_advance(p_filing uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.can_access_client((
      select f.client_id from public.filings f where f.id = p_filing
    ))
    and not exists (
      select 1
      from public.filing_document_checklist c
      join public.document_requirements r on r.id = c.document_requirement_id
      where c.filing_id = p_filing
        and r.is_mandatory
        and c.status not in ('received','waived')
    ),
    false
  )
$$;

-- ---------------------------------------------------------------------
-- 4. Harden the approval-field guard: SECURITY DEFINER so its admin lookup
--    cannot be foiled by RLS, and freeze role/requested_role/firm_id for
--    non-admins as well (0005 only blocks SELF role changes; non-admins
--    have no users UPDATE policy at all, this trigger is the second layer).
-- ---------------------------------------------------------------------
create or replace function public.guard_approval_fields()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  caller_role text;
begin
  if auth.uid() is null then
    return new; -- service role / migrations: allow
  end if;

  select role into caller_role from public.users where id = auth.uid();

  if caller_role is distinct from 'admin' then
    new.approval_status := old.approval_status;
    new.approved_by     := old.approved_by;
    new.approved_at     := old.approved_at;
    new.rejected_reason := old.rejected_reason;
    new.reviewed_at     := old.reviewed_at;
    new.requested_role  := old.requested_role;
    new.role            := old.role;
    new.firm_id         := old.firm_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_approval on public.users;

create trigger trg_guard_approval
  before update on public.users
  for each row execute function public.guard_approval_fields();

-- ---------------------------------------------------------------------
-- 5. Backfill safety (idempotent): admins always approved; anyone without
--    a requested_role inherits their current role; columns from 0008 are
--    expected to exist (this migration runs after 0008).
-- ---------------------------------------------------------------------
update public.users set approval_status = 'approved'
 where role = 'admin' and approval_status is distinct from 'approved';

update public.users set requested_role = role
 where requested_role is null;

-- ---------------------------------------------------------------------
-- 6. approval_requests view: add firm_id so admins can scope to their firm
--    (the API filters by firm_id via the service role).
-- ---------------------------------------------------------------------
create or replace view public.approval_requests as
  select
    u.id,
    u.name        as full_name,
    u.email,
    u.requested_role,
    u.approval_status as status,
    u.rejected_reason,
    u.approved_by,
    u.approved_at,
    u.reviewed_at,
    u.created_at,
    u.role,
    u.firm_id
  from public.users u;

-- The view is intended for the service-role admin API only. Its owner would
-- otherwise bypass users-table RLS when authenticated clients query it.
revoke all on public.approval_requests from public, anon, authenticated;
grant select on public.approval_requests to service_role;

-- ---------------------------------------------------------------------
-- 7. Realtime for the pending-count badge (idempotent).
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.users;
exception when duplicate_object then null;
end $$;
