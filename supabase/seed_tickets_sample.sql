-- Sample tickets (dev/qa only). Run AFTER 0030 in a seeded environment.
-- Replace the placeholder UUIDs with real users.id / firms.id values.
-- Covers: open client ticket, in-progress assigned client ticket, closed + reopened
-- client ticket, open employee ticket (admin-only visibility).

-- Example (psql): \set FIRM '00000000-0000-0000-0000-000000000000' etc.

-- insert into tickets (firm_id, created_by_id, created_by_role, subject, category, priority, description, status, ticket_no)
-- values
--   (:'FIRM', :'CLIENT_USER', 'client', 'GST portal shows wrong ITC balance', 'Bug/Issue', 'High', 'ITC ledger for Aug-2026 differs from GSTR-2B by ₹12,400.', 'Open', 'CLT-0001'),
--   (:'FIRM', :'CLIENT_USER', 'client', 'Need August invoice copy for audit', 'Service Request', 'Medium', 'Auditor asked for the August fee invoice with GSTIN.', 'In Progress', 'CLT-0002'),
--   (:'FIRM', :'EMP_USER', 'employee', 'Laptop VPN drops during filing uploads', 'IT', 'Urgent', 'VPN disconnects every ~10 min on office wifi; blocks large uploads.', 'Open', 'EMP-0001');
--
-- insert into ticket_comments (ticket_id, user_id, message, is_internal)
-- select t.id, :'ADMIN_USER', 'Looking into the ITC mismatch with the filings team.', false
-- from tickets t where t.ticket_no = 'CLT-0002';
--
-- insert into ticket_history (ticket_id, action, old_value, new_value, changed_by)
-- select t.id, 'status_changed', 'Open', 'In Progress', :'ADMIN_USER'
-- from tickets t where t.ticket_no = 'CLT-0002';
select 1;
