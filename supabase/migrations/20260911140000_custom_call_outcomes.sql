-- 1. Create the custom_call_outcomes table
CREATE TABLE public.custom_call_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  label text NOT NULL,
  color text NOT NULL,
  based_on text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_call_outcomes_based_on_check CHECK (
    based_on IN ('Answered', 'No Answer', 'Voicemail Left', 'Busy', 'Wrong Number', 'Callback Requested', 'Not Interested')
  ),
  CONSTRAINT custom_call_outcomes_label_check CHECK (
    lower(label) NOT IN ('answered', 'no answer', 'voicemail left', 'busy', 'wrong number', 'callback requested', 'not interested')
  )
);

-- Labels must be unique per team
CREATE UNIQUE INDEX custom_call_outcomes_team_label_idx 
  ON public.custom_call_outcomes (team_id, lower(label));

ALTER TABLE public.custom_call_outcomes ENABLE ROW LEVEL SECURITY;

-- Team Visibility RLS
CREATE POLICY "Team members can view outcomes"
  ON public.custom_call_outcomes FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own outcomes"
  ON public.custom_call_outcomes FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own outcomes"
  ON public.custom_call_outcomes FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own outcomes"
  ON public.custom_call_outcomes FOR DELETE
  USING (user_id = auth.uid());

-- Automatically set team_id on insert
CREATE TRIGGER trg_set_custom_call_outcome_team_id
  BEFORE INSERT ON public.custom_call_outcomes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_team_id_from_user();

-- 2. Add outcome_base to lead_call_attempts
ALTER TABLE public.lead_call_attempts
  ADD COLUMN outcome_base text;

ALTER TABLE public.lead_call_attempts
  ADD CONSTRAINT lead_call_attempts_outcome_base_check CHECK (
    outcome_base IN ('Answered', 'No Answer', 'Voicemail Left', 'Busy', 'Wrong Number', 'Callback Requested', 'Not Interested')
  );

UPDATE public.lead_call_attempts
SET outcome_base = outcome
WHERE outcome_base IS NULL;
