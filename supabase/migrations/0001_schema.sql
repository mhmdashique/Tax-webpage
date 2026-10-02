-- TaxDesk FilePilot OS — core schema + RLS
-- Run with: supabase db push

create extension if not exists "pgcrypto";

-- Firms
create table if not exists firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  address text,
  registration_number text,
  timezone text default 'UTC',
  default_currency text default 'USD',
  plan_tier text default 'pro',
  created_at timestamptz default now()
);

-- Users (extends auth.users via id FK, managed in app)
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  firm_id uuid references firms(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null check (role in ('admin','employee','client')),
  avatar_url text,
  phone text,
  created_at timestamptz default now()
);

-- Clients
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid references firms(id) on delete cascade,
  assigned_employee_id uuid references users(id) on delete set null,
  linked_user_id uuid references users(id) on delete set null,
  name text not null,
  email text not null,
  business_name text,
  entity_type text,
  tax_id text,
  status text default 'active',
  verified boolean default false,
  created_at timestamptz default now()
);

-- Filings
create table if not exists filings (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid references firms(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  tax_type text not null,
  period text not null,
  due_date date not null,
  status text default 'pending',
  amount_owed numeric default 0,
  amount_refund numeric default 0,
  filed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists tax_rule_templates (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid references firms(id) on delete cascade,
  jurisdiction text not null,
  name text not null,
  recurrence_rule text not null,
  auto_generate boolean default false,
  created_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid references firms(id) on delete cascade,
  assigned_to uuid references users(id) on delete set null,
  related_client_id uuid references clients(id) on delete set null,
  related_filing_id uuid references filings(id) on delete set null,
  title text not null,
  status text default 'todo',
  priority text default 'medium',
  due_date date,
  created_at timestamptz default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid references firms(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  filing_id uuid references filings(id) on delete set null,
  uploaded_by uuid references users(id) on delete set null,
  file_url text not null,
  file_name text not null,
  shared_with_client boolean default true,
  created_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid references firms(id) on delete cascade,
  thread_id uuid default gen_random_uuid(),
  sender_id uuid references users(id) on delete set null,
  recipient_id uuid references users(id) on delete set null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid references firms(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  invoice_number text not null,
  amount numeric not null,
  status text default 'pending',
  due_date date not null,
  paid_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists signatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,
  typed_name text,
  signature_image_url text,
  signed_at timestamptz default now()
);

create table if not exists notifications_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade unique,
  email_overdue boolean default true,
  inapp_bell boolean default true,
  sms_critical boolean default false,
  digest_frequency text default 'weekly'
);

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid references firms(id) on delete cascade,
  actor_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  created_at timestamptz default now()
);

create table if not exists escalations (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid references firms(id) on delete cascade,
  raised_by uuid references users(id) on delete set null,
  related_client_id uuid references clients(id) on delete set null,
  note text not null,
  status text default 'open',
  created_at timestamptz default now()
);

-- Helper: current user's firm + role
create or replace function public.my_firm_id() returns uuid language sql stable as $$
  select firm_id from public.users where id = auth.uid()
$$;
create or replace function public.my_role() returns text language sql stable as $$
  select role from public.users where id = auth.uid()
$$;

-- Enable RLS everywhere
alter table firms enable row level security;
alter table users enable row level security;
alter table clients enable row level security;
alter table filings enable row level security;
alter table tax_rule_templates enable row level security;
alter table tasks enable row level security;
alter table documents enable row level security;
alter table messages enable row level security;
alter table payments enable row level security;
alter table signatures enable row level security;
alter table notifications_settings enable row level security;
alter table activity_log enable row level security;
alter table escalations enable row level security;

-- Policies: admin = full firm access; employee = assigned + own; client = own linked rows
-- Firms: members of firm can read; admins can update
drop policy if exists "firm read own" on firms;
create policy "firm read own" on firms for select using (id = public.my_firm_id());
drop policy if exists "firm admin write" on firms;
create policy "firm admin write" on firms for all using (id = public.my_firm_id() and public.my_role() = 'admin') with check (id = public.my_firm_id());

-- Users: firm members read firm users; admins manage
drop policy if exists "users firm read" on users;
create policy "users firm read" on users for select using (firm_id = public.my_firm_id());
drop policy if exists "users admin write" on users;
create policy "users admin write" on users for all using (firm_id = public.my_firm_id() and public.my_role() = 'admin') with check (firm_id = public.my_firm_id());

-- Clients
drop policy if exists "clients admin all" on clients;
create policy "clients admin all" on clients for all using (firm_id = public.my_firm_id() and public.my_role() = 'admin') with check (firm_id = public.my_firm_id());
drop policy if exists "clients employee assigned" on clients;
create policy "clients employee assigned" on clients for select using (firm_id = public.my_firm_id() and public.my_role() = 'employee' and (assigned_employee_id = auth.uid()));
drop policy if exists "clients own" on clients;
create policy "clients own" on clients for select using (linked_user_id = auth.uid());

-- Filings: admin all; employee via assigned clients; client via own client record
drop policy if exists "filings admin all" on filings;
create policy "filings admin all" on filings for all using (firm_id = public.my_firm_id() and public.my_role() = 'admin') with check (firm_id = public.my_firm_id());
drop policy if exists "filings employee assigned" on filings;
create policy "filings employee assigned" on filings for select using (
  firm_id = public.my_firm_id() and public.my_role() = 'employee'
  and client_id in (select id from clients where assigned_employee_id = auth.uid())
);
drop policy if exists "filings client own" on filings;
create policy "filings client own" on filings for select using (
  client_id in (select id from clients where linked_user_id = auth.uid())
);

-- Tasks
drop policy if exists "tasks admin all" on tasks;
create policy "tasks admin all" on tasks for all using (firm_id = public.my_firm_id() and public.my_role() = 'admin') with check (firm_id = public.my_firm_id());
drop policy if exists "tasks employee own" on tasks;
create policy "tasks employee own" on tasks for all using (firm_id = public.my_firm_id() and assigned_to = auth.uid()) with check (firm_id = public.my_firm_id());

-- Documents
drop policy if exists "docs admin all" on documents;
create policy "docs admin all" on documents for all using (firm_id = public.my_firm_id() and public.my_role() = 'admin') with check (firm_id = public.my_firm_id());
drop policy if exists "docs employee assigned" on documents;
create policy "docs employee assigned" on documents for select using (
  firm_id = public.my_firm_id() and client_id in (select id from clients where assigned_employee_id = auth.uid())
);
drop policy if exists "docs client shared" on documents;
create policy "docs client shared" on documents for select using (
  shared_with_client = true and client_id in (select id from clients where linked_user_id = auth.uid())
);

-- Messages: participants only within firm
drop policy if exists "messages participants" on messages;
create policy "messages participants" on messages for all using (
  firm_id = public.my_firm_id() and (sender_id = auth.uid() or recipient_id = auth.uid())
) with check (firm_id = public.my_firm_id() and sender_id = auth.uid());

-- Payments
drop policy if exists "payments admin all" on payments;
create policy "payments admin all" on payments for all using (firm_id = public.my_firm_id() and public.my_role() = 'admin') with check (firm_id = public.my_firm_id());
drop policy if exists "payments client own" on payments;
create policy "payments client own" on payments for select using (client_id in (select id from clients where linked_user_id = auth.uid()));

-- Signatures: owner + admin read
drop policy if exists "signatures owner" on signatures;
create policy "signatures owner" on signatures for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "signatures admin read" on signatures;
create policy "signatures admin read" on signatures for select using (public.my_role() = 'admin');

-- Notifications settings: owner only
drop policy if exists "notif owner" on notifications_settings;
create policy "notif owner" on notifications_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Activity: firm read, system write via service role (allow insert for members)
drop policy if exists "activity firm read" on activity_log;
create policy "activity firm read" on activity_log for select using (firm_id = public.my_firm_id());
drop policy if exists "activity member insert" on activity_log;
create policy "activity member insert" on activity_log for insert with check (firm_id = public.my_firm_id());

-- Escalations
drop policy if exists "escalations firm" on escalations;
create policy "escalations firm" on escalations for all using (firm_id = public.my_firm_id()) with check (firm_id = public.my_firm_id());

-- Storage buckets (create via dashboard or SQL API; RLS enforced with storage policies)
insert into storage.buckets (id, name, public) values ('documents','documents', false), ('signatures','signatures', false), ('avatars','avatars', true)
on conflict (id) do nothing;
