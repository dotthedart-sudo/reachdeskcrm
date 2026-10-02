-- 2. Create helper function for RLS
CREATE OR REPLACE FUNCTION public.viewer_can_view_team_revenue(p_viewer uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id uuid;
  v_owner_id uuid;
  v_flag boolean;
BEGIN
  IF p_viewer IS NULL THEN RETURN false; END IF;

  SELECT team_id
  INTO v_team_id
  FROM public.user_profiles
  WHERE id = p_viewer;

  IF v_team_id IS NULL THEN RETURN false; END IF;

  SELECT owner_id, members_can_view_revenue 
  INTO v_owner_id, v_flag
  FROM public.teams
  WHERE id = v_team_id;

  IF v_owner_id = p_viewer THEN RETURN true; END IF;

  RETURN COALESCE(v_flag, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.viewer_can_view_team_revenue(uuid) TO authenticated;

-- 3. Update RLS on revenue_entries for SELECT access
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'revenue_entries' AND policyname = 'revenue_entries_select_team'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.revenue_entries', r.policyname);
  END LOOP;
END $$;

ALTER TABLE public.revenue_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY revenue_entries_select_team ON public.revenue_entries FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (
    public.viewer_can_view_team_revenue(auth.uid())
    AND user_id IN (SELECT public.viewer_team_member_ids(auth.uid()))
  )
);
