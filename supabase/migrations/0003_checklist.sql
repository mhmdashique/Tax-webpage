-- 0003: country-aware required-documents checklist (data, not code).
-- Adds global taxonomy + per-filing checklist instances. Non-destructive:
-- only CREATEs new tables and ADDs nullable columns; no drops/rewrites.
--
-- Resolution rule (implemented in app + seeds):
--   universal rows (document_requirements.jurisdiction_id IS NULL)
--   + jurisdiction-specific rows, where a jurisdiction row with the same
--   `code` overrides the universal one for that (jurisdiction, tax_type).

-- ============ jurisdictions (ISO 3166-1 alpha-2) ============
create table if not exists jurisdictions (
  id uuid primary key default gen_random_uuid(),
  iso_code text not null unique check (iso_code = upper(iso_code) and char_length(iso_code) = 2),
  name text not null,
  default_currency text,
  region text,
  parent_id uuid references jurisdictions(id) on delete set null,
  is_active boolean default true,
  created_at timestamptz default now()
);
create index if not exists idx_jurisdictions_parent on jurisdictions(parent_id);
create index if not exists idx_jurisdictions_iso on jurisdictions(iso_code);

-- ============ tax_types (global taxonomy, jurisdiction-independent) ============
create table if not exists tax_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  created_at timestamptz default now()
);

-- ============ jurisdiction_tax_types (local name + form per country) ============
create table if not exists jurisdiction_tax_types (
  id uuid primary key default gen_random_uuid(),
  jurisdiction_id uuid not null references jurisdictions(id) on delete cascade,
  tax_type_id uuid not null references tax_types(id) on delete cascade,
  local_name text not null,
  local_form_code text,
  filing_frequency text check (filing_frequency in ('monthly', 'quarterly', 'annual', 'event_based')),
  verified boolean default false,
  source_url text,
  last_verified_at timestamptz,
  created_at timestamptz default now(),
  unique (jurisdiction_id, tax_type_id)
);
create index if not exists idx_jtt_jurisdiction on jurisdiction_tax_types(jurisdiction_id);
create index if not exists idx_jtt_tax_type on jurisdiction_tax_types(tax_type_id);

-- ============ document_requirements (universal + country overrides) ============
create table if not exists document_requirements (
  id uuid primary key default gen_random_uuid(),
  tax_type_id uuid references tax_types(id) on delete cascade,
  jurisdiction_id uuid references jurisdictions(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  category text not null default 'filing' check (category in ('onboarding', 'filing')),
  is_mandatory boolean default true,
  sort_order int default 0,
  verified boolean default false,
  source_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- Upsert key is (jurisdiction, tax_type, code). NULL jurisdictions never
-- compare equal in a plain UNIQUE, so enforce with two partial indexes:
create unique index if not exists uq_docreq_universal
  on document_requirements (tax_type_id, code)
  where jurisdiction_id is null;
create unique index if not exists uq_docreq_jurisdiction
  on document_requirements (jurisdiction_id, tax_type_id, code)
  where jurisdiction_id is not null;
create index if not exists idx_docreq_tax_type on document_requirements(tax_type_id);
create index if not exists idx_docreq_jurisdiction on document_requirements(jurisdiction_id);
create index if not exists idx_docreq_category on document_requirements(category);

-- ============ filing_document_checklist (instance per filing) ============
create table if not exists filing_document_checklist (
  id uuid primary key default gen_random_uuid(),
  filing_id uuid not null references filings(id) on delete cascade,
  document_requirement_id uuid references document_requirements(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'uploaded', 'received', 'rejected', 'waived')),
  document_id uuid references documents(id) on delete set null,
  rejection_reason text,
  reviewed_by uuid references users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (filing_id, document_requirement_id)
);
create index if not exists idx_fdc_filing on filing_document_checklist(filing_id);
create index if not exists idx_fdc_requirement on filing_document_checklist(document_requirement_id);
create index if not exists idx_fdc_status on filing_document_checklist(status);
create index if not exists idx_fdc_document on filing_document_checklist(document_id);

-- ============ link filings + tax_rule_templates to taxonomy ============
alter table filings
  add column if not exists jurisdiction_id uuid references jurisdictions(id) on delete set null,
  add column if not exists tax_type_id uuid references tax_types(id) on delete set null;
create index if not exists idx_filings_jurisdiction on filings(jurisdiction_id);
create index if not exists idx_filings_tax_type on filings(tax_type_id);

alter table tax_rule_templates
  add column if not exists jurisdiction_id uuid references jurisdictions(id) on delete set null,
  add column if not exists tax_type_id uuid references tax_types(id) on delete set null;
create index if not exists idx_trt_jurisdiction on tax_rule_templates(jurisdiction_id);
create index if not exists idx_trt_tax_type on tax_rule_templates(tax_type_id);
-- NOTE: legacy tax_rule_templates.jurisdiction TEXT column is kept for
-- backwards compatibility; new code should prefer jurisdiction_id.

-- ============ RLS ============
alter table jurisdictions enable row level security;
alter table tax_types enable row level security;
alter table jurisdiction_tax_types enable row level security;
alter table document_requirements enable row level security;
alter table filing_document_checklist enable row level security;

-- Reference tables: global read for any authenticated user, writes admin-only.
-- (No firm_id on these tables by design — content is shared, edited via admin/import.)
drop policy if exists "jurisdictions read all" on jurisdictions;
create policy "jurisdictions read all" on jurisdictions
  for select using (auth.role() = 'authenticated');
drop policy if exists "jurisdictions admin write" on jurisdictions;
create policy "jurisdictions admin write" on jurisdictions
  for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists "tax_types read all" on tax_types;
create policy "tax_types read all" on tax_types
  for select using (auth.role() = 'authenticated');
drop policy if exists "tax_types admin write" on tax_types;
create policy "tax_types admin write" on tax_types
  for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists "jtt read all" on jurisdiction_tax_types;
create policy "jtt read all" on jurisdiction_tax_types
  for select using (auth.role() = 'authenticated');
drop policy if exists "jtt admin write" on jurisdiction_tax_types;
create policy "jtt admin write" on jurisdiction_tax_types
  for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists "docreq read all" on document_requirements;
create policy "docreq read all" on document_requirements
  for select using (auth.role() = 'authenticated');
drop policy if exists "docreq admin write" on document_requirements;
create policy "docreq admin write" on document_requirements
  for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- Checklist instances: scoped through the parent filing -> client.
-- admin: all rows in own firm; employee: filings of assigned clients;
-- client: own filings only. Follows the filings/documents policy pattern.
drop policy if exists "fdc admin all" on filing_document_checklist;
create policy "fdc admin all" on filing_document_checklist for all using (
  exists (
    select 1 from filings f
    where f.id = filing_document_checklist.filing_id
      and f.firm_id = public.my_firm_id()
      and public.my_role() = 'admin'
  )
) with check (
  exists (
    select 1 from filings f
    where f.id = filing_document_checklist.filing_id
      and f.firm_id = public.my_firm_id()
  )
);

drop policy if exists "fdc employee assigned" on filing_document_checklist;
create policy "fdc employee assigned" on filing_document_checklist for select using (
  public.my_role() = 'employee'
  and exists (
    select 1 from filings f
    join clients c on c.id = f.client_id
    where f.id = filing_document_checklist.filing_id
      and f.firm_id = public.my_firm_id()
      and c.assigned_employee_id = auth.uid()
  )
);

-- Employees review (receive/reject/waive) items for their assigned clients.
drop policy if exists "fdc employee review" on filing_document_checklist;
create policy "fdc employee review" on filing_document_checklist for update using (
  public.my_role() = 'employee'
  and exists (
    select 1 from filings f
    join clients c on c.id = f.client_id
    where f.id = filing_document_checklist.filing_id
      and f.firm_id = public.my_firm_id()
      and c.assigned_employee_id = auth.uid()
  )
) with check (
  exists (
    select 1 from filings f
    join clients c on c.id = f.client_id
    where f.id = filing_document_checklist.filing_id
      and f.firm_id = public.my_firm_id()
  )
);

drop policy if exists "fdc client own" on filing_document_checklist;
create policy "fdc client own" on filing_document_checklist for select using (
  exists (
    select 1 from filings f
    join clients c on c.id = f.client_id
    where f.id = filing_document_checklist.filing_id
      and c.linked_user_id = auth.uid()
  )
);

-- Clients upload against items (sets status/document_id); review fields are
-- enforced app-side (Phase 3) and remain writable only via service role/RPC.
drop policy if exists "fdc client upload" on filing_document_checklist;
create policy "fdc client upload" on filing_document_checklist for update using (
  exists (
    select 1 from filings f
    join clients c on c.id = f.client_id
    where f.id = filing_document_checklist.filing_id
      and c.linked_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from filings f
    join clients c on c.id = f.client_id
    where f.id = filing_document_checklist.filing_id
      and c.linked_user_id = auth.uid()
  )
);

-- Fix flagged in Phase 0: tax_rule_templates had RLS enabled with zero
-- policies (all access denied). Firm-scoped like other firm tables.
drop policy if exists "trt admin all" on tax_rule_templates;
create policy "trt admin all" on tax_rule_templates for all using (
  firm_id = public.my_firm_id() and public.my_role() = 'admin'
) with check (firm_id = public.my_firm_id());
drop policy if exists "trt member read" on tax_rule_templates;
create policy "trt member read" on tax_rule_templates for select using (
  firm_id = public.my_firm_id()
);
