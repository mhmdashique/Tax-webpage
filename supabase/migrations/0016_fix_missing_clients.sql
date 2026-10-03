-- Fix missing client profiles for users with role 'client'

DO $$
DECLARE
  v_firm_id uuid;
  u record;
BEGIN
  -- Get the primary firm ID (assuming there's only one firm right now)
  select id into v_firm_id from public.firms limit 1;

  FOR u IN 
    select id, raw_user_meta_data->>'full_name' as name, email 
    from auth.users 
    where id in (select id from public.users where role = 'client')
    and id not in (select linked_user_id from public.clients where linked_user_id is not null)
  LOOP
    insert into public.clients (firm_id, name, type, linked_user_id)
    values (v_firm_id, coalesce(u.name, 'Client ' || substr(u.id::text, 1, 8)), 'individual', u.id);
  END LOOP;
END $$;
