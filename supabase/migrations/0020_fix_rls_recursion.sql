-- Fix infinite recursion in RLS policies by using SECURITY DEFINER functions

create or replace function public.my_firm_id() returns uuid 
language sql security definer set search_path = public stable as $$
  select firm_id from public.users where id = auth.uid()
$$;

create or replace function public.my_role() returns text 
language sql security definer set search_path = public stable as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean 
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  )
$$;

create or replace function public.is_employee() returns boolean 
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'employee'
  )
$$;

create or replace function public.is_client() returns boolean 
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'client'
  )
$$;

create or replace function public.is_approved() returns boolean 
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and (approval_status = 'approved' or role = 'admin')
  )
$$;

create or replace function public.my_client_ids() returns setof uuid 
language sql security definer set search_path = public stable as $$
  select id from public.clients where linked_user_id = auth.uid()
$$;

-- Replace recursive users policy
drop policy if exists "Admins can view all users" on public.users;
create policy "Admins can view all users" on public.users
  for select using (id = auth.uid() or public.is_admin());

-- Replace recursive clients policy
drop policy if exists "clients own" on public.clients;
create policy "clients own" on public.clients
  for select using (
    linked_user_id = auth.uid() or public.is_admin() or public.is_employee()
  );

-- Replace recursive documents policy
drop policy if exists "Users see own client docs" on public.documents;
create policy "Users see own client docs" on public.documents
  for select using (
    client_id in (select public.my_client_ids()) or public.is_admin() or public.is_employee()
  );

-- Ensure insert policy is present for documents
drop policy if exists "Users insert own client docs" on public.documents;
create policy "Users insert own client docs" on public.documents
  for insert with check (
    client_id in (select public.my_client_ids()) or public.is_admin() or public.is_employee()
  );
