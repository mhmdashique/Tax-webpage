-- Seed Verified India Taxes and Documents (Universal so they show for any State)

-- 1. Ensure India and Indian States exist
insert into public.jurisdictions (iso_code, name, region)
values ('IN', 'India', 'Asia')
on conflict (iso_code) do update set is_active = true;

-- Ensure the constraint is relaxed to allow state codes
alter table public.jurisdictions drop constraint if exists jurisdictions_iso_code_check;
alter table public.jurisdictions add constraint jurisdictions_iso_code_check check (iso_code = upper(iso_code));

-- 2. Define the core tax types globally
insert into public.tax_types (code, name, description)
values
  ('GST-M', 'GST Return (Monthly)', 'GSTR-1 and GSTR-3B'),
  ('GST-Q', 'GST Return (Quarterly / QRMP)', 'Quarterly Return Monthly Payment'),
  ('GST-A', 'GST Annual Return', 'GSTR-9 and GSTR-9C'),
  ('ITR-IND', 'Income Tax Return - Individual / HUF', 'Salary, pension, investments, non-business'),
  ('ITR-BUS', 'Income Tax Return - Business', 'Business / Profession (individual or firm)'),
  ('ITR-CO', 'Income Tax Return - Company / LLP', 'Corporate Income Tax'),
  ('TDS', 'TDS Return (Quarterly)', 'Tax Deducted at Source'),
  ('ADV-TAX', 'Advance Tax', 'Quarterly advance tax installments')
on conflict (code) do nothing;

-- 3. Link them to India (IN) as VERIFIED
DO $$
DECLARE
  v_in_id uuid; 
  v_gstm uuid; v_gstq uuid; v_gsta uuid; 
  v_itri uuid; v_itrb uuid; v_itrc uuid; 
  v_tds uuid; v_adv uuid;
BEGIN
  select id into v_in_id from public.jurisdictions where iso_code = 'IN';

  select id into v_gstm from public.tax_types where code = 'GST-M';
  select id into v_gstq from public.tax_types where code = 'GST-Q';
  select id into v_gsta from public.tax_types where code = 'GST-A';
  select id into v_itri from public.tax_types where code = 'ITR-IND';
  select id into v_itrb from public.tax_types where code = 'ITR-BUS';
  select id into v_itrc from public.tax_types where code = 'ITR-CO';
  select id into v_tds from public.tax_types where code = 'TDS';
  select id into v_adv from public.tax_types where code = 'ADV-TAX';

  -- Delete any old unverified junk data for India
  delete from public.jurisdiction_tax_types where jurisdiction_id = v_in_id;

  -- Insert verified mappings
  insert into public.jurisdiction_tax_types (jurisdiction_id, tax_type_id, local_name, filing_frequency, verified)
  values 
    (v_in_id, v_gstm, 'GST Return (Monthly)', 'monthly', true),
    (v_in_id, v_gstq, 'GST Return (Quarterly / QRMP)', 'quarterly', true),
    (v_in_id, v_gsta, 'GST Annual Return', 'annual', true),
    (v_in_id, v_itri, 'Income Tax Return - Individual / HUF', 'annual', true),
    (v_in_id, v_itrb, 'Income Tax Return - Business / Profession', 'annual', true),
    (v_in_id, v_itrc, 'Income Tax Return - Company / LLP', 'annual', true),
    (v_in_id, v_tds, 'TDS Return (Quarterly)', 'quarterly', true),
    (v_in_id, v_adv, 'Advance Tax', 'quarterly', true)
  on conflict (jurisdiction_id, tax_type_id) do update set verified = true, local_name = excluded.local_name;

  -- 4. Document Requirements
  -- We set jurisdiction_id to NULL so these requirements appear even if the user selects a specific State like Kerala
  
  -- Delete old requirements for these tax types to avoid duplicates
  delete from public.document_requirements where tax_type_id in (v_gstm, v_gstq, v_gsta, v_itri, v_itrb, v_itrc, v_tds, v_adv);

  -- GST Monthly / Quarterly
  insert into public.document_requirements (tax_type_id, jurisdiction_id, code, name, description, is_mandatory, category, verified)
  values 
    (v_gstm, null, 'GST_SALES', 'Sales Invoices Register', 'All outbound supply invoices', true, 'filing', true),
    (v_gstm, null, 'GST_PURCH', 'Purchase Invoices Register', 'Invoices for claiming Input Tax Credit', true, 'filing', true),
    (v_gstm, null, 'GST_BANK', 'Bank Statements', 'Bank statements for the period', true, 'filing', true),
    (v_gstq, null, 'GST_SALES_Q', 'Sales Invoices Register', 'All outbound supply invoices for the quarter', true, 'filing', true),
    (v_gstq, null, 'GST_PURCH_Q', 'Purchase Invoices Register', 'Invoices for claiming Input Tax Credit for the quarter', true, 'filing', true);

  -- GST Annual
  insert into public.document_requirements (tax_type_id, jurisdiction_id, code, name, description, is_mandatory, category, verified)
  values 
    (v_gsta, null, 'GSTA_SUMM', 'Annual Sales & Purchase Summary', 'Consolidated summary for the fiscal year', true, 'filing', true),
    (v_gsta, null, 'GSTA_AUDIT', 'Audited Financial Statements', 'Required if turnover exceeds limit', false, 'filing', true);

  -- ITR Individual
  insert into public.document_requirements (tax_type_id, jurisdiction_id, code, name, description, is_mandatory, category, verified)
  values 
    (v_itri, null, 'ITR_IND_F16', 'Form 16 / Salary Slips', 'Wage and tax statement from employer', true, 'filing', true),
    (v_itri, null, 'ITR_IND_26AS', 'Form 26AS / AIS', 'Annual Information Statement', true, 'filing', true),
    (v_itri, null, 'ITR_IND_INV', 'Investment Proofs', '80C deductions, LIC, PPF, home loan interest', false, 'filing', true);

  -- ITR Business
  insert into public.document_requirements (tax_type_id, jurisdiction_id, code, name, description, is_mandatory, category, verified)
  values 
    (v_itrb, null, 'ITR_BUS_PL', 'Profit & Loss and Balance Sheet', 'Financial statements for the year', true, 'filing', true),
    (v_itrb, null, 'ITR_BUS_BANK', 'Bank Statements', 'For all current accounts', true, 'filing', true),
    (v_itrb, null, 'ITR_BUS_26AS', 'Form 26AS / AIS', 'Annual Information Statement', true, 'filing', true);

  -- ITR Company
  insert into public.document_requirements (tax_type_id, jurisdiction_id, code, name, description, is_mandatory, category, verified)
  values 
    (v_itrc, null, 'ITR_CO_AUDIT', 'Audited Financial Statements', 'Statutory audit report, P&L, Balance Sheet', true, 'filing', true),
    (v_itrc, null, 'ITR_CO_26AS', 'Form 26AS / AIS', 'Annual Information Statement', true, 'filing', true);

  -- TDS
  insert into public.document_requirements (tax_type_id, jurisdiction_id, code, name, description, is_mandatory, category, verified)
  values 
    (v_tds, null, 'TDS_DEDUCTEE', 'Deductee List with PAN', 'Details of payments and TDS deducted', true, 'filing', true),
    (v_tds, null, 'TDS_CHALLAN', 'TDS Challans', 'Proof of TDS deposited to govt', true, 'filing', true);

END $$;
