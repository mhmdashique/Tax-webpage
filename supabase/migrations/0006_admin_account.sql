-- Create the one designated Admin account
-- Run this ONCE in Supabase SQL Editor after running 0001–0005 migrations.

do $$
declare
  v_user_id uuid;
  v_firm_id uuid := '11111111-1111-1111-1111-111111111111';
begin
  -- Create firm if not exists
  insert into public.firms (id, name, plan_tier)
  values (v_firm_id, 'Apex Tax Advisors', 'pro')
  on conflict (id) do nothing;

  -- Check if auth user already exists
  select id into v_user_id from auth.users where email = 'admintax@gmail.com';

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      role,
      aud,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) values (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'admintax@gmail.com',
      crypt('admin@2026', gen_salt('bf')),
      now(),
      'authenticated',
      'authenticated',
      now(),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"name":"Admin","role":"admin"}',
      false,
      '', '', '', ''
    );
  end if;

  -- Create public profile with admin role
  insert into public.users (id, firm_id, email, name, role)
  values (v_user_id, v_firm_id, 'admintax@gmail.com', 'Admin', 'admin')
  on conflict (id) do update set role = 'admin', firm_id = v_firm_id;

end $$;
