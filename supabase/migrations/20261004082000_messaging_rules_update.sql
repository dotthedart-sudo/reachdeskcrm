-- Migration: Update messaging automation rules from "Calendly Sent" / "Send Calendly" to "Invite Sent" / "Send invite", and add defaults for Replied and Client

-- 1. Update action_suggestion_rules
UPDATE public.action_suggestion_rules
SET status = 'Invite Sent'
WHERE status = 'Calendly Sent';

UPDATE public.action_suggestion_rules
SET suggested_action = 'Send invite'
WHERE suggested_action = 'Send Calendly';

INSERT INTO public.action_suggestion_rules (status, suggested_action)
SELECT 'Replied', 'Send proposal'
WHERE NOT EXISTS (SELECT 1 FROM public.action_suggestion_rules WHERE status = 'Replied');

INSERT INTO public.action_suggestion_rules (status, suggested_action)
SELECT 'Client', 'No action needed'
WHERE NOT EXISTS (SELECT 1 FROM public.action_suggestion_rules WHERE status = 'Client');

-- 2. Update user_profiles.messaging_action_rules JSONB
UPDATE public.user_profiles
SET messaging_action_rules = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'status', CASE WHEN elem->>'status' = 'Calendly Sent' THEN 'Invite Sent' ELSE elem->>'status' END,
      'suggested_action', CASE WHEN elem->>'suggested_action' = 'Send Calendly' THEN 'Send invite' ELSE elem->>'suggested_action' END
    )
  )
  FROM jsonb_array_elements(messaging_action_rules) AS elem
)
WHERE messaging_action_rules IS NOT NULL AND jsonb_typeof(messaging_action_rules) = 'array';

-- 3. Update teams.messaging_action_rules JSONB
UPDATE public.teams
SET messaging_action_rules = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'status', CASE WHEN elem->>'status' = 'Calendly Sent' THEN 'Invite Sent' ELSE elem->>'status' END,
      'suggested_action', CASE WHEN elem->>'suggested_action' = 'Send Calendly' THEN 'Send invite' ELSE elem->>'suggested_action' END
    )
  )
  FROM jsonb_array_elements(messaging_action_rules) AS elem
)
WHERE messaging_action_rules IS NOT NULL AND jsonb_typeof(messaging_action_rules) = 'array';
