-- Allow custom call outcomes (editable call statuses).
-- Previously outcome was locked to a fixed 7-value CHECK list, so setting a
-- custom call status like "hanged up" failed when logging lead_call_attempts.

ALTER TABLE public.lead_call_attempts
  DROP CONSTRAINT IF EXISTS lead_call_attempts_outcome_check;

ALTER TABLE public.lead_call_attempts
  ADD CONSTRAINT lead_call_attempts_outcome_check
  CHECK (length(trim(outcome)) > 0);

COMMENT ON CONSTRAINT lead_call_attempts_outcome_check ON public.lead_call_attempts IS
  'Outcome may be any non-empty string (built-in or user-defined call status).';
