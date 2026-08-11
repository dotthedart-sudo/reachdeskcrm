-- Sync follow-ups to Google Calendar preference (OFF by default).
-- Mapping column so we can update/delete the remote event when a checkpoint moves/clears.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS sync_followups_to_google boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.sync_followups_to_google IS
  'When true, create/update Google Calendar events for lead next_checkpoint_at follow-ups. Default false (in-app only).';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS google_followup_event_id text;

COMMENT ON COLUMN public.leads.google_followup_event_id IS
  'Google Calendar event id for the synced follow-up, when sync_followups_to_google is enabled.';

CREATE INDEX IF NOT EXISTS leads_google_followup_event_id_idx
  ON public.leads (google_followup_event_id)
  WHERE google_followup_event_id IS NOT NULL;
