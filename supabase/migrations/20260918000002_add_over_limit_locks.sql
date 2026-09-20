-- 1. Create function to get cutoff date for a resource
CREATE OR REPLACE FUNCTION public.get_resource_cutoff(p_user_id uuid, p_resource_type text)
RETURNS timestamp with time zone
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_max_leads integer;
  v_max_templates integer;
  v_max_lists integer;
  v_cutoff timestamp with time zone;
BEGIN
  v_plan := get_user_plan_context(p_user_id)->>'plan';

  IF p_resource_type = 'leads' THEN
    SELECT max_leads INTO v_max_leads FROM plan_limits WHERE plan_name = v_plan;
    IF v_max_leads IS NULL THEN RETURN NULL; END IF;
    SELECT created_at INTO v_cutoff
    FROM leads
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    OFFSET (v_max_leads - 1) LIMIT 1;

  ELSIF p_resource_type = 'templates' THEN
    SELECT max_templates INTO v_max_templates FROM plan_limits WHERE plan_name = v_plan;
    IF v_max_templates IS NULL THEN RETURN NULL; END IF;
    SELECT created_at INTO v_cutoff
    FROM templates
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    OFFSET (v_max_templates - 1) LIMIT 1;

  ELSIF p_resource_type = 'lists' THEN
    SELECT max_lists INTO v_max_lists FROM plan_limits WHERE plan_name = v_plan;
    IF v_max_lists IS NULL THEN RETURN NULL; END IF;
    SELECT created_at INTO v_cutoff
    FROM folders
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    OFFSET (v_max_lists - 1) LIMIT 1;
  END IF;

  RETURN v_cutoff;
END;
$$;

-- 2. Create generic trigger function to enforce locks
CREATE OR REPLACE FUNCTION public.trg_enforce_resource_locks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cutoff timestamp with time zone;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_cutoff := get_resource_cutoff(OLD.user_id, TG_ARGV[0]);
    IF v_cutoff IS NOT NULL AND OLD.created_at < v_cutoff THEN
      RAISE EXCEPTION 'Item is locked because you have exceeded your plan limits. Please upgrade to unlock.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 3. Apply triggers
DROP TRIGGER IF EXISTS trg_leads_lock ON leads;
CREATE TRIGGER trg_leads_lock
BEFORE UPDATE ON leads
FOR EACH ROW EXECUTE FUNCTION trg_enforce_resource_locks('leads');

DROP TRIGGER IF EXISTS trg_templates_lock ON templates;
CREATE TRIGGER trg_templates_lock
BEFORE UPDATE ON templates
FOR EACH ROW EXECUTE FUNCTION trg_enforce_resource_locks('templates');

DROP TRIGGER IF EXISTS trg_folders_lock ON folders;
CREATE TRIGGER trg_folders_lock
BEFORE UPDATE ON folders
FOR EACH ROW EXECUTE FUNCTION trg_enforce_resource_locks('lists');
