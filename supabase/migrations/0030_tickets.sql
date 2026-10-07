-- Help & Support tickets (0030)
-- Roles: Client, Employee, Admin. Visibility + close rules enforced in API;
-- RLS below mirrors the same rules for direct Supabase access.

create sequence if not exists ticket_seq_emp start 1;
create sequence if not exists ticket_seq_clt start 1;

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_no text unique not null,
  firm_id uuid references firms(id) on delete cascade,
  created_by_id uuid references users(id) on delete set null,
  created_by_role text not null check (created_by_role in ('client','employee','admin')),
  client_id uuid references clients(id) on delete set null,
  project_label text,
  subject text not null check (char_length(subject) >= 5),
  category text not null,
  priority text not null default 'Medium' check (priority in ('Low','Medium','High','Urgent')),
  description text not null check (char_length(description) >= 1),
  status text not null default 'Open' check (status in ('Open','In Progress','On Hold','Resolved','Closed','Reopened')),
  assigned_to uuid references users(id) on delete set null,
  attachment_url text,
  attachment_name text,
  closed_by uuid references users(id) on delete set null,
  closed_at timestamptz,
  closing_remark text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references tickets(id) on delete cascade not null,
  user_id uuid references users(id) on delete set null,
  message text not null check (char_length(message) >= 1),
  is_internal boolean default false,
  created_at timestamptz default now()
);

create table if not exists ticket_history (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references tickets(id) on delete cascade not null,
  action text not null,
  old_value text,
  new_value text,
  changed_by uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

-- Auto ticket numbers: EMP-0001 / CLT-0001 (admin-created defaults to CLT range)
create or replace function public.set_ticket_no() returns trigger language plpgsql as $$
begin
  if new.ticket_no is null or new.ticket_no = '' then
    if new.created_by_role = 'employee' then
      new.ticket_no := 'EMP-' || lpad(nextval('ticket_seq_emp')::text, 4, '0');
    else
      new.ticket_no := 'CLT-' || lpad(nextval('ticket_seq_clt')::text, 4, '0');
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_tickets_no on tickets;
create trigger trg_tickets_no before insert or update on tickets
  for each row execute function public.set_ticket_no();

create index if not exists idx_tickets_firm on tickets(firm_id);
create index if not exists idx_tickets_creator on tickets(created_by_id);
create index if not exists idx_tickets_assigned on tickets(assigned_to);
create index if not exists idx_tickets_status on tickets(status);
create index if not exists idx_tickets_no on tickets(ticket_no);
create index if not exists idx_ticket_comments_ticket on ticket_comments(ticket_id);
create index if not exists idx_ticket_history_ticket on ticket_history(ticket_id);

alter table tickets enable row level security;
alter table ticket_comments enable row level security;
alter table ticket_history enable row level security;

-- Tickets RLS (mirrors API rules; service-role bypasses RLS)
drop policy if exists "tickets admin all" on tickets;
create policy "tickets admin all" on tickets for all
  using (firm_id = public.my_firm_id() and public.my_role() = 'admin')
  with check (firm_id = public.my_firm_id());

drop policy if exists "tickets creator own" on tickets;
create policy "tickets creator own" on tickets for select
  using (created_by_id = auth.uid());

drop policy if exists "tickets creator insert" on tickets;
create policy "tickets creator insert" on tickets for insert
  with check (created_by_id = auth.uid() and firm_id = public.my_firm_id());

drop policy if exists "tickets creator update own" on tickets;
create policy "tickets creator update own" on tickets for update
  using (created_by_id = auth.uid())
  with check (created_by_id = auth.uid());

-- Employees see client-created tickets (support pool) + their own
drop policy if exists "tickets employee client pool" on tickets;
create policy "tickets employee client pool" on tickets for select
  using (
    public.my_role() = 'employee'
    and firm_id = public.my_firm_id()
    and (created_by_role = 'client' or created_by_id = auth.uid() or assigned_to = auth.uid())
  );

drop policy if exists "tickets employee update client" on tickets;
create policy "tickets employee update client" on tickets for update
  using (
    public.my_role() = 'employee'
    and (created_by_role = 'client' and (assigned_to = auth.uid() or assigned_to is null))
  )
  with check (public.my_role() = 'employee');

-- Comments: visible to anyone who can see the ticket; clients never write internal
drop policy if exists "ticket_comments firm read" on ticket_comments;
create policy "ticket_comments firm read" on ticket_comments for select
  using (
    ticket_id in (
      select id from tickets
      where created_by_id = auth.uid()
         or assigned_to = auth.uid()
         or (created_by_role = 'client' and public.my_role() = 'employee' and firm_id = public.my_firm_id())
         or (firm_id = public.my_firm_id() and public.my_role() = 'admin')
    )
  );

drop policy if exists "ticket_comments member insert" on ticket_comments;
create policy "ticket_comments member insert" on ticket_comments for insert
  with check (
    ticket_id in (select id from tickets where created_by_id = auth.uid() or assigned_to = auth.uid()
      or (created_by_role = 'client' and public.my_role() = 'employee' and firm_id = public.my_firm_id())
      or (firm_id = public.my_firm_id() and public.my_role() = 'admin'))
    and (public.my_role() in ('admin','employee') or is_internal = false)
  );

-- History: read alongside ticket; inserts via service role / members
drop policy if exists "ticket_history firm read" on ticket_history;
create policy "ticket_history firm read" on ticket_history for select
  using (
    ticket_id in (
      select id from tickets
      where created_by_id = auth.uid()
         or assigned_to = auth.uid()
         or (created_by_role = 'client' and public.my_role() = 'employee' and firm_id = public.my_firm_id())
         or (firm_id = public.my_firm_id() and public.my_role() = 'admin')
    )
  );

drop policy if exists "ticket_history member insert" on ticket_history;
create policy "ticket_history member insert" on ticket_history for insert
  with check (true);

-- Storage bucket for attachments (5 MB / image+PDF enforced in API + UI)
insert into storage.buckets (id, name, public) values ('ticket-attachments','ticket-attachments', false)
on conflict (id) do nothing;

drop policy if exists "ticket attachments firm read" on storage.objects;
create policy "ticket attachments firm read" on storage.objects for select
  using (bucket_id = 'ticket-attachments');

drop policy if exists "ticket attachments member upload" on storage.objects;
create policy "ticket attachments member upload" on storage.objects for insert
  with check (bucket_id = 'ticket-attachments');
