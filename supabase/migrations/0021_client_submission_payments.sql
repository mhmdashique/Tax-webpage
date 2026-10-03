-- 0021_client_submission_payments.sql
-- Run with: supabase db push

-- 1. Client Settings
create table if not exists client_settings (
  client_id uuid primary key references clients(id) on delete cascade,
  sales_gst_mode text default 'deduct', -- 'deduct', 'inclusive', 'add_on_top'
  purchase_gst_mode text default 'use_file', -- 'use_file', 'recompute', 'inclusive'
  gst_mismatch_tolerance numeric default 1.00,
  out_of_period_action text default 'flag', -- 'flag', 'exclude', 'move'
  default_gst_rate numeric default 18,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table client_settings enable row level security;
create policy "Users see own client settings" on client_settings for select using (
  client_id in (select public.my_client_ids()) or public.is_admin() or public.is_employee()
);
create policy "Admins and Employees update client settings" on client_settings for update using (
  public.is_admin() or public.is_employee()
);

-- 2. Filing Periods
create table if not exists filing_periods (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  month integer not null check (month >= 1 and month <= 12),
  year integer not null,
  financial_year text not null,
  status text default 'open',
  created_at timestamptz default now(),
  unique(client_id, month, year)
);

alter table filing_periods enable row level security;
create policy "Users see own filing periods" on filing_periods for select using (
  client_id in (select public.my_client_ids()) or public.is_admin() or public.is_employee()
);
create policy "Users manage own filing periods" on filing_periods for all using (
  client_id in (select public.my_client_ids()) or public.is_admin() or public.is_employee()
);

-- 3. Invoices (Sales)
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  period_id uuid references filing_periods(id) on delete set null,
  invoice_no text not null,
  invoice_date date not null,
  customer_name text not null,
  gst_rate numeric not null,
  gst_mode text not null,
  taxable_value numeric not null,
  gst_amount numeric not null,
  total numeric not null,
  amount_paid numeric default 0,
  balance_due numeric not null,
  status text default 'unpaid',
  created_at timestamptz default now()
);

alter table invoices enable row level security;
create policy "Users see own invoices" on invoices for select using (
  client_id in (select public.my_client_ids()) or public.is_admin() or public.is_employee()
);
create policy "Users manage own invoices" on invoices for all using (
  client_id in (select public.my_client_ids()) or public.is_admin() or public.is_employee()
);

-- 4. Invoice Items
create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade,
  description text not null,
  qty numeric not null,
  rate numeric not null,
  amount numeric not null,
  created_at timestamptz default now()
);

alter table invoice_items enable row level security;
create policy "Users see own invoice items" on invoice_items for select using (
  invoice_id in (select id from invoices where client_id in (select public.my_client_ids())) or public.is_admin() or public.is_employee()
);
create policy "Users manage own invoice items" on invoice_items for all using (
  invoice_id in (select id from invoices where client_id in (select public.my_client_ids())) or public.is_admin() or public.is_employee()
);

-- 5. Purchase Invoices
create table if not exists purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  period_id uuid references filing_periods(id) on delete set null,
  supplier_name text not null,
  supplier_gstin text,
  invoice_no text not null,
  invoice_date date not null,
  taxable_value numeric not null,
  gst_rate numeric not null,
  gst_amount numeric not null,
  total numeric not null,
  itc_eligible boolean default false,
  validation_flags text[],
  created_at timestamptz default now()
);

alter table purchase_invoices enable row level security;
create policy "Users see own purchase invoices" on purchase_invoices for select using (
  client_id in (select public.my_client_ids()) or public.is_admin() or public.is_employee()
);
create policy "Users manage own purchase invoices" on purchase_invoices for all using (
  client_id in (select public.my_client_ids()) or public.is_admin() or public.is_employee()
);

-- 6. Payments
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete set null, -- Null for tax payments
  amount numeric not null,
  paid_on date not null,
  method text not null,
  reference_no text,
  proof_path text,
  created_at timestamptz default now()
);

alter table payments enable row level security;
create policy "Users see own payments" on payments for select using (
  client_id in (select public.my_client_ids()) or public.is_admin() or public.is_employee()
);
create policy "Users manage own payments" on payments for all using (
  client_id in (select public.my_client_ids()) or public.is_admin() or public.is_employee()
);

-- 7. Audit Log (Extension of existing or new specialized one)
create table if not exists audit_log_v2 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz default now()
);

alter table audit_log_v2 enable row level security;
create policy "Admins see all audit logs" on audit_log_v2 for select using (public.is_admin());
create policy "System inserts audit logs" on audit_log_v2 for insert with check (true); -- Can be tightened

-- Ensure Storage bucket exists (assuming 'documents' bucket)
-- Policies for storage
-- (Note: Storage policies are often handled in the dashboard or via API, but here is a representation)
-- create policy "Client folder access" on storage.objects for all using (
--   bucket_id = 'documents' and (
--     (select auth.uid()) = owner
--     or (storage.foldername(name))[1] in (select id::text from public.clients where linked_user_id = auth.uid())
--   )
-- );
