-- TaxDesk: Admin approval system
-- Adds approval_status to users, helper function, RLS updates, and approval view.

-- 1. Enum
do $$ begin
  create type approval_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- 2. Add columns to users
alter table public.users
  add column if not exists approval_status approval_status not null default 'pending',
  add column if not exists requested_role  text,
  add column if not exists approved_by     uuid references public.users(id) on delete set null,
  add column if not exists approved_at     timestamptz,
  add column if not exists rejected_reason text,
  add column if not exists reviewed_at     timestamptz;

-- 3. Backfill: existing users and admins are already approved
update public.users set approval_status = 'approved' where approval_status = 'pending';

-- 4. New sign-ups: employees and clients default to pending (admins stay approved)
-- Enforced via trigger below.

-- 5. Helper: is the current user approved?
create or replace function public.is_approved() returns boolean language sql stable as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and approval_status = 'approved'
  )
$$;

-- 6. Trigger: auto-set approval_status on insert
--    admin role => approved immediately; employee/client => pending
create or replace function public.set_approval_on_insert() returns trigger language plpgsql as $$
begin
  if new.role = 'admin' then
    new.approval_status := 'approved';
  else
    if new.approval_status is null then
      new.approval_status := 'pending';
    end if;
  end if;
  new.requested_role := new.role;
  return new;
end;
$$;

drop trigger if exists trg_set_approval on public.users;
create trigger trg_set_approval
  before insert on public.users
  for each row execute function public.set_approval_on_insert();

-- 7. Prevent users from changing their own approval fields
create or replace function public.guard_approval_fields() returns trigger language plpgsql as $$
begin
  -- Only service role (null uid) or admins may change approval fields
  if auth.uid() is not null and (
    select role from public.users where id = auth.uid()
  ) != 'admin' then
    new.approval_status := old.approval_status;
    new.approved_by     := old.approved_by;
    new.approved_at     := old.approved_at;
    new.rejected_reason := old.rejected_reason;
    new.reviewed_at     := old.reviewed_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_approval on public.users;
create trigger trg_guard_approval
  before update on public.users
  for each row execute function public.guard_approval_fields();

-- 8. Update RLS policies to require is_approved() for all data tables
--    (users table is handled separately — pending users can read their own row)

-- Users: pending users can read only their own row
drop policy if exists "users firm read" on users;
create policy "users firm read" on users for select using (
  (firm_id = public.my_firm_id() and public.is_approved())
  or id = auth.uid()  -- pending users can see their own row for status check
);
drop policy if exists "users admin write" on users;
create policy "users admin write" on users for all using (
  firm_id = public.my_firm_id() and public.my_role() = 'admin' and public.is_approved()
) with check (firm_id = public.my_firm_id());

-- Clients
drop policy if exists "clients admin all" on clients;
create policy "clients admin all" on clients for all using (
  firm_id = public.my_firm_id() and public.my_role() = 'admin' and public.is_approved()
) with check (firm_id = public.my_firm_id());
drop policy if exists "clients employee assigned" on clients;
create policy "clients employee assigned" on clients for select using (
  firm_id = public.my_firm_id() and public.my_role() = 'employee'
  and public.is_approved() and assigned_employee_id = auth.uid()
);
drop policy if exists "clients own" on clients;
create policy "clients own" on clients for select using (
  linked_user_id = auth.uid() and public.is_approved()
);

-- Filings
drop policy if exists "filings admin all" on filings;
create policy "filings admin all" on filings for all using (
  firm_id = public.my_firm_id() and public.my_role() = 'admin' and public.is_approved()
) with check (firm_id = public.my_firm_id());
drop policy if exists "filings employee assigned" on filings;
create policy "filings employee assigned" on filings for select using (
  firm_id = public.my_firm_id() and public.my_role() = 'employee' and public.is_approved()
  and client_id in (select id from clients where assigned_employee_id = auth.uid())
);
drop policy if exists "filings client own" on filings;
create policy "filings client own" on filings for select using (
  public.is_approved()
  and client_id in (select id from clients where linked_user_id = auth.uid())
);

-- Tasks
drop policy if exists "tasks admin all" on tasks;
create policy "tasks admin all" on tasks for all using (
  firm_id = public.my_firm_id() and public.my_role() = 'admin' and public.is_approved()
) with check (firm_id = public.my_firm_id());
drop policy if exists "tasks employee own" on tasks;
create policy "tasks employee own" on tasks for all using (
  firm_id = public.my_firm_id() and assigned_to = auth.uid() and public.is_approved()
) with check (firm_id = public.my_firm_id());

-- Documents
drop policy if exists "docs admin all" on documents;
create policy "docs admin all" on documents for all using (
  firm_id = public.my_firm_id() and public.my_role() = 'admin' and public.is_approved()
) with check (firm_id = public.my_firm_id());
drop policy if exists "docs employee assigned" on documents;
create policy "docs employee assigned" on documents for select using (
  firm_id = public.my_firm_id() and public.is_approved()
  and client_id in (select id from clients where assigned_employee_id = auth.uid())
);
drop policy if exists "docs client shared" on documents;
create policy "docs client shared" on documents for select using (
  shared_with_client = true and public.is_approved()
  and client_id in (select id from clients where linked_user_id = auth.uid())
);

-- Messages
drop policy if exists "messages participants" on messages;
create policy "messages participants" on messages for all using (
  firm_id = public.my_firm_id() and public.is_approved()
  and (sender_id = auth.uid() or recipient_id = auth.uid())
) with check (firm_id = public.my_firm_id() and sender_id = auth.uid());

-- Payments
drop policy if exists "payments admin all" on payments;
create policy "payments admin all" on payments for all using (
  firm_id = public.my_firm_id() and public.my_role() = 'admin' and public.is_approved()
) with check (firm_id = public.my_firm_id());
drop policy if exists "payments client own" on payments;
create policy "payments client own" on payments for select using (
  public.is_approved()
  and client_id in (select id from clients where linked_user_id = auth.uid())
);

-- Activity log
drop policy if exists "activity firm read" on activity_log;
create policy "activity firm read" on activity_log for select using (
  firm_id = public.my_firm_id() and public.is_approved()
);
drop policy if exists "activity member insert" on activity_log;
create policy "activity member insert" on activity_log for insert with check (
  firm_id = public.my_firm_id() and public.is_approved()
);

-- Escalations
drop policy if exists "escalations firm" on escalations;
create policy "escalations firm" on escalations for all using (
  firm_id = public.my_firm_id() and public.is_approved()
) with check (firm_id = public.my_firm_id());

-- 9. Approval requests view for admins
-- Must DROP first: CREATE OR REPLACE VIEW cannot remove or reorder columns.
drop view if exists public.approval_requests cascade;
create view public.approval_requests as
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
    u.created_at
  from public.users u;

-- Enable realtime on users so pending count updates live
alter publication supabase_realtime add table public.users;
