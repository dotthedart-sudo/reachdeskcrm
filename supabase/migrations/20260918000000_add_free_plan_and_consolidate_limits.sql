-- Migration: Consolidate Plan Limits and Implement Free Tier

-- 1. Update user_profiles check constraint
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_plan_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_plan_check CHECK (plan IN ('free', 'trial', 'starter', 'pro', 'teams', 'enterprise', 'lifetime'));


-- 2. Expand plan_limits table
ALTER TABLE public.plan_limits
  ADD COLUMN IF NOT EXISTS max_folders integer,
  ADD COLUMN IF NOT EXISTS ai_credits integer,
  ADD COLUMN IF NOT EXISTS max_users integer,
  ADD COLUMN IF NOT EXISTS calendar_integration boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sheets_integration boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bulk_import boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_lists boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_extension_captures integer,
  ADD COLUMN IF NOT EXISTS max_leads_yearly integer;

-- 3. Insert/Update plan_limits
INSERT INTO public.plan_limits 
  (plan, max_leads, max_leads_yearly, max_templates, max_folders, ai_credits, max_users, calendar_integration, sheets_integration, bulk_import, auto_lists, max_extension_captures) 
VALUES
  ('free', 100, 100, 3, 1, 0, 1, false, false, true, false, 25),
  ('trial', 50, 50, 5, NULL, 20, 1, true, true, true, true, NULL),
  ('starter', 750, 2000, 10, NULL, 0, 1, false, true, true, true, NULL),
  ('pro', 5000, 10000, 50, NULL, 500, 1, true, true, true, true, NULL),
  ('teams', NULL, NULL, NULL, NULL, 500, 5, true, true, true, true, NULL),
  ('enterprise', NULL, NULL, NULL, NULL, NULL, NULL, true, true, true, true, NULL),
  ('lifetime', NULL, NULL, NULL, NULL, NULL, NULL, true, true, true, true, NULL)
ON CONFLICT (plan) DO UPDATE SET
  max_leads = EXCLUDED.max_leads,
  max_leads_yearly = EXCLUDED.max_leads_yearly,
  max_templates = EXCLUDED.max_templates,
  max_folders = EXCLUDED.max_folders,
  ai_credits = EXCLUDED.ai_credits,
  max_users = EXCLUDED.max_users,
  calendar_integration = EXCLUDED.calendar_integration,
  sheets_integration = EXCLUDED.sheets_integration,
  bulk_import = EXCLUDED.bulk_import,
  auto_lists = EXCLUDED.auto_lists,
  max_extension_captures = EXCLUDED.max_extension_captures;

-- Ensure RLS allows read for users, but block write
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read access" ON public.plan_limits;
CREATE POLICY "Allow read access" ON public.plan_limits FOR SELECT TO authenticated, anon USING (true);


-- 4. Re-write get_user_plan_context & helpers (Free logic inside)
CREATE OR REPLACE FUNCTION public._owner_workspace_is_active(
  p_owner_plan text,
  p_owner_plan_status text,
  p_owner_trial_ends_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p_owner_plan IS NULL OR p_owner_plan = '' OR p_owner_plan = 'free' THEN
    RETURN false;
  END IF;

  IF p_owner_plan IN ('teams', 'pro') THEN
    IF p_owner_plan_status IS NOT NULL AND p_owner_plan_status <> 'active' THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  IF p_owner_plan = 'trial' THEN
    IF p_owner_trial_ends_at IS NOT NULL AND p_owner_trial_ends_at < now() THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public._team_owner_plan_context(p_team_id uuid)
RETURNS TABLE(owner_plan text, owner_billing_cycle text, owner_plan_status text, owner_trial_ends_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT t.owner_id INTO v_owner_id
  FROM public.teams t
  WHERE t.id = p_team_id
  LIMIT 1;

  IF v_owner_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      lower(COALESCE(p.plan, '')),
      p.billing_cycle,
      p.plan_status,
      p.trial_ends_at
    FROM public.user_profiles p
    WHERE p.id = v_owner_id
    LIMIT 1;
    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    lower(COALESCE(p.plan, '')),
    p.billing_cycle,
    p.plan_status,
    p.trial_ends_at
  FROM public.user_profiles p
  WHERE p.team_id = p_team_id
    AND lower(COALESCE(p.team_role, '')) = 'owner'
  ORDER BY p.created_at ASC NULLS LAST
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_plan_context(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_team_id uuid;
  v_role text;
  v_own_plan text;
  v_own_billing text;
  v_own_plan_status text;
  v_own_trial timestamptz;
  v_own_paddle_status text;

  v_owner_plan text;
  v_owner_billing text;
  v_owner_status text;
  v_owner_trial timestamptz;
  
  v_final_plan text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('plan', 'free', 'billing_cycle', null, 'inherits_workspace', false);
  END IF;

  SELECT
    team_id,
    lower(COALESCE(team_role, 'owner')),
    lower(COALESCE(plan, 'trial')),
    billing_cycle,
    plan_status,
    trial_ends_at,
    paddle_subscription_status
  INTO v_team_id, v_role, v_own_plan, v_own_billing, v_own_plan_status, v_own_trial, v_own_paddle_status
  FROM public.user_profiles
  WHERE id = p_user_id;

  -- 4.1 Handle active team members
  IF v_team_id IS NOT NULL AND v_role = 'member' THEN
    SELECT owner_plan, owner_billing_cycle, owner_plan_status, owner_trial_ends_at
    INTO v_owner_plan, v_owner_billing, v_owner_status, v_owner_trial
    FROM public._team_owner_plan_context(v_team_id)
    LIMIT 1;

    IF public._owner_workspace_is_active(v_owner_plan, v_owner_status, v_owner_trial) THEN
      RETURN jsonb_build_object(
        'plan', v_owner_plan,
        'billing_cycle', v_owner_billing,
        'inherits_workspace', true
      );
    END IF;
  END IF;

  -- 4.2 Handle personal plan
  IF v_own_plan IN ('lifetime', 'enterprise') THEN
    v_final_plan := v_own_plan;
  ELSIF v_own_plan = 'trial' THEN
    IF v_own_trial IS NOT NULL AND v_own_trial < now() THEN
      v_final_plan := 'free';
    ELSE
      v_final_plan := 'trial';
    END IF;
  ELSIF v_own_paddle_status IN ('canceled', 'paused') THEN
    v_final_plan := 'free';
  ELSIF v_own_plan IN ('starter', 'pro', 'teams') AND v_own_plan_status IS DISTINCT FROM 'active' AND (v_own_paddle_status IS NULL OR v_own_paddle_status NOT IN ('active', 'past_due')) THEN
    v_final_plan := 'free';
  ELSE
    v_final_plan := COALESCE(v_own_plan, 'free');
  END IF;

  RETURN jsonb_build_object(
    'plan', v_final_plan,
    'billing_cycle', v_own_billing,
    'inherits_workspace', false
  );
END;
$$;


-- 5. Lock down functions
REVOKE EXECUTE ON FUNCTION public.get_user_plan_context(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_effective_plan_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_effective_billing_cycle_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_plan_context() FROM PUBLIC, anon;

-- Explicit grants
GRANT EXECUTE ON FUNCTION public.get_user_plan_context(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_effective_plan_for_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_effective_billing_cycle_for_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_plan_context() TO authenticated;


-- 6. Rewrite effective_plan_lead_limit (STABLE, uses plan_limits for yearly)
CREATE OR REPLACE FUNCTION public.effective_plan_lead_limit(p_plan text, p_billing_cycle text)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_plan text := LOWER(COALESCE(p_plan, ''));
  v_cycle text := LOWER(COALESCE(p_billing_cycle, ''));
  v_max integer;
  v_max_yearly integer;
BEGIN
  SELECT max_leads, max_leads_yearly INTO v_max, v_max_yearly
  FROM public.plan_limits
  WHERE plan = v_plan;

  IF v_max IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_cycle = 'yearly' THEN
    IF v_max_yearly IS NOT NULL THEN
      RETURN v_max_yearly;
    END IF;
    RETURN v_max * 2; -- Fallback logic just in case
  END IF;

  RETURN v_max;
END;
$$;


-- 7. Drop duplicate triggers
DROP TRIGGER IF EXISTS enforce_lead_limit ON public.leads;
DROP TRIGGER IF EXISTS enforce_template_limit ON public.templates;


-- 8. Create folders limit trigger
CREATE OR REPLACE FUNCTION public.check_folder_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_plan text;
  v_max_folders integer;
  v_current_count integer;
BEGIN
  v_effective_plan := public.get_effective_plan_for_user(NEW.user_id);

  SELECT max_folders INTO v_max_folders
  FROM public.plan_limits
  WHERE plan = v_effective_plan;

  IF v_max_folders IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM public.folders
  WHERE user_id = NEW.user_id;

  IF v_current_count >= v_max_folders THEN
    RAISE EXCEPTION 'List (folder) limit reached for your plan (%).', v_max_folders;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_folder_limit ON public.folders;
CREATE TRIGGER trg_check_folder_limit
BEFORE INSERT ON public.folders
FOR EACH ROW
EXECUTE FUNCTION public.check_folder_limit();


-- 9. Unlock users safely
UPDATE public.user_profiles
SET plan = 'free', account_locked = false
WHERE account_locked = true
  AND lock_reason IS NULL
  AND status IS DISTINCT FROM 'denied'
  AND plan_status IS DISTINCT FROM 'active'
  AND (paddle_subscription_status IS NULL OR paddle_subscription_status NOT IN ('active', 'past_due'))
  AND (team_role IS NULL OR team_role != 'member');

-- Unlock all team members locked by bug
UPDATE public.user_profiles
SET account_locked = false
WHERE account_locked = true
  AND lock_reason IS NULL
  AND status IS DISTINCT FROM 'denied'
  AND team_role = 'member';

-- MANUAL FIX FOR COMPED PRO YEARLY USER (DO NOT RUN AUTOMATICALLY)
-- UPDATE public.user_profiles SET account_locked = false WHERE id = '<comped pro user id>';
