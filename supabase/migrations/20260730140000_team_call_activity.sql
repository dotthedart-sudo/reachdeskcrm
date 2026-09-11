-- Teams call activity: sharing columns, member permissions, RLS, RPCs

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS call_activity_sharing text NOT NULL DEFAULT 'off'
    CHECK (call_activity_sharing IN ('off', 'all_members', 'selected_members')),
  ADD COLUMN IF NOT EXISTS call_notes_visible_to_team boolean NOT NULL DEFAULT false;

ALTER TABLE public.lead_call_attempts
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS note_visibility text NOT NULL DEFAULT 'team'
    CHECK (note_visibility IN ('private', 'team'));

CREATE INDEX IF NOT EXISTS idx_lead_call_attempts_team_created
  ON public.lead_call_attempts(team_id, created_at DESC)
  WHERE team_id IS NOT NULL;

-- Backfill team_id from caller profile
UPDATE public.lead_call_attempts a
SET team_id = p.team_id
FROM public.user_profiles p
WHERE a.user_id = p.id
  AND a.team_id IS NULL
  AND p.team_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.team_member_permissions (
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  can_view_team_call_activity boolean NOT NULL DEFAULT false,
  can_view_call_notes boolean NOT NULL DEFAULT false,
  PRIMARY KEY (team_id, user_id)
);

ALTER TABLE public.team_member_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_member_permissions_select ON public.team_member_permissions;
CREATE POLICY team_member_permissions_select
  ON public.team_member_permissions FOR SELECT TO authenticated
  USING (
    team_id IN (
      SELECT up.team_id FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.team_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS team_member_permissions_manage ON public.team_member_permissions;
CREATE POLICY team_member_permissions_manage
  ON public.team_member_permissions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.team_id = team_member_permissions.team_id
        AND lower(COALESCE(up.team_role, '')) = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.team_id = team_member_permissions.team_id
        AND lower(COALESCE(up.team_role, '')) = 'owner'
    )
  );

-- Auto-set team_id on insert
CREATE OR REPLACE FUNCTION public.set_call_attempt_team_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.team_id IS NULL THEN
    SELECT team_id INTO NEW.team_id
    FROM public.user_profiles
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_call_attempt_team_id ON public.lead_call_attempts;
CREATE TRIGGER trg_set_call_attempt_team_id
BEFORE INSERT ON public.lead_call_attempts
FOR EACH ROW EXECUTE FUNCTION public.set_call_attempt_team_id();

-- Permission helpers
CREATE OR REPLACE FUNCTION public.can_view_team_call_activity(p_viewer uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id uuid;
  v_role text;
  v_sharing text;
BEGIN
  IF p_viewer IS NULL THEN RETURN false; END IF;

  SELECT team_id, lower(COALESCE(team_role, 'owner'))
  INTO v_team_id, v_role
  FROM public.user_profiles WHERE id = p_viewer;

  IF v_team_id IS NULL THEN RETURN false; END IF;
  IF v_role = 'owner' THEN RETURN true; END IF;

  SELECT call_activity_sharing INTO v_sharing FROM public.teams WHERE id = v_team_id;
  IF v_sharing IS NULL OR v_sharing = 'off' THEN RETURN false; END IF;
  IF v_sharing = 'all_members' THEN RETURN true; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.team_member_permissions tmp
    WHERE tmp.team_id = v_team_id
      AND tmp.user_id = p_viewer
      AND tmp.can_view_team_call_activity = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_call_note(
  p_attempt public.lead_call_attempts,
  p_viewer uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_team_id uuid;
  v_global_notes boolean;
  v_member_notes boolean;
BEGIN
  IF p_viewer IS NULL THEN RETURN false; END IF;
  IF p_attempt.user_id = p_viewer THEN RETURN true; END IF;

  SELECT team_id, lower(COALESCE(team_role, 'owner'))
  INTO v_team_id, v_role
  FROM public.user_profiles WHERE id = p_viewer;

  IF v_role = 'owner' AND v_team_id = p_attempt.team_id THEN RETURN true; END IF;
  IF p_attempt.note_visibility = 'private' THEN RETURN false; END IF;

  SELECT call_notes_visible_to_team INTO v_global_notes
  FROM public.teams WHERE id = p_attempt.team_id;

  SELECT can_view_call_notes INTO v_member_notes
  FROM public.team_member_permissions
  WHERE team_id = p_attempt.team_id AND user_id = p_viewer;

  IF v_member_notes IS NOT NULL THEN RETURN v_member_notes; END IF;
  RETURN COALESCE(v_global_notes, false);
END;
$$;

-- Replace SELECT policy
DROP POLICY IF EXISTS lead_call_attempts_select_own ON public.lead_call_attempts;
DROP POLICY IF EXISTS lead_call_attempts_select_team ON public.lead_call_attempts;

CREATE POLICY lead_call_attempts_select
  ON public.lead_call_attempts FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      team_id IS NOT NULL
      AND team_id = (SELECT up.team_id FROM public.user_profiles up WHERE up.id = auth.uid())
      AND public.can_view_team_call_activity(auth.uid())
    )
  );

-- Team activity feed RPC
CREATE OR REPLACE FUNCTION public.get_team_call_activity(
  p_member_id uuid DEFAULT NULL,
  p_outcome text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit int DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  lead_id uuid,
  user_id uuid,
  outcome text,
  note text,
  note_visible boolean,
  created_at timestamptz,
  caller_name text,
  caller_email text,
  lead_first_name text,
  lead_last_name text,
  lead_email text,
  lead_phone text,
  lead_company text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_team_id uuid;
BEGIN
  SELECT team_id INTO v_team_id FROM public.user_profiles WHERE id = v_uid;
  IF v_team_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.lead_id,
    a.user_id,
    a.outcome,
    CASE WHEN public.can_view_call_note(a, v_uid) THEN a.note ELSE NULL END AS note,
    public.can_view_call_note(a, v_uid) AS note_visible,
    a.created_at,
    COALESCE(caller.full_name, split_part(caller.email, '@', 1)) AS caller_name,
    caller.email AS caller_email,
    l.first_name AS lead_first_name,
    l.last_name AS lead_last_name,
    l.email AS lead_email,
    l.phone AS lead_phone,
    l.company AS lead_company
  FROM public.lead_call_attempts a
  JOIN public.user_profiles caller ON caller.id = a.user_id
  LEFT JOIN public.leads l ON l.id = a.lead_id
  WHERE a.team_id = v_team_id
    AND (
      a.user_id = v_uid
      OR public.can_view_team_call_activity(v_uid)
    )
    AND (p_member_id IS NULL OR a.user_id = p_member_id)
    AND (p_outcome IS NULL OR a.outcome = p_outcome)
    AND (p_from IS NULL OR a.created_at >= p_from)
    AND (p_to IS NULL OR a.created_at <= p_to)
  ORDER BY a.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 500);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_lead_call_timeline(p_lead_id uuid)
RETURNS TABLE (
  id uuid,
  lead_id uuid,
  user_id uuid,
  outcome text,
  note text,
  note_visible boolean,
  note_visibility text,
  created_at timestamptz,
  caller_name text,
  caller_email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_team_id uuid;
BEGIN
  IF p_lead_id IS NULL THEN RETURN; END IF;

  SELECT team_id INTO v_team_id FROM public.user_profiles WHERE user_profiles.id = v_uid;

  RETURN QUERY
  SELECT
    a.id,
    a.lead_id,
    a.user_id,
    a.outcome,
    CASE WHEN public.can_view_call_note(a, v_uid) THEN a.note ELSE NULL END AS note,
    public.can_view_call_note(a, v_uid) AS note_visible,
    a.note_visibility,
    a.created_at,
    COALESCE(caller.full_name, split_part(caller.email, '@', 1)) AS caller_name,
    caller.email AS caller_email
  FROM public.lead_call_attempts a
  JOIN public.user_profiles caller ON caller.id = a.user_id
  WHERE a.lead_id = p_lead_id
    AND (
      a.user_id = v_uid
      OR (
        v_team_id IS NOT NULL
        AND a.team_id = v_team_id
        AND public.can_view_team_call_activity(v_uid)
      )
    )
  ORDER BY a.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_team_call_stats(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  caller_name text,
  call_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_team_id uuid;
BEGIN
  SELECT team_id INTO v_team_id FROM public.user_profiles WHERE id = v_uid;
  IF v_team_id IS NULL OR NOT public.can_view_team_call_activity(v_uid) THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    a.user_id,
    COALESCE(p.full_name, split_part(p.email, '@', 1)) AS caller_name,
    COUNT(*)::bigint AS call_count
  FROM public.lead_call_attempts a
  JOIN public.user_profiles p ON p.id = a.user_id
  WHERE a.team_id = v_team_id
    AND (p_from IS NULL OR a.created_at >= p_from)
    AND (p_to IS NULL OR a.created_at <= p_to)
  GROUP BY a.user_id, p.full_name, p.email
  ORDER BY call_count DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_team_call_activity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_call_activity(uuid, text, timestamptz, timestamptz, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lead_call_timeline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_call_stats(timestamptz, timestamptz) TO authenticated;
