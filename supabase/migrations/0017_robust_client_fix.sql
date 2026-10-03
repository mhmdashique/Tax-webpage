-- Robust fix to ensure a Firm and Client profile exists

DO $$
DECLARE
  v_firm_id uuid;
  u record;
BEGIN
  -- 1. Ensure at least one firm exists
  select id into v_firm_id from public.firms limit 1;
  
  if v_firm_id is null then
    insert into public.firms (name) values ('Default Firm') returning id into v_firm_id;
  end if;

  -- 2. Create client profiles for anyone marked as a client who doesn't have one
  FOR u IN 
    select id, raw_user_meta_data->>'full_name' as name, email 
    from auth.users 
    where id in (select id from public.users where role ilike 'client')
    and id not in (select coalesce(linked_user_id, '00000000-0000-0000-0000-000000000000') from public.clients)
  LOOP
    BEGIN
      insert into public.clients (firm_id, name, type, linked_user_id)
      values (v_firm_id, coalesce(u.name, split_part(u.email, '@', 1), 'Client'), 'individual', u.id);
    EXCEPTION WHEN others THEN
      -- Ignore any unique constraint issues and proceed
    END;
  END LOOP;
END $$;
