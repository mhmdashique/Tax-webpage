-- GST payment accounting and versioned, CA-confirmable rule sets.

alter table public.clients
  add column if not exists annual_turnover_previous_fy numeric(16, 2)
  check (annual_turnover_previous_fy is null or annual_turnover_previous_fy >= 0);

alter table public.filings
  add column if not exists output_gst numeric(16, 2) not null default 0 check (output_gst >= 0),
  add column if not exists eligible_itc numeric(16, 2) not null default 0 check (eligible_itc >= 0),
  add column if not exists wrongly_utilized_itc numeric(16, 2) not null default 0 check (wrongly_utilized_itc >= 0),
  add column if not exists output_gst_cgst numeric(16, 2) check (output_gst_cgst is null or output_gst_cgst >= 0),
  add column if not exists output_gst_sgst numeric(16, 2) check (output_gst_sgst is null or output_gst_sgst >= 0),
  add column if not exists output_gst_igst numeric(16, 2) check (output_gst_igst is null or output_gst_igst >= 0),
  add column if not exists eligible_itc_cgst numeric(16, 2) check (eligible_itc_cgst is null or eligible_itc_cgst >= 0),
  add column if not exists eligible_itc_sgst numeric(16, 2) check (eligible_itc_sgst is null or eligible_itc_sgst >= 0),
  add column if not exists eligible_itc_igst numeric(16, 2) check (eligible_itc_igst is null or eligible_itc_igst >= 0),
  add column if not exists tax_payable_cgst numeric(16, 2) check (tax_payable_cgst is null or tax_payable_cgst >= 0),
  add column if not exists tax_payable_sgst numeric(16, 2) check (tax_payable_sgst is null or tax_payable_sgst >= 0),
  add column if not exists tax_payable_igst numeric(16, 2) check (tax_payable_igst is null or tax_payable_igst >= 0),
  add column if not exists is_nil_return boolean not null default false,
  add column if not exists gst_tax_mode text not null default 'cgst_sgst'
    check (gst_tax_mode in ('cgst_sgst', 'igst'));

create table if not exists public.gst_rules (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid references public.firms(id) on delete cascade,
  rule_name text not null,
  rate_or_amount numeric(16, 6) not null check (rate_or_amount >= 0),
  cap numeric(16, 2) check (cap is null or cap >= 0),
  applies_to text not null,
  effective_from date not null default current_date,
  effective_to date,
  notification_ref text,
  checked_at date,
  version integer not null check (version > 0),
  is_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create unique index if not exists gst_rules_version_idx
  on public.gst_rules (coalesce(firm_id, '00000000-0000-0000-0000-000000000000'::uuid), rule_name, version);
create index if not exists gst_rules_effective_idx on public.gst_rules (firm_id, rule_name, effective_from desc);

insert into public.gst_rules (rule_name, rate_or_amount, cap, applies_to, version)
values
  ('interest_normal', 18, null, 'net_cash_tax_percent_per_annum', 1),
  ('interest_wrong_itc', 24, null, 'confirmed_wrong_itc_percent_per_annum', 1),
  ('late_fee_per_day', 50, null, 'non_nil_return_inr_per_day', 1),
  ('late_fee_nil_per_day', 20, 500, 'nil_return_inr_per_day', 1),
  ('late_fee_cap_low', 2000, null, 'turnover_up_to_15000000_inr', 1),
  ('late_fee_cap_mid', 5000, null, 'turnover_15000000_to_50000000_inr', 1),
  ('late_fee_cap_high', 10000, null, 'turnover_above_50000000_inr', 1),
  ('turnover_threshold_low', 15000000, null, 'inr', 1),
  ('turnover_threshold_high', 50000000, null, 'inr', 1),
  ('payment_allocation_order', 1, null, 'late_fee,interest,tax', 1)
on conflict do nothing;

create table if not exists public.filing_payments (
  id uuid primary key default gen_random_uuid(),
  filing_id uuid not null unique references public.filings(id) on delete cascade,
  firm_id uuid not null references public.firms(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  tax_payable numeric(16, 2) not null default 0 check (tax_payable >= 0),
  output_gst_cgst numeric(16, 2) check (output_gst_cgst is null or output_gst_cgst >= 0),
  output_gst_sgst numeric(16, 2) check (output_gst_sgst is null or output_gst_sgst >= 0),
  output_gst_igst numeric(16, 2) check (output_gst_igst is null or output_gst_igst >= 0),
  eligible_itc_cgst numeric(16, 2) check (eligible_itc_cgst is null or eligible_itc_cgst >= 0),
  eligible_itc_sgst numeric(16, 2) check (eligible_itc_sgst is null or eligible_itc_sgst >= 0),
  eligible_itc_igst numeric(16, 2) check (eligible_itc_igst is null or eligible_itc_igst >= 0),
  tax_payable_cgst numeric(16, 2) check (tax_payable_cgst is null or tax_payable_cgst >= 0),
  tax_payable_sgst numeric(16, 2) check (tax_payable_sgst is null or tax_payable_sgst >= 0),
  tax_payable_igst numeric(16, 2) check (tax_payable_igst is null or tax_payable_igst >= 0),
  credit_carry_forward numeric(16, 2) not null default 0 check (credit_carry_forward >= 0),
  wrongly_utilized_itc numeric(16, 2) not null default 0 check (wrongly_utilized_itc >= 0),
  is_nil_return boolean not null default false,
  gst_tax_mode text not null default 'cgst_sgst' check (gst_tax_mode in ('cgst_sgst', 'igst')),
  wrong_itc_confirmed boolean not null default false,
  late_fee_due numeric(16, 2) not null default 0 check (late_fee_due >= 0),
  interest_override numeric(16, 2) check (interest_override is null or interest_override >= 0),
  late_fee_override numeric(16, 2) check (late_fee_override is null or late_fee_override >= 0),
  due_date date not null,
  filed_on date not null,
  turnover_snapshot numeric(16, 2),
  turnover_required boolean not null default false,
  currency text not null default 'INR' check (currency = 'INR'),
  rule_snapshot jsonb not null,
  amount_paid numeric(16, 2) not null default 0 check (amount_paid >= 0),
  status text not null default 'payment_due'
    check (status in ('not_required', 'payment_due', 'partly_paid', 'paid', 'overdue')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.filing_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  filing_payment_id uuid not null references public.filing_payments(id) on delete cascade,
  amount numeric(16, 2) not null check (amount > 0),
  paid_on date not null,
  method text not null,
  challan_no text not null,
  proof_path text,
  advance_amount numeric(16, 2) not null default 0 check (advance_amount >= 0),
  allocated_late_fee numeric(16, 2) not null default 0 check (allocated_late_fee >= 0),
  allocated_interest numeric(16, 2) not null default 0 check (allocated_interest >= 0),
  allocated_tax numeric(16, 2) not null default 0 check (allocated_tax >= 0),
  allocated_wrong_itc numeric(16, 2) not null default 0 check (allocated_wrong_itc >= 0),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists filing_payment_transactions_payment_idx
  on public.filing_payment_transactions (filing_payment_id, paid_on, created_at);

create table if not exists public.gst_payment_proofs (
  id uuid primary key default gen_random_uuid(),
  filing_payment_id uuid not null references public.filing_payments(id) on delete cascade,
  proof_path text not null,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  uploaded_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null
);
create table if not exists public.gst_payment_overrides (
  id uuid primary key default gen_random_uuid(),
  filing_payment_id uuid not null references public.filing_payments(id) on delete cascade,
  override_type text not null check (override_type in ('interest', 'late_fee', 'wrong_itc_confirmation')),
  previous_value numeric(16, 2),
  new_value numeric(16, 2),
  reason text not null check (length(btrim(reason)) > 0),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.gst_payment_audit (
  id bigint generated always as identity primary key,
  filing_payment_id uuid not null references public.filing_payments(id) on delete cascade,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.gst_payment_notifications (
  id uuid primary key default gen_random_uuid(),
  filing_payment_id uuid not null references public.filing_payments(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  recipient_email text not null,
  event_type text not null check (event_type in (
    'payment_due', 'due_7_days', 'due_3_days', 'due_1_day',
    'overdue', 'late_fee_applied', 'paid'
  )),
  message text not null,
  scheduled_for date not null,
  email_sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (filing_payment_id, recipient_id, event_type, scheduled_for)
);
create index if not exists gst_payment_notifications_due_idx
  on public.gst_payment_notifications (scheduled_for) where email_sent_at is null;

alter table public.gst_rules enable row level security;
alter table public.filing_payments enable row level security;
alter table public.filing_payment_transactions enable row level security;
alter table public.gst_payment_proofs enable row level security;
alter table public.gst_payment_overrides enable row level security;
alter table public.gst_payment_audit enable row level security;
alter table public.gst_payment_notifications enable row level security;

create or replace function public.gst_can_access_payment(p_payment uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.filing_payments p
    where p.id = p_payment and public.is_approved()
      and public.can_access_client(p.client_id)
  )
$$;

create policy gst_rules_read on public.gst_rules for select to authenticated
  using (public.is_approved() and (firm_id is null or firm_id = public.my_firm_id()));
create policy gst_rules_admin_insert on public.gst_rules for insert to authenticated
  with check (public.is_admin() and firm_id = public.my_firm_id());
create policy filing_payments_read on public.filing_payments for select to authenticated
  using (public.is_approved() and public.can_access_client(client_id));
create policy filing_payment_transactions_read on public.filing_payment_transactions for select to authenticated
  using (exists (
    select 1 from public.filing_payments p
    where p.id = filing_payment_transactions.filing_payment_id
      and public.is_approved() and public.can_access_client(p.client_id)
  ));
create policy gst_payment_proofs_read on public.gst_payment_proofs for select to authenticated
  using (exists (
    select 1 from public.filing_payments p
    where p.id = gst_payment_proofs.filing_payment_id
      and public.is_approved() and public.can_access_client(p.client_id)
  ));
create policy gst_payment_proofs_client_insert on public.gst_payment_proofs for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.filing_payments p
      where p.id = gst_payment_proofs.filing_payment_id
        and public.is_approved() and public.current_user_role() = 'client'
        and public.can_access_client(p.client_id)
    )
  );
create or replace function public.gst_payment_path_id(p_name text)
returns uuid language plpgsql immutable set search_path = public as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end
$$;

insert into storage.buckets (id, name, public)
values ('gst-payment-proofs', 'gst-payment-proofs', false)
on conflict (id) do update set public = false;
drop policy if exists gst_payment_proofs_storage_select on storage.objects;
create policy gst_payment_proofs_storage_select on storage.objects for select to authenticated
  using (
    bucket_id = 'gst-payment-proofs'
    and public.gst_can_access_payment(public.gst_payment_path_id(name))
  );
drop policy if exists gst_payment_proofs_storage_insert on storage.objects;
create policy gst_payment_proofs_storage_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'gst-payment-proofs'
    and public.current_user_role() = 'client'
    and public.gst_can_access_payment(public.gst_payment_path_id(name))
  );
drop policy if exists gst_payment_proofs_storage_delete on storage.objects;
create policy gst_payment_proofs_storage_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'gst-payment-proofs'
    and public.current_user_role() = 'client'
    and public.gst_can_access_payment(public.gst_payment_path_id(name))
  );
create policy gst_payment_overrides_read on public.gst_payment_overrides for select to authenticated
  using (exists (
    select 1 from public.filing_payments p
    where p.id = gst_payment_overrides.filing_payment_id
      and public.is_approved() and public.is_admin() and p.firm_id = public.my_firm_id()
  ));
create policy gst_payment_audit_read on public.gst_payment_audit for select to authenticated
  using (exists (
    select 1 from public.filing_payments p
    where p.id = gst_payment_audit.filing_payment_id
      and public.is_approved() and public.is_admin() and p.firm_id = public.my_firm_id()
  ));
create policy gst_payment_notifications_read on public.gst_payment_notifications for select to authenticated
  using (
    public.is_approved()
    and (recipient_id = auth.uid()
      or exists (
        select 1 from public.filing_payments p
        where p.id = gst_payment_notifications.filing_payment_id
          and p.firm_id = public.my_firm_id() and public.is_admin()
      ))
  );

create or replace function public.gst_rules_for_firm(p_firm_id uuid, p_as_of date)
returns jsonb language sql stable security definer set search_path = public as $$
  with ranked as (
    select r.*,
      row_number() over (
        partition by r.rule_name
        order by (r.firm_id is not null) desc, r.version desc, r.effective_from desc
      ) as preference
    from public.gst_rules r
    where (r.firm_id is null or r.firm_id = p_firm_id)
      and r.effective_from <= p_as_of
      and (r.effective_to is null or r.effective_to >= p_as_of)
  )
  select coalesce(jsonb_object_agg(rule_name, jsonb_build_object(
    'value', rate_or_amount, 'cap', cap, 'applies_to', applies_to,
    'version', version, 'confirmed', is_confirmed, 'checked_at', checked_at,
    'notification_ref', notification_ref
  )), '{}'::jsonb)
  from ranked where preference = 1
$$;

create or replace function public.gst_payment_summary(p_payment uuid, p_as_of date default current_date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.filing_payments%rowtype;
  tx record;
  normal_rate numeric := 0;
  wrong_rate numeric := 0;
  rules_confirmed boolean := false;
  tax_balance numeric := 0;
  wrong_balance numeric := 0;
  fee_balance numeric := 0;
  interest_accrued numeric := 0;
  interest_paid numeric := 0;
  normal_interest_accrued numeric := 0;
  wrong_interest_accrued numeric := 0;
  normal_interest_paid numeric := 0;
  wrong_interest_paid numeric := 0;
  payment_interest_remaining numeric;
  normal_interest_payment numeric;
  amount_paid numeric := 0;
  advance_paid numeric := 0;
  segment_days integer;
  cursor_date date;
  interest_balance numeric;
  normal_interest_balance numeric;
  wrong_interest_balance numeric;
  total_balance numeric;
  has_challan boolean;
  result_status text;
  daily_interest numeric;
  late_fee_review_required boolean;
  interest_review_required boolean;
  charges_reviewed boolean;
begin
  if auth.uid() is not null and not public.gst_can_access_payment(p_payment) then
    raise exception 'Not allowed';
  end if;
  select * into p from public.filing_payments where id = p_payment;
  if not found then raise exception 'Filing payment not found'; end if;

  normal_rate := coalesce((p.rule_snapshot #>> '{interest_normal,value}')::numeric, 0);
  wrong_rate := coalesce((p.rule_snapshot #>> '{interest_wrong_itc,value}')::numeric, 0);
  rules_confirmed := coalesce((p.rule_snapshot ->> 'all_confirmed')::boolean, false);
  tax_balance := p.tax_payable;
  wrong_balance := case when p.wrong_itc_confirmed then p.wrongly_utilized_itc else 0 end;
  fee_balance := p.late_fee_due;
  cursor_date := p.due_date;

  for tx in
    select * from public.filing_payment_transactions t
    where t.filing_payment_id = p_payment
    order by t.paid_on, t.created_at, t.id
  loop
    segment_days := greatest(0, tx.paid_on - cursor_date);
    if rules_confirmed and segment_days > 0 then
      interest_accrued := interest_accrued + round(
        (tax_balance * normal_rate + wrong_balance * wrong_rate) * segment_days / 36500, 2
      );
      normal_interest_accrued := normal_interest_accrued
        + round(tax_balance * normal_rate * segment_days / 36500, 2);
      wrong_interest_accrued := wrong_interest_accrued
        + round(wrong_balance * wrong_rate * segment_days / 36500, 2);
    end if;
    cursor_date := greatest(cursor_date, tx.paid_on);
    fee_balance := greatest(0, fee_balance - tx.allocated_late_fee);
    interest_paid := interest_paid + tx.allocated_interest;
    payment_interest_remaining := tx.allocated_interest;
    normal_interest_payment := least(
      payment_interest_remaining,
      greatest(0, normal_interest_accrued - normal_interest_paid)
    );
    normal_interest_paid := normal_interest_paid + normal_interest_payment;
    payment_interest_remaining := greatest(0, payment_interest_remaining - normal_interest_payment);
    wrong_interest_paid := wrong_interest_paid + least(
      payment_interest_remaining,
      greatest(0, wrong_interest_accrued - wrong_interest_paid)
    );
    amount_paid := amount_paid + tx.amount;
    advance_paid := advance_paid + tx.advance_amount;
    tax_balance := greatest(0, tax_balance - tx.allocated_tax);
    wrong_balance := greatest(0, wrong_balance - tx.allocated_wrong_itc);
  end loop;

  segment_days := greatest(0, p_as_of - cursor_date);
  if rules_confirmed and segment_days > 0 then
    interest_accrued := interest_accrued + round(
      (tax_balance * normal_rate + wrong_balance * wrong_rate) * segment_days / 36500, 2
    );
    normal_interest_accrued := normal_interest_accrued
      + round(tax_balance * normal_rate * segment_days / 36500, 2);
    wrong_interest_accrued := wrong_interest_accrued
      + round(wrong_balance * wrong_rate * segment_days / 36500, 2);
  end if;
  interest_balance := greatest(0, interest_accrued - interest_paid);
  if p.interest_override is not null then
    interest_balance := p.interest_override;
    wrong_interest_balance := 0;
  else
    wrong_interest_balance := least(
      interest_balance,
      greatest(0, wrong_interest_accrued - wrong_interest_paid)
    );
  end if;
  normal_interest_balance := greatest(0, interest_balance - wrong_interest_balance);
  if p.late_fee_override is not null then fee_balance := p.late_fee_override; end if;
  total_balance := tax_balance + wrong_balance + fee_balance + interest_balance;
  daily_interest := case when rules_confirmed
    then round((tax_balance * normal_rate + wrong_balance * wrong_rate) / 36500, 2)
    else 0 end;

  select exists (
    select 1 from public.filing_payment_transactions t
      where t.filing_payment_id = p_payment and t.proof_path is not null
    union all
    select 1 from public.gst_payment_proofs g
      where g.filing_payment_id = p_payment and g.verified_at is not null
  ) into has_challan;

  late_fee_review_required := not rules_confirmed and p.filed_on > p.due_date;
  interest_review_required := not rules_confirmed and (
    (p_as_of > p.due_date and tax_balance + wrong_balance > 0)
    or exists (
      select 1 from public.filing_payment_transactions t
      where t.filing_payment_id = p_payment and t.paid_on > p.due_date
        and (t.allocated_tax > 0 or t.allocated_wrong_itc > 0)
    )
  );
  charges_reviewed := (not late_fee_review_required or p.late_fee_override is not null)
    and (not interest_review_required or p.interest_override is not null);

  result_status := case
    when tax_balance + wrong_balance = 0 and fee_balance = 0 and interest_balance = 0
      and p.tax_payable = 0 and (p.wrongly_utilized_itc = 0 or not p.wrong_itc_confirmed)
      and charges_reviewed
      then 'not_required'
    when total_balance = 0 and has_challan
      and charges_reviewed
      then 'paid'
    when p_as_of > p.due_date and total_balance > 0 then 'overdue'
    when amount_paid > 0 and total_balance > 0 then 'partly_paid'
    when total_balance = 0 and amount_paid > 0 then 'partly_paid'
    when total_balance = 0 then 'payment_due'
    else 'payment_due'
  end;

  return jsonb_build_object(
    'filing_payment_id', p.id, 'filing_id', p.filing_id,
    'tax_payable', p.tax_payable,
    'output_gst_cgst', p.output_gst_cgst,
    'output_gst_sgst', p.output_gst_sgst,
    'output_gst_igst', p.output_gst_igst,
    'eligible_itc_cgst', p.eligible_itc_cgst,
    'eligible_itc_sgst', p.eligible_itc_sgst,
    'eligible_itc_igst', p.eligible_itc_igst,
    'tax_payable_cgst', p.tax_payable_cgst,
    'tax_payable_sgst', p.tax_payable_sgst,
    'tax_payable_igst', p.tax_payable_igst,
    'component_breakdown_available', p.tax_payable_cgst is not null
      and p.tax_payable_sgst is not null and p.tax_payable_igst is not null,
    'wrong_itc_payable', case when p.wrong_itc_confirmed then p.wrongly_utilized_itc else 0 end,
    'interest_due', interest_balance, 'interest_accrued_lifetime', interest_accrued,
    'late_fee_due', fee_balance,
    'total_due', amount_paid - advance_paid + total_balance,
    'amount_paid', amount_paid, 'advance_paid', advance_paid,
    'balance', total_balance, 'credit_carry_forward', p.credit_carry_forward,
    'daily_interest_accrual', daily_interest,
    'interest_cgst', case when p.tax_payable > 0 and p.tax_payable_cgst is not null
      then round(normal_interest_balance * p.tax_payable_cgst / p.tax_payable, 2) else 0 end,
    'interest_sgst', case when p.tax_payable > 0 and p.tax_payable_sgst is not null
      then round(normal_interest_balance * p.tax_payable_sgst / p.tax_payable, 2) else 0 end,
    'interest_igst', case when p.tax_payable > 0
      and p.tax_payable_cgst is not null and p.tax_payable_sgst is not null and p.tax_payable_igst is not null
      then normal_interest_balance
        - round(normal_interest_balance * p.tax_payable_cgst / p.tax_payable, 2)
        - round(normal_interest_balance * p.tax_payable_sgst / p.tax_payable, 2)
      else 0 end,
    'wrong_itc_interest_due', wrong_interest_balance,
    'late_fee_cgst', round(fee_balance / 2, 2),
    'late_fee_sgst', fee_balance - round(fee_balance / 2, 2),
    'late_fee_igst', 0,
    'status', result_status, 'due_date', p.due_date, 'filed_on', p.filed_on,
    'turnover_required', p.turnover_required, 'rules_confirmed', rules_confirmed,
    'wrong_itc_confirmation_required', (p.wrongly_utilized_itc > 0 and not p.wrong_itc_confirmed),
    'due_within_three_days', (p.due_date between current_date and current_date + 3),
    'rule_snapshot', p.rule_snapshot, 'challan_uploaded', has_challan
  );
end
$$;

create or replace function public.gst_queue_payment_notification(
  p_payment uuid, p_event text, p_scheduled_for date
)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.filing_payments%rowtype;
  s jsonb;
  notification_message text;
begin
  select * into p from public.filing_payments where id = p_payment;
  if not found then return; end if;
  s := public.gst_payment_summary(p_payment, p_scheduled_for);
  notification_message := case p_event
    when 'payment_due' then format('GST payment due: INR %s. Due date: %s.', s ->> 'balance', p.due_date)
    when 'due_7_days' then format('GST payment is due in 7 days on %s. Balance: INR %s.', p.due_date, s ->> 'balance')
    when 'due_3_days' then format('GST payment is due in 3 days on %s. Balance: INR %s.', p.due_date, s ->> 'balance')
    when 'due_1_day' then format('GST payment is due tomorrow (%s). Balance: INR %s.', p.due_date, s ->> 'balance')
    when 'overdue' then format('GST payment is overdue. Interest accrued till today: INR %s. Current balance: INR %s.', s ->> 'interest_due', s ->> 'balance')
    when 'late_fee_applied' then format('GST late fee applied: INR %s.', s ->> 'late_fee_due')
    when 'paid' then 'GST payment verified and marked paid.'
    else 'GST filing payment update.'
  end;

  insert into public.gst_payment_notifications (
    filing_payment_id, recipient_id, recipient_email, event_type, message, scheduled_for
  )
  select p.id, u.id, u.email, p_event, notification_message, p_scheduled_for
  from (
    select c.linked_user_id as user_id from public.clients c where c.id = p.client_id
    union
    select cu.user_id from public.client_users cu where cu.client_id = p.client_id
    union
    select c.assigned_employee_id from public.clients c
      where c.id = p.client_id and c.assigned_employee_id is not null
  ) recipients
  join public.users u on u.id = recipients.user_id
  where u.email is not null
  on conflict (filing_payment_id, recipient_id, event_type, scheduled_for) do nothing;
end
$$;

create or replace function public.gst_queue_overdue_notifications()
returns integer language plpgsql security definer set search_path = public as $$
declare
  p record;
  s jsonb;
  queued integer := 0;
begin
  for p in select id, due_date from public.filing_payments where due_date < current_date
  loop
    s := public.gst_payment_summary(p.id, current_date);
    if s ->> 'status' = 'overdue' then
      perform public.gst_queue_payment_notification(p.id, 'overdue', current_date);
      queued := queued + 1;
    end if;
  end loop;
  return queued;
end
$$;

create or replace function public.mark_gst_notification_read(p_notification_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_approved() then raise exception 'Approved users only'; end if;
  update public.gst_payment_notifications
    set read_at = coalesce(read_at, now())
    where id = p_notification_id and recipient_id = auth.uid();
  if not found then raise exception 'Notification not found'; end if;
end
$$;

create or replace function public.gst_file_filing()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_gst boolean;
  rules jsonb;
  rules_confirmed boolean;
  turnover numeric;
  cash_tax numeric;
  is_legacy_filing boolean := false;
  credit numeric;
  late_days integer;
  daily_fee numeric;
  cap_amount numeric;
  late_fee_amount numeric;
  payment_id uuid;
  payment_summary jsonb;
begin
  if new.status <> 'filed' then return new; end if;
  if tg_op = 'UPDATE' then
    is_legacy_filing := old.status = 'filed';
  end if;
  if tg_op = 'UPDATE' and old.status = 'filed'
     and exists (select 1 from public.filing_payments where filing_id = new.id) then
    return new;
  end if;
  select exists (
    select 1 from public.tax_types_v2 t
    where t.id = new.tax_type_v2_id and upper(t.code) like 'GST%'
  ) or new.tax_type ilike '%gst%' into is_gst;
  if not is_gst then return new; end if;
  if new.client_id is null then raise exception 'A client is required before filing a GST return'; end if;
  if new.filed_at is null then new.filed_at := now(); end if;

  rules := public.gst_rules_for_firm(new.firm_id, new.filed_at::date);
  rules_confirmed := coalesce((
    select bool_and((value ->> 'confirmed')::boolean) from jsonb_each(rules)
  ), false);
  cash_tax := case when new.output_gst = 0 and new.eligible_itc = 0
    then greatest(0, coalesce(new.amount_owed, 0))
    else greatest(0, new.output_gst - new.eligible_itc) end;
  if not is_legacy_filing then
    if new.output_gst_cgst is null or new.output_gst_sgst is null or new.output_gst_igst is null
       or new.eligible_itc_cgst is null or new.eligible_itc_sgst is null or new.eligible_itc_igst is null
       or new.tax_payable_cgst is null or new.tax_payable_sgst is null or new.tax_payable_igst is null then
      raise exception 'Enter output GST, eligible ITC, and net cash payable by CGST, SGST, and IGST';
    end if;
    if round(new.output_gst_cgst + new.output_gst_sgst + new.output_gst_igst, 2) <> new.output_gst
       or round(new.eligible_itc_cgst + new.eligible_itc_sgst + new.eligible_itc_igst, 2) <> new.eligible_itc
       or round(new.tax_payable_cgst + new.tax_payable_sgst + new.tax_payable_igst, 2) <> round(cash_tax, 2) then
      raise exception 'GST component amounts must match the aggregate output, ITC, and net cash payable';
    end if;
  end if;
  credit := greatest(0, new.eligible_itc - new.output_gst);
  select c.annual_turnover_previous_fy into turnover from public.clients c where c.id = new.client_id;
  late_days := greatest(0, new.filed_at::date - new.due_date);
  daily_fee := coalesce((rules #>> case when new.is_nil_return
    then '{late_fee_nil_per_day,value}' else '{late_fee_per_day,value}' end)::numeric, 0);
  if new.is_nil_return then
    cap_amount := coalesce((rules #>> '{late_fee_nil_per_day,cap}')::numeric, 0);
  elsif turnover is null then
    cap_amount := 0;
  elsif turnover <= coalesce((rules #>> '{turnover_threshold_low,value}')::numeric, 0) then
    cap_amount := coalesce((rules #>> '{late_fee_cap_low,value}')::numeric, 0);
  elsif turnover <= coalesce((rules #>> '{turnover_threshold_high,value}')::numeric, 0) then
    cap_amount := coalesce((rules #>> '{late_fee_cap_mid,value}')::numeric, 0);
  else
    cap_amount := coalesce((rules #>> '{late_fee_cap_high,value}')::numeric, 0);
  end if;
  late_fee_amount := case when rules_confirmed and late_days > 0
    then least(late_days * daily_fee, cap_amount) else 0 end;

  insert into public.filing_payments (
    filing_id, firm_id, client_id, tax_payable,
    output_gst_cgst, output_gst_sgst, output_gst_igst,
    eligible_itc_cgst, eligible_itc_sgst, eligible_itc_igst,
    tax_payable_cgst, tax_payable_sgst, tax_payable_igst, credit_carry_forward,
    wrongly_utilized_itc, is_nil_return, gst_tax_mode, late_fee_due, due_date, filed_on, turnover_snapshot,
    turnover_required, rule_snapshot, status
  ) values (
    new.id, new.firm_id, new.client_id, cash_tax,
    new.output_gst_cgst, new.output_gst_sgst, new.output_gst_igst,
    new.eligible_itc_cgst, new.eligible_itc_sgst, new.eligible_itc_igst,
    new.tax_payable_cgst, new.tax_payable_sgst, new.tax_payable_igst, credit, new.wrongly_utilized_itc,
    new.is_nil_return, new.gst_tax_mode,
    late_fee_amount, new.due_date, new.filed_at::date, turnover,
    (late_days > 0 and turnover is null and not new.is_nil_return),
    rules || jsonb_build_object('all_confirmed', rules_confirmed),
    case when cash_tax = 0 and new.wrongly_utilized_itc = 0 and late_fee_amount = 0
      and (new.filed_at::date <= new.due_date or rules_confirmed)
      then 'not_required' else 'payment_due' end
  )
  on conflict (filing_id) do nothing
  returning id into payment_id;
  if payment_id is not null then
    insert into public.gst_payment_audit (filing_payment_id, action, details, actor_id)
    values (payment_id, 'calculated_on_filing', jsonb_build_object(
      'tax_payable', cash_tax, 'credit_carry_forward', credit,
      'output_gst_components', jsonb_build_object('cgst', new.output_gst_cgst, 'sgst', new.output_gst_sgst, 'igst', new.output_gst_igst),
      'eligible_itc_components', jsonb_build_object('cgst', new.eligible_itc_cgst, 'sgst', new.eligible_itc_sgst, 'igst', new.eligible_itc_igst),
      'tax_payable_components', jsonb_build_object('cgst', new.tax_payable_cgst, 'sgst', new.tax_payable_sgst, 'igst', new.tax_payable_igst),
      'late_fee_due', late_fee_amount, 'rule_snapshot', rules
    ), auth.uid());
    payment_summary := public.gst_payment_summary(payment_id, current_date);
    if payment_summary ->> 'status' <> 'not_required' then
      perform public.gst_queue_payment_notification(payment_id, 'payment_due', current_date);
      perform public.gst_queue_payment_notification(payment_id, 'due_7_days', new.due_date - 7);
      perform public.gst_queue_payment_notification(payment_id, 'due_3_days', new.due_date - 3);
      perform public.gst_queue_payment_notification(payment_id, 'due_1_day', new.due_date - 1);
    end if;
    if late_fee_amount > 0 then
      perform public.gst_queue_payment_notification(payment_id, 'late_fee_applied', current_date);
    end if;
    if cash_tax = 0 and new.wrongly_utilized_itc = 0 and late_fee_amount = 0
       and (new.filed_at::date <= new.due_date or rules_confirmed) then
      new.status := 'completed';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_gst_file_filing on public.filings;
create trigger trg_gst_file_filing
  before insert or update of status on public.filings
  for each row execute function public.gst_file_filing();

create or replace function public.gst_guard_filing_completion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_gst boolean;
  payment_id uuid;
  payment_status text;
  payment_balance numeric;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;
  select exists (
    select 1 from public.tax_types_v2 t
    where t.id = new.tax_type_v2_id and upper(t.code) like 'GST%'
  ) or new.tax_type ilike '%gst%' into is_gst;
  if not is_gst then return new; end if;

  select id into payment_id from public.filing_payments where filing_id = new.id;
  if payment_id is null then raise exception 'GST payment must be calculated before completing the filing'; end if;
  select summary ->> 'status', (summary ->> 'balance')::numeric
    into payment_status, payment_balance
    from (select public.gst_payment_summary(payment_id) as summary) s;
  if payment_status not in ('paid', 'not_required') then
    raise exception 'Payment pending: INR %', payment_balance;
  end if;
  return new;
end
$$;
drop trigger if exists trg_gst_guard_filing_completion on public.filings;
create trigger trg_gst_guard_filing_completion
  before insert or update of status on public.filings
  for each row execute function public.gst_guard_filing_completion();

-- Backfill records for GST filings that were already marked filed before this
-- migration. The trigger leaves rows with an existing payment record intact.
update public.filings set status = 'filed' where status = 'filed';

create or replace function public.record_gst_payment(
  p_filing_payment_id uuid, p_amount numeric, p_paid_on date, p_method text,
  p_challan_no text, p_proof_path text default null, p_is_advance boolean default false
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p public.filing_payments%rowtype;
  s jsonb;
  balance numeric;
  fee_due numeric;
  interest_due numeric;
  tax_due numeric;
  wrong_due numeric;
  remaining numeric;
  alloc_fee numeric := 0;
  alloc_interest numeric := 0;
  alloc_tax numeric := 0;
  alloc_wrong numeric := 0;
  extra_advance numeric := 0;
  order_item text;
  payment_id uuid;
begin
  if auth.uid() is not null and (not public.is_approved() or not public.is_staff()) then
    raise exception 'Approved staff only';
  end if;
  if p_amount <= 0 or coalesce(btrim(p_method), '') = ''
     or coalesce(btrim(p_challan_no), '') = '' then
    raise exception 'Amount, method and challan number are required';
  end if;
  if p_paid_on > current_date then raise exception 'Payment date cannot be in the future'; end if;

  select * into p from public.filing_payments where id = p_filing_payment_id for update;
  if not found then raise exception 'Filing payment not found'; end if;
  if auth.uid() is not null and not public.can_access_client(p.client_id) then raise exception 'Not allowed'; end if;
  if auth.uid() is not null and public.current_user_role() = 'employee'
     and not public.is_assigned(p.client_id) then raise exception 'Assigned employees only'; end if;
  if exists (select 1 from public.filing_payment_transactions
    where filing_payment_id = p.id and paid_on > p_paid_on) then
    raise exception 'Payments must be entered in chronological order';
  end if;

  s := public.gst_payment_summary(p.id, p_paid_on);
  fee_due := (s ->> 'late_fee_due')::numeric;
  interest_due := (s ->> 'interest_due')::numeric;
  tax_due := (s ->> 'tax_payable')::numeric;
  wrong_due := (s ->> 'wrong_itc_payable')::numeric;
  balance := (s ->> 'balance')::numeric;
  if p_amount > balance and not p_is_advance then
    raise exception 'Overpayment blocked; mark as advance to record the excess';
  end if;

  remaining := least(p_amount, balance);
  foreach order_item in array string_to_array(
    coalesce(p.rule_snapshot #>> '{payment_allocation_order,applies_to}', 'late_fee,interest,tax'), ','
  ) loop
    if order_item = 'late_fee' then
      alloc_fee := least(remaining, fee_due); fee_due := fee_due - alloc_fee; remaining := remaining - alloc_fee;
    elsif order_item = 'interest' then
      alloc_interest := least(remaining, interest_due); interest_due := interest_due - alloc_interest; remaining := remaining - alloc_interest;
    elsif order_item = 'tax' then
      alloc_tax := least(remaining, tax_due); tax_due := tax_due - alloc_tax; remaining := remaining - alloc_tax;
      alloc_wrong := least(remaining, wrong_due); wrong_due := wrong_due - alloc_wrong; remaining := remaining - alloc_wrong;
    end if;
  end loop;
  extra_advance := greatest(0, p_amount - alloc_fee - alloc_interest - alloc_tax - alloc_wrong);

  insert into public.filing_payment_transactions (
    filing_payment_id, amount, paid_on, method, challan_no, proof_path, advance_amount,
    allocated_late_fee, allocated_interest, allocated_tax, allocated_wrong_itc, recorded_by
  ) values (
    p.id, p_amount, p_paid_on, btrim(p_method), btrim(p_challan_no), p_proof_path,
    extra_advance, alloc_fee, alloc_interest, alloc_tax, alloc_wrong, auth.uid()
  ) returning id into payment_id;
  update public.filing_payments set amount_paid = amount_paid + p_amount, updated_at = now() where id = p.id;
  insert into public.gst_payment_audit (filing_payment_id, action, details, actor_id)
  values (p.id, 'payment_recorded', jsonb_build_object(
    'transaction_id', payment_id, 'amount', p_amount, 'paid_on', p_paid_on,
    'allocations', jsonb_build_object('late_fee', alloc_fee, 'interest', alloc_interest,
      'tax', alloc_tax, 'wrong_itc', alloc_wrong, 'advance', extra_advance)
  ), auth.uid());
  return payment_id;
end
$$;

create or replace function public.gst_refresh_status(p_payment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s jsonb;
  p public.filing_payments%rowtype;
  next_status text;
begin
  select * into p from public.filing_payments where id = p_payment for update;
  if not found then return; end if;
  s := public.gst_payment_summary(p_payment);
  next_status := s ->> 'status';
  update public.filing_payments set status = next_status, updated_at = now() where id = p.id;
  if next_status = 'paid' and p.status <> 'paid' then
    perform public.gst_queue_payment_notification(p.id, 'paid', current_date);
  end if;
  if next_status in ('paid', 'not_required') then
    update public.filings set status = 'completed' where id = p.filing_id;
  end if;
end
$$;

create or replace function public.gst_proof_uploaded()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.gst_payment_audit (filing_payment_id, action, details, actor_id)
  values (new.filing_payment_id, 'challan_proof_uploaded',
    jsonb_build_object('proof_path', new.proof_path), auth.uid());
  perform public.gst_refresh_status(new.filing_payment_id);
  return new;
end
$$;
create trigger trg_gst_proof_audit after insert on public.gst_payment_proofs
  for each row execute function public.gst_proof_uploaded();

create or replace function public.gst_payment_transaction_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.gst_refresh_status(new.filing_payment_id);
  return new;
end
$$;
create trigger trg_gst_payment_status_update after insert on public.filing_payment_transactions
  for each row execute function public.gst_payment_transaction_added();

create or replace function public.verify_gst_payment_proof(p_proof_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  proof public.gst_payment_proofs%rowtype;
  payment public.filing_payments%rowtype;
begin
  if not public.is_approved() or not public.is_staff() then raise exception 'Approved staff only'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A verification reason is required'; end if;
  select * into proof from public.gst_payment_proofs where id = p_proof_id for update;
  if not found then raise exception 'Challan proof not found'; end if;
  select * into payment from public.filing_payments where id = proof.filing_payment_id for update;
  if auth.uid() is not null and (
    not public.can_access_client(payment.client_id)
    or (public.current_user_role() = 'employee' and not public.is_assigned(payment.client_id))
  ) then raise exception 'Not allowed'; end if;
  update public.gst_payment_proofs
    set verified_at = now(), verified_by = auth.uid() where id = proof.id;
  insert into public.gst_payment_audit (filing_payment_id, action, details, actor_id)
  values (payment.id, 'challan_proof_verified', jsonb_build_object(
    'proof_id', proof.id, 'reason', btrim(p_reason)
  ), auth.uid());
  perform public.gst_refresh_status(payment.id);
end
$$;

create or replace function public.override_gst_payment(
  p_filing_payment_id uuid, p_override_type text, p_new_value numeric, p_reason text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.filing_payments%rowtype;
  old_value numeric;
begin
  if not public.is_approved() or not public.is_admin() then raise exception 'Approved admin only'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'An override reason is required'; end if;
  select * into p from public.filing_payments
    where id = p_filing_payment_id and firm_id = public.my_firm_id() for update;
  if not found then raise exception 'Filing payment not found'; end if;

  if p_override_type = 'interest' then
    if p_new_value < 0 then raise exception 'Interest override cannot be negative'; end if;
    old_value := (public.gst_payment_summary(p.id) ->> 'interest_due')::numeric;
    update public.filing_payments set interest_override = p_new_value, updated_at = now() where id = p.id;
  elsif p_override_type = 'late_fee' then
    if p_new_value < 0 then raise exception 'Late fee override cannot be negative'; end if;
    old_value := (public.gst_payment_summary(p.id) ->> 'late_fee_due')::numeric;
    update public.filing_payments set late_fee_override = p_new_value, updated_at = now() where id = p.id;
  elsif p_override_type = 'wrong_itc_confirmation' then
    if p_new_value not in (0, 1) then raise exception 'Wrong-ITC confirmation must be 0 or 1'; end if;
    old_value := case when p.wrong_itc_confirmed then p.wrongly_utilized_itc else 0 end;
    update public.filing_payments
      set wrong_itc_confirmed = coalesce(p_new_value, 0) <> 0, updated_at = now()
      where id = p.id;
  else
    raise exception 'Unsupported override type';
  end if;

  insert into public.gst_payment_overrides (
    filing_payment_id, override_type, previous_value, new_value, reason, actor_id
  ) values (p.id, p_override_type, old_value, p_new_value, btrim(p_reason), auth.uid());
  insert into public.gst_payment_audit (filing_payment_id, action, details, actor_id)
  values (p.id, 'override_applied', jsonb_build_object(
    'type', p_override_type, 'old_value', old_value, 'new_value', p_new_value, 'reason', btrim(p_reason)
  ), auth.uid());
  perform public.gst_refresh_status(p.id);
end
$$;

create or replace function public.publish_gst_rule(
  p_rule_name text, p_rate_or_amount numeric, p_cap numeric, p_applies_to text,
  p_effective_from date, p_notification_ref text, p_checked_at date, p_confirmed boolean default false
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  next_version integer;
begin
  if not public.is_approved() or not public.is_admin() then raise exception 'Approved admin only'; end if;
  if coalesce(p_rule_name, '') = '' or p_rate_or_amount < 0 or coalesce(p_applies_to, '') = '' then
    raise exception 'Rule name, non-negative value and applies-to are required';
  end if;
  if p_confirmed and (coalesce(btrim(p_notification_ref), '') = '' or p_checked_at is null) then
    raise exception 'CA confirmation requires a notification reference and checked date';
  end if;
  select coalesce(max(version), 0) + 1 into next_version
    from public.gst_rules where rule_name = p_rule_name and firm_id = public.my_firm_id();
  insert into public.gst_rules (
    firm_id, rule_name, rate_or_amount, cap, applies_to, version, effective_from,
    notification_ref, checked_at, is_confirmed
  ) values (
    public.my_firm_id(), p_rule_name, p_rate_or_amount, p_cap, p_applies_to,
    next_version, coalesce(p_effective_from, current_date), p_notification_ref, p_checked_at, p_confirmed
  );
  return next_version;
end
$$;

create or replace function public.set_gst_client_turnover(p_client_id uuid, p_turnover numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_approved() or not public.is_staff() then raise exception 'Approved staff only'; end if;
  if p_turnover < 0 then raise exception 'Turnover cannot be negative'; end if;
  if not public.can_access_client(p_client_id) then raise exception 'Not allowed'; end if;
  if public.current_user_role() = 'employee' and not public.is_assigned(p_client_id) then
    raise exception 'Assigned employees only';
  end if;
  update public.clients set annual_turnover_previous_fy = p_turnover where id = p_client_id;
  if not found then raise exception 'Client not found'; end if;
end
$$;

create or replace function public.apply_gst_client_turnover()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p record;
  threshold_low numeric;
  threshold_high numeric;
  cap_amount numeric;
  updated_late_fee numeric;
begin
  if new.annual_turnover_previous_fy is not distinct from old.annual_turnover_previous_fy
     or new.annual_turnover_previous_fy is null then
    return new;
  end if;
  for p in
    select * from public.filing_payments
    where client_id = new.id and turnover_required
      and turnover_snapshot is null
    for update
  loop
    threshold_low := coalesce((p.rule_snapshot #>> '{turnover_threshold_low,value}')::numeric, 0);
    threshold_high := coalesce((p.rule_snapshot #>> '{turnover_threshold_high,value}')::numeric, 0);
    if new.annual_turnover_previous_fy <= threshold_low then
      cap_amount := coalesce((p.rule_snapshot #>> '{late_fee_cap_low,value}')::numeric, 0);
    elsif new.annual_turnover_previous_fy <= threshold_high then
      cap_amount := coalesce((p.rule_snapshot #>> '{late_fee_cap_mid,value}')::numeric, 0);
    else
      cap_amount := coalesce((p.rule_snapshot #>> '{late_fee_cap_high,value}')::numeric, 0);
    end if;
    update public.filing_payments
      set turnover_snapshot = new.annual_turnover_previous_fy,
        turnover_required = false,
        late_fee_due = case
          when coalesce((rule_snapshot ->> 'all_confirmed')::boolean, false)
            then least(
              greatest(0, filed_on - due_date)
                * coalesce((rule_snapshot #>> '{late_fee_per_day,value}')::numeric, 0),
              cap_amount
            )
          else 0
        end,
        updated_at = now()
      where id = p.id
      returning late_fee_due into updated_late_fee;
    insert into public.gst_payment_audit (filing_payment_id, action, details, actor_id)
    values (p.id, 'turnover_recorded', jsonb_build_object(
      'previous_fy_turnover', new.annual_turnover_previous_fy,
      'late_fee_cap', cap_amount
    ), auth.uid());
    if updated_late_fee > 0 then
      perform public.gst_queue_payment_notification(p.id, 'late_fee_applied', current_date);
    end if;
    perform public.gst_refresh_status(p.id);
  end loop;
  return new;
end
$$;
create trigger trg_apply_gst_client_turnover
  after update of annual_turnover_previous_fy on public.clients
  for each row execute function public.apply_gst_client_turnover();

revoke all on function public.gst_rules_for_firm(uuid, date) from public, anon;
revoke all on function public.gst_queue_payment_notification(uuid, text, date) from public, anon;
revoke all on function public.gst_queue_overdue_notifications() from public, anon;
revoke all on function public.mark_gst_notification_read(uuid) from public, anon;
revoke all on function public.gst_can_access_payment(uuid) from public, anon;
revoke all on function public.gst_payment_path_id(text) from public, anon;
revoke all on function public.gst_payment_summary(uuid, date) from public, anon;
revoke all on function public.gst_file_filing() from public, anon;
revoke all on function public.gst_guard_filing_completion() from public, anon;
revoke all on function public.record_gst_payment(uuid, numeric, date, text, text, text, boolean) from public, anon;
revoke all on function public.gst_refresh_status(uuid) from public, anon;
revoke all on function public.gst_payment_transaction_added() from public, anon;
revoke all on function public.verify_gst_payment_proof(uuid, text) from public, anon;
revoke all on function public.override_gst_payment(uuid, text, numeric, text) from public, anon;
revoke all on function public.publish_gst_rule(text, numeric, numeric, text, date, text, date, boolean) from public, anon;
revoke all on function public.set_gst_client_turnover(uuid, numeric) from public, anon;
revoke all on function public.apply_gst_client_turnover() from public, anon;
grant execute on function public.gst_payment_summary(uuid, date) to authenticated;
grant execute on function public.gst_queue_overdue_notifications() to service_role;
grant execute on function public.mark_gst_notification_read(uuid) to authenticated;
grant execute on function public.gst_can_access_payment(uuid) to authenticated;
grant execute on function public.gst_payment_path_id(text) to authenticated;
grant execute on function public.record_gst_payment(uuid, numeric, date, text, text, text, boolean) to authenticated;
grant execute on function public.override_gst_payment(uuid, text, numeric, text) to authenticated;
grant execute on function public.publish_gst_rule(text, numeric, numeric, text, date, text, date, boolean) to authenticated;
grant execute on function public.set_gst_client_turnover(uuid, numeric) to authenticated;
grant execute on function public.verify_gst_payment_proof(uuid, text) to authenticated;
