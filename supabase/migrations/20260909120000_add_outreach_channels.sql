-- Create custom_channels table
CREATE TABLE public.custom_channels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('messaging', 'calls')),
  name text NOT NULL,
  color text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX custom_channels_user_type_name_idx ON public.custom_channels(user_id, type, lower(name));

-- Enable RLS
ALTER TABLE public.custom_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own custom channels"
  ON public.custom_channels
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add outreach_channel to leads table
ALTER TABLE public.leads
  ADD COLUMN outreach_channel text;

-- Rename 'Calendly Sent' to 'Invite Sent' in custom_statuses
UPDATE public.custom_statuses
  SET label = 'Invite Sent'
  WHERE label = 'Calendly Sent';

-- Rename 'Calendly Sent' to 'Invite Sent' in leads status
UPDATE public.leads
  SET status = 'Invite Sent'
  WHERE status = 'Calendly Sent';

-- Rename 'Calendly Sent' to 'Invite Sent' in leads call_status
UPDATE public.leads
  SET call_status = 'Invite Sent'
  WHERE call_status = 'Calendly Sent';

-- Rename 'Calendly Sent' to 'Invite Sent' in lead_activity (if any status change logs exist)
-- Note: 'Status Updated' action_detail contains { to: 'Calendly Sent' }
UPDATE public.lead_activity
  SET action_detail = jsonb_set(action_detail, '{to}', '"Invite Sent"')
  WHERE action_type = 'Status Updated' 
    AND action_detail->>'to' = 'Calendly Sent';

-- Ensure user_automation_rules targeting 'Calendly Sent' are updated
UPDATE public.user_automation_rules
  SET rule_config = (
    SELECT jsonb_agg(
      CASE 
        WHEN rule->>'status' = 'Calendly Sent' THEN jsonb_set(rule, '{status}', '"Invite Sent"')
        ELSE rule
      END
    )
    FROM jsonb_array_elements(rule_config) AS rule
  )
  WHERE rule_config @> '[{"status": "Calendly Sent"}]';
