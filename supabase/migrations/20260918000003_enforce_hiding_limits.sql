-- 1. Drop old UPDATE blocking triggers
DROP TRIGGER IF EXISTS trg_leads_lock ON leads;
DROP TRIGGER IF EXISTS trg_templates_lock ON templates;
DROP TRIGGER IF EXISTS trg_folders_lock ON folders;

-- 2. STABLE composite cutoff function
CREATE OR REPLACE FUNCTION public.get_resource_cutoff(p_user_id uuid, p_resource_type text, OUT cutoff_ts timestamptz, OUT cutoff_id uuid)
RETURNS record
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_max integer;
BEGIN
  v_plan := get_user_plan_context(p_user_id)->>'plan';

  IF p_resource_type = 'leads' THEN
    SELECT max_leads INTO v_max FROM plan_limits WHERE plan = v_plan;
    IF v_max IS NOT NULL THEN
      SELECT created_at, id INTO cutoff_ts, cutoff_id FROM leads 
      WHERE user_id = p_user_id ORDER BY created_at DESC, id DESC OFFSET (v_max - 1) LIMIT 1;
    END IF;
  ELSIF p_resource_type = 'templates' THEN
    SELECT max_templates INTO v_max FROM plan_limits WHERE plan = v_plan;
    IF v_max IS NOT NULL THEN
      SELECT created_at, id INTO cutoff_ts, cutoff_id FROM templates 
      WHERE user_id = p_user_id AND is_starter IS NOT TRUE ORDER BY created_at DESC, id DESC OFFSET (v_max - 1) LIMIT 1;
    END IF;
  ELSIF p_resource_type = 'folders' THEN
    SELECT max_folders INTO v_max FROM plan_limits WHERE plan = v_plan;
    IF v_max IS NOT NULL THEN
      SELECT created_at, id INTO cutoff_ts, cutoff_id FROM folders 
      WHERE user_id = p_user_id ORDER BY created_at DESC, id DESC OFFSET (v_max - 1) LIMIT 1;
    END IF;
  END IF;

  -- Fallback to ensure the inequality check always evaluates to TRUE if there's no limit
  IF cutoff_ts IS NULL THEN
    cutoff_ts := '1970-01-01'::timestamptz;
    cutoff_id := '00000000-0000-0000-0000-000000000000'::uuid;
  END IF;
END;
$$;

-- 3. Scoped AS RESTRICTIVE Policies (using IS DISTINCT FROM for NULL user_id safety)
CREATE POLICY enforce_hiding_leads ON leads AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  user_id IS DISTINCT FROM auth.uid() OR
  (created_at, id) >= (SELECT cutoff_ts, cutoff_id FROM public.get_resource_cutoff(auth.uid(), 'leads'))
);

CREATE POLICY enforce_hiding_templates ON templates AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  user_id IS DISTINCT FROM auth.uid() OR
  is_starter IS TRUE OR
  (created_at, id) >= (SELECT cutoff_ts, cutoff_id FROM public.get_resource_cutoff(auth.uid(), 'templates'))
);

CREATE POLICY enforce_hiding_folders ON folders AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  user_id IS DISTINCT FROM auth.uid() OR
  (created_at, id) >= (SELECT cutoff_ts, cutoff_id FROM public.get_resource_cutoff(auth.uid(), 'folders'))
);

-- 4. Export & Count Bypasses (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.export_my_leads() RETURNS SETOF leads LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM leads WHERE user_id = auth.uid() ORDER BY created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.export_my_notes() RETURNS SETOF notes LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM notes WHERE user_id = auth.uid() ORDER BY updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_my_resource_counts() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_leads_total integer;
  v_templates_total integer;
  v_folders_total integer;
BEGIN
  SELECT COUNT(*) INTO v_leads_total FROM leads WHERE user_id = auth.uid();
  SELECT COUNT(*) INTO v_templates_total FROM templates WHERE user_id = auth.uid();
  SELECT COUNT(*) INTO v_folders_total FROM folders WHERE user_id = auth.uid();
  RETURN jsonb_build_object('leads', v_leads_total, 'templates', v_templates_total, 'folders', v_folders_total);
END;
$$;

-- 5. Revoke/Grant Permissions
REVOKE EXECUTE ON FUNCTION public.get_resource_cutoff(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_resource_cutoff(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.export_my_leads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_my_leads() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.export_my_notes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_my_notes() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_resource_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_resource_counts() TO authenticated;

-- 6. Audit Log & Deletion Function
CREATE TABLE IF NOT EXISTS public.deletion_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  leads_deleted integer NOT NULL,
  notes_deleted integer NOT NULL,
  templates_deleted integer NOT NULL,
  folders_deleted integer NOT NULL,
  deleted_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.deletion_audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.delete_all_my_data() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_leads int; v_notes int; v_templates int; v_folders int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Peripheral tables
  DELETE FROM lead_call_attempts WHERE user_id = v_uid;
  DELETE FROM lead_timeline_events WHERE user_id = v_uid;
  DELETE FROM planned_outreach_tasks WHERE user_id = v_uid;
  DELETE FROM folder_shares WHERE shared_by_user_id = v_uid;
  DELETE FROM user_folders WHERE user_id = v_uid;
  DELETE FROM user_snippets WHERE user_id = v_uid;
  DELETE FROM custom_channels WHERE user_id = v_uid;
  DELETE FROM custom_call_outcomes WHERE user_id = v_uid;
  DELETE FROM lead_activity WHERE user_id = v_uid;
  DELETE FROM lead_notes WHERE user_id = v_uid;
  DELETE FROM lead_note_versions WHERE user_id = v_uid;
  DELETE FROM note_versions WHERE user_id = v_uid;
  DELETE FROM outreach_log WHERE user_id = v_uid;
  DELETE FROM follow_up_reminders WHERE user_id = v_uid;
  DELETE FROM csv_imports WHERE user_id = v_uid;
  DELETE FROM user_notifications WHERE user_id = v_uid;

  -- Core tables
  WITH deleted AS (DELETE FROM leads WHERE user_id = v_uid RETURNING 1) SELECT count(*) INTO v_leads FROM deleted;
  WITH deleted AS (DELETE FROM notes WHERE user_id = v_uid RETURNING 1) SELECT count(*) INTO v_notes FROM deleted;
  WITH deleted AS (DELETE FROM templates WHERE user_id = v_uid RETURNING 1) SELECT count(*) INTO v_templates FROM deleted;
  WITH deleted AS (DELETE FROM folders WHERE user_id = v_uid RETURNING 1) SELECT count(*) INTO v_folders FROM deleted;

  INSERT INTO deletion_audit_log (user_id, leads_deleted, notes_deleted, templates_deleted, folders_deleted)
  VALUES (v_uid, v_leads, v_notes, v_templates, v_folders);

  RETURN jsonb_build_object('success', true, 'leads', v_leads, 'notes', v_notes, 'templates', v_templates, 'folders', v_folders);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_all_my_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_all_my_data() TO authenticated;
