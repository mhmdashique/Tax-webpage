-- Create a client profile automatically when a user is approved

-- 1. Trigger function to auto-create a client row
CREATE OR REPLACE FUNCTION public.auto_create_client_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_firm_id uuid;
BEGIN
  -- Only act if the user is a client and just got approved
  IF NEW.role = 'client' AND NEW.approval_status = 'approved' AND OLD.approval_status = 'pending' THEN
    
    -- Ensure we have a firm to attach to
    SELECT id INTO v_firm_id FROM public.firms LIMIT 1;
    IF v_firm_id IS NULL THEN
      INSERT INTO public.firms (name) VALUES ('Default Firm') RETURNING id INTO v_firm_id;
    END IF;

    -- Check if client already exists
    IF NOT EXISTS (SELECT 1 FROM public.clients WHERE linked_user_id = NEW.id) THEN
      INSERT INTO public.clients (firm_id, name, type, linked_user_id)
      VALUES (v_firm_id, COALESCE(NEW.name, 'Client Profile'), 'individual', NEW.id);
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2. Attach the trigger to public.users
DROP TRIGGER IF EXISTS trg_auto_create_client ON public.users;
CREATE TRIGGER trg_auto_create_client
  AFTER UPDATE OF approval_status ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_client_on_approval();

-- 3. Backfill: create client rows for existing approved clients
DO $$
DECLARE
  v_firm_id uuid;
  u record;
BEGIN
  SELECT id INTO v_firm_id FROM public.firms LIMIT 1;
  IF v_firm_id IS NULL THEN
    INSERT INTO public.firms (name) VALUES ('Default Firm') RETURNING id INTO v_firm_id;
  END IF;

  FOR u IN 
    SELECT id, name FROM public.users 
    WHERE role = 'client' AND approval_status = 'approved'
    AND id NOT IN (SELECT linked_user_id FROM public.clients WHERE linked_user_id IS NOT NULL)
  LOOP
    INSERT INTO public.clients (firm_id, name, type, linked_user_id)
    VALUES (v_firm_id, COALESCE(u.name, 'Client Profile'), 'individual', u.id);
  END LOOP;
END $$;
