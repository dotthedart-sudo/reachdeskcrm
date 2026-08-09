-- Teams as a shared workspace: shared pipeline + activity defaults ON,
-- assignee_id on lists/invoices, team_id on templates/notes/snippets,
-- team automation rules, members_can_view_invoices, and RLS updates.

-- ── 1. Defaults: shared pipeline + activity sharing ON ──────────────────────

ALTER TABLE public.teams
  ALTER COLUMN members_see_own_leads_only SET DEFAULT false;

UPDATE public.teams
SET members_see_own_leads_only = false
WHERE members_see_own_leads_only = true;

ALTER TABLE public.teams
  ALTER COLUMN call_activity_sharing SET DEFAULT 'all_members';

UPDATE public.teams
SET call_activity_sharing = 'all_members'
WHERE call_activity_sharing = 'off';

ALTER TABLE public.teams
  ALTER COLUMN calendar_activity_sharing SET DEFAULT 'all_members';

UPDATE public.teams
SET calendar_activity_sharing = 'all_members'
WHERE calendar_activity_sharing = 'off';

ALTER TABLE public.teams
  ALTER COLUMN call_notes_visible_to_team SET DEFAULT true;

UPDATE public.teams
SET call_notes_visible_to_team = true
WHERE call_notes_visible_to_team = false
  AND call_activity_sharing = 'all_members';

-- ── 2. Invoice visibility permission (default OFF — owner-controlled) ───────

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS members_can_view_invoices boolean NOT NULL DEFAULT false;

-- ── 3. Assigned to on CRM lists + invoices ──────────────────────────────────

ALTER TABLE public.folders
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.user_folders
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.folders
SET assignee_id = user_id
WHERE assignee_id IS NULL AND user_id IS NOT NULL;

UPDATE public.user_folders
SET assignee_id = user_id
WHERE assignee_id IS NULL AND user_id IS NOT NULL;

UPDATE public.invoices
SET assignee_id = user_id
WHERE assignee_id IS NULL AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_folders_assignee_id ON public.folders(assignee_id)
  WHERE assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_folders_assignee_id ON public.user_folders(assignee_id)
  WHERE assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_assignee_id ON public.invoices(assignee_id)
  WHERE assignee_id IS NOT NULL;

-- ── 4. team_id on templates / notes / snippets ──────────────────────────────

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE public.user_snippets
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

UPDATE public.templates t
SET team_id = p.team_id
FROM public.user_profiles p
WHERE t.user_id = p.id
  AND t.team_id IS NULL
  AND p.team_id IS NOT NULL;

UPDATE public.notes n
SET team_id = p.team_id
FROM public.user_profiles p
WHERE n.user_id = p.id
  AND n.team_id IS NULL
  AND p.team_id IS NOT NULL;

UPDATE public.user_snippets s
SET team_id = p.team_id
FROM public.user_profiles p
WHERE s.user_id = p.id
  AND s.team_id IS NULL
  AND p.team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_templates_team_id ON public.templates(team_id)
  WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_team_id ON public.notes(team_id)
  WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_snippets_team_id ON public.user_snippets(team_id)
  WHERE team_id IS NOT NULL;

-- Auto-set team_id on insert from creator profile
CREATE OR REPLACE FUNCTION public.set_row_team_id_from_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.team_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT team_id INTO NEW.team_id
    FROM public.user_profiles
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_templates_set_team_id ON public.templates;
CREATE TRIGGER trg_templates_set_team_id
  BEFORE INSERT ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.set_row_team_id_from_user();

DROP TRIGGER IF EXISTS trg_notes_set_team_id ON public.notes;
CREATE TRIGGER trg_notes_set_team_id
  BEFORE INSERT ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.set_row_team_id_from_user();

DROP TRIGGER IF EXISTS trg_user_snippets_set_team_id ON public.user_snippets;
CREATE TRIGGER trg_user_snippets_set_team_id
  BEFORE INSERT ON public.user_snippets
  FOR EACH ROW EXECUTE FUNCTION public.set_row_team_id_from_user();

-- ── 5. Team-owned automation rules ──────────────────────────────────────────

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS messaging_action_rules jsonb,
  ADD COLUMN IF NOT EXISTS call_status_rules jsonb,
  ADD COLUMN IF NOT EXISTS call_outcome_rules jsonb,
  ADD COLUMN IF NOT EXISTS call_suggestions_auto_apply boolean NOT NULL DEFAULT true;

-- Seed team rules from owner profile when team has none yet
UPDATE public.teams t
SET
  messaging_action_rules = COALESCE(t.messaging_action_rules, o.messaging_action_rules),
  call_status_rules = COALESCE(t.call_status_rules, o.call_status_rules),
  call_outcome_rules = COALESCE(t.call_outcome_rules, o.call_outcome_rules),
  call_suggestions_auto_apply = COALESCE(t.call_suggestions_auto_apply, o.call_suggestions_auto_apply, true)
FROM public.user_profiles o
WHERE o.id = t.owner_id
  AND (
    t.messaging_action_rules IS NULL
    OR t.call_status_rules IS NULL
    OR t.call_outcome_rules IS NULL
  );

COMMENT ON COLUMN public.teams.messaging_action_rules IS
  'Workspace overrides: [{ status, suggested_action }] for messaging pipeline';
COMMENT ON COLUMN public.teams.call_status_rules IS
  'Workspace overrides: [{ status, suggested_call_action, suggested_priority }]';
COMMENT ON COLUMN public.teams.call_outcome_rules IS
  'Workspace overrides: [{ outcome, suggested_call_status, suggested_call_action, suggested_priority }]';

-- ── 6. Helpers ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.viewer_team_member_ids(p_viewer uuid DEFAULT auth.uid())
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id
  FROM public.user_profiles v
  JOIN public.user_profiles m ON m.team_id = v.team_id
  WHERE v.id = p_viewer
    AND v.team_id IS NOT NULL
    AND m.team_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.viewer_can_view_team_invoices(p_viewer uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id uuid;
  v_role text;
  v_flag boolean;
BEGIN
  IF p_viewer IS NULL THEN RETURN false; END IF;

  SELECT team_id, lower(COALESCE(team_role, 'owner'))
  INTO v_team_id, v_role
  FROM public.user_profiles
  WHERE id = p_viewer;

  IF v_team_id IS NULL THEN RETURN false; END IF;
  IF v_role = 'owner' THEN RETURN true; END IF;

  SELECT members_can_view_invoices INTO v_flag
  FROM public.teams
  WHERE id = v_team_id;

  RETURN COALESCE(v_flag, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.viewer_same_team_id(p_team_id uuid, p_viewer uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = p_viewer
      AND up.team_id IS NOT NULL
      AND up.team_id = p_team_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.viewer_team_member_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.viewer_can_view_team_invoices(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.viewer_same_team_id(uuid, uuid) TO authenticated;

-- ── 7. Folders / user_folders SELECT: shared pipeline members can see team lists

DROP POLICY IF EXISTS folders_select_team ON folders;
CREATE POLICY folders_select_team ON folders FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_team_owner_of(user_id)
  OR public.folder_is_shared_with_user(id, auth.uid())
  OR (
    NOT public.viewer_team_sees_own_leads_only()
    AND user_id IN (SELECT public.viewer_team_member_ids(auth.uid()))
  )
);

DROP POLICY IF EXISTS user_folders_select_team ON user_folders;
CREATE POLICY user_folders_select_team ON user_folders FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_team_owner_of(user_id)
  OR (
    NOT public.viewer_team_sees_own_leads_only()
    AND user_id IN (SELECT public.viewer_team_member_ids(auth.uid()))
  )
);

-- Shared-pipeline teammates can update list metadata (incl. assignee_id)
DROP POLICY IF EXISTS folders_update_team ON folders;
CREATE POLICY folders_update_team ON folders FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_team_owner_of(user_id)
  OR (
    NOT public.viewer_team_sees_own_leads_only()
    AND user_id IN (SELECT public.viewer_team_member_ids(auth.uid()))
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_team_owner_of(user_id)
  OR (
    NOT public.viewer_team_sees_own_leads_only()
    AND user_id IN (SELECT public.viewer_team_member_ids(auth.uid()))
  )
);

DROP POLICY IF EXISTS user_folders_update_team ON user_folders;
CREATE POLICY user_folders_update_team ON user_folders FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_team_owner_of(user_id)
  OR (
    NOT public.viewer_team_sees_own_leads_only()
    AND user_id IN (SELECT public.viewer_team_member_ids(auth.uid()))
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_team_owner_of(user_id)
  OR (
    NOT public.viewer_team_sees_own_leads_only()
    AND user_id IN (SELECT public.viewer_team_member_ids(auth.uid()))
  )
);

-- ── 8. Invoices SELECT/UPDATE gated by members_can_view_invoices ──────────

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invoices'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.invoices', r.policyname);
  END LOOP;
END $$;

CREATE POLICY invoices_select_team ON invoices FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (
    public.viewer_can_view_team_invoices(auth.uid())
    AND user_id IN (SELECT public.viewer_team_member_ids(auth.uid()))
  )
);

CREATE POLICY invoices_update_team ON invoices FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR (
    public.viewer_can_view_team_invoices(auth.uid())
    AND user_id IN (SELECT public.viewer_team_member_ids(auth.uid()))
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR (
    public.viewer_can_view_team_invoices(auth.uid())
    AND user_id IN (SELECT public.viewer_team_member_ids(auth.uid()))
  )
);

CREATE POLICY invoices_insert_own ON invoices FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY invoices_delete_own ON invoices FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_team_owner_of(user_id)
);

-- ── 9. Templates / notes / snippets team RLS ────────────────────────────────

-- Templates: drop own-only if named variously; add team policies
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'templates'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.templates', r.policyname);
  END LOOP;
END $$;

CREATE POLICY templates_select_team ON public.templates FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR user_id IS NULL
  OR is_starter = true
  OR (team_id IS NOT NULL AND public.viewer_same_team_id(team_id, auth.uid()))
);

CREATE POLICY templates_insert_own ON public.templates FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY templates_update_team ON public.templates FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_team_owner_of(user_id)
  OR (team_id IS NOT NULL AND public.viewer_same_team_id(team_id, auth.uid()))
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_team_owner_of(user_id)
  OR (team_id IS NOT NULL AND public.viewer_same_team_id(team_id, auth.uid()))
);

CREATE POLICY templates_delete_team ON public.templates FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_team_owner_of(user_id)
);

-- Notes
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notes'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.notes', r.policyname);
  END LOOP;
END $$;

CREATE POLICY notes_select_team ON public.notes FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (team_id IS NOT NULL AND public.viewer_same_team_id(team_id, auth.uid()))
);

CREATE POLICY notes_insert_own ON public.notes FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY notes_update_team ON public.notes FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_team_owner_of(user_id)
  OR (team_id IS NOT NULL AND public.viewer_same_team_id(team_id, auth.uid()))
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_team_owner_of(user_id)
  OR (team_id IS NOT NULL AND public.viewer_same_team_id(team_id, auth.uid()))
);

CREATE POLICY notes_delete_team ON public.notes FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_team_owner_of(user_id)
);

-- Snippets
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_snippets'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_snippets', r.policyname);
  END LOOP;
END $$;

CREATE POLICY user_snippets_select_team ON public.user_snippets FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (team_id IS NOT NULL AND public.viewer_same_team_id(team_id, auth.uid()))
);

CREATE POLICY user_snippets_insert_own ON public.user_snippets FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY user_snippets_update_team ON public.user_snippets FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_team_owner_of(user_id)
  OR (team_id IS NOT NULL AND public.viewer_same_team_id(team_id, auth.uid()))
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_team_owner_of(user_id)
  OR (team_id IS NOT NULL AND public.viewer_same_team_id(team_id, auth.uid()))
);

CREATE POLICY user_snippets_delete_team ON public.user_snippets FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_team_owner_of(user_id)
);
