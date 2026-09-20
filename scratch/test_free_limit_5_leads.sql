BEGIN;

-- Create a dummy free user
INSERT INTO auth.users (id, email) VALUES ('11111111-1111-1111-1111-111111111111', 'test_free_user@example.com');
INSERT INTO public.profiles (id, email, active_plan) VALUES ('11111111-1111-1111-1111-111111111111', 'test_free_user@example.com', 'free');

-- Insert 5 leads for this user (which is under the 100 limit)
INSERT INTO public.leads (user_id, email, first_name, status, created_at) VALUES 
  ('11111111-1111-1111-1111-111111111111', 'l1@test.com', '1', 'Lead', now() - interval '5 days'),
  ('11111111-1111-1111-1111-111111111111', 'l2@test.com', '2', 'Lead', now() - interval '4 days'),
  ('11111111-1111-1111-1111-111111111111', 'l3@test.com', '3', 'Lead', now() - interval '3 days'),
  ('11111111-1111-1111-1111-111111111111', 'l4@test.com', '4', 'Lead', now() - interval '2 days'),
  ('11111111-1111-1111-1111-111111111111', 'l5@test.com', '5', 'Lead', now() - interval '1 days');

DO $$
DECLARE
  v_cutoff timestamp with time zone;
BEGIN
  v_cutoff := get_resource_cutoff('11111111-1111-1111-1111-111111111111', 'leads');
  
  IF v_cutoff IS NULL THEN
    RAISE NOTICE 'SUCCESS: Cutoff is NULL for user with 5 leads (limit 100). No items locked.';
  ELSE
    RAISE EXCEPTION 'FAILURE: Cutoff should be NULL, but was %', v_cutoff;
  END IF;
END $$;

ROLLBACK;
