-- Fix for the "Missing Client Profile" issue

CREATE OR REPLACE FUNCTION public.fix_my_client_profile()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER -- Runs as admin to bypass RLS
AS $$
DECLARE
  v_user_id uuid;
  v_firm_id uuid;
  v_client_id uuid;
BEGIN
  -- Get the logged-in user's ID
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN 'You must be logged in to run this fix.';
  END IF;

  -- 1. Ensure a firm exists
  SELECT id INTO v_firm_id FROM public.firms LIMIT 1;
  IF v_firm_id IS NULL THEN
    INSERT INTO public.firms (name) VALUES ('Default Firm') RETURNING id INTO v_firm_id;
  END IF;

  -- 2. Check if the user already has a client profile
  SELECT id INTO v_client_id FROM public.clients WHERE linked_user_id = v_user_id LIMIT 1;

  -- 3. If they don't have one, create it!
  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (firm_id, name, type, linked_user_id)
    VALUES (v_firm_id, 'My Client Profile', 'individual', v_user_id)
    RETURNING id INTO v_client_id;
    
    RETURN 'SUCCESS: Created a new Client Profile for you!';
  END IF;

  RETURN 'SUCCESS: You already had a Client Profile (ID: ' || v_client_id || ').';
END;
$$;
