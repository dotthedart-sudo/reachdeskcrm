-- 1. Update get_lead_pipeline_stats to group by outcome_base instead of outcome and dynamically aggregate
CREATE OR REPLACE FUNCTION public.get_lead_pipeline_stats(
  p_user_ids uuid[],
  p_shared_folder_ids uuid[] DEFAULT NULL,
  p_apply_folder_filter boolean DEFAULT false,
  p_selected_folder_ids uuid[] DEFAULT NULL,
  p_include_unfiled boolean DEFAULT false,
  p_created_from timestamptz DEFAULT NULL,
  p_created_to timestamptz DEFAULT NULL,
  p_owner_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_total integer := 0;
  v_positive integer := 0;
  v_velocity_7d integer := 0;
  v_week_messaged integer := 0;
  v_week_followups_due integer := 0;
  v_message jsonb := '{}'::jsonb;
  v_call jsonb := '{}'::jsonb;
  v_call_activity jsonb := '{}'::jsonb;
  v_positive_by_template jsonb := '{}'::jsonb;
  v_since timestamptz := now() - interval '7 days';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_user_ids IS NULL OR cardinality(p_user_ids) = 0 THEN
    RETURN jsonb_build_object(
      'total', 0,
      'positive', 0,
      'velocity_7d', 0,
      'week_messaged', 0,
      'week_followups_due', 0,
      'message_current', jsonb_build_object(
        'Lead', 0, 'Contacted', 0, 'Positive Reply', 0, 'Proposal Sent', 0,
        'Calendly Sent', 0, 'Booked', 0, 'Closed Won', 0
      ),
      'call_current', jsonb_build_object(
        'not_called', 0, 'attempted', 0, 'connected', 0, 'callback', 0, 'closed', 0
      ),
      'call_activity', jsonb_build_object(
        'total_attempts', 0,
        'answered_count', 0,
        'connect_rate', 0,
        'distinct_leads', 0,
        'avg_attempts_per_lead', 0,
        'outcomes', '{}'::jsonb
      ),
      'positive_by_template', '{}'::jsonb
    );
  END IF;

  WITH scoped AS (
    SELECT
      l.id,
      l.user_id,
      l.status,
      l.call_status,
      l.reply_type,
      l.template_used,
      l.created_at,
      l.last_contacted_at,
      l.next_checkpoint_at
    FROM public.leads l
    WHERE (
      l.user_id = ANY (p_user_ids)
      OR (
        p_shared_folder_ids IS NOT NULL
        AND cardinality(p_shared_folder_ids) > 0
        AND l.folder_id = ANY (p_shared_folder_ids)
      )
    )
    AND (p_owner_user_id IS NULL OR l.user_id = p_owner_user_id)
    AND (p_created_from IS NULL OR l.created_at >= p_created_from)
    AND (p_created_to IS NULL OR l.created_at <= p_created_to)
    AND (
      NOT p_apply_folder_filter
      OR (
        (
          p_selected_folder_ids IS NOT NULL
          AND cardinality(p_selected_folder_ids) > 0
          AND l.folder_id = ANY (p_selected_folder_ids)
        )
        OR (p_include_unfiled AND l.folder_id IS NULL)
      )
    )
  ),
  totals AS (
    SELECT
      count(*)::integer AS total,
      count(*) FILTER (WHERE reply_type = 'positive')::integer AS positive,
      count(*) FILTER (
        WHERE created_at >= v_since
           OR last_contacted_at >= v_since
      )::integer AS velocity_7d,
      count(*) FILTER (
        WHERE user_id = coalesce(p_owner_user_id, v_uid)
          AND last_contacted_at >= v_since
      )::integer AS week_messaged,
      count(*) FILTER (
        WHERE user_id = coalesce(p_owner_user_id, v_uid)
          AND next_checkpoint_at IS NOT NULL
          AND next_checkpoint_at <= now()
      )::integer AS week_followups_due
    FROM scoped
  ),
  msg AS (
    SELECT coalesce(status, '') AS status, count(*)::integer AS cnt
    FROM scoped
    GROUP BY 1
  ),
  callb AS (
    SELECT public.lead_call_bucket(call_status) AS bucket, count(*)::integer AS cnt
    FROM scoped
    GROUP BY 1
  ),
  tmpl AS (
    SELECT template_used AS tid, count(*)::integer AS cnt
    FROM scoped
    WHERE reply_type = 'positive'
      AND template_used IS NOT NULL
      AND trim(template_used) <> ''
    GROUP BY 1
  ),
  scoped_attempts AS (
    SELECT a.id, a.lead_id, coalesce(a.outcome_base, a.outcome) AS outcome_base
    FROM public.lead_call_attempts a
    JOIN scoped s ON a.lead_id = s.id
    WHERE (p_created_from IS NULL OR coalesce(a.occurred_at, a.created_at) >= p_created_from)
      AND (p_created_to IS NULL OR coalesce(a.occurred_at, a.created_at) <= p_created_to)
  ),
  call_act AS (
    SELECT
      count(*)::integer AS total_attempts,
      count(*) FILTER (WHERE outcome_base = 'Answered')::integer AS answered_count,
      count(DISTINCT lead_id)::integer AS distinct_leads,
      coalesce(
        jsonb_object_agg(outcome_base, cnt) FILTER (WHERE outcome_base IS NOT NULL),
        '{}'::jsonb
      ) AS outcomes
    FROM (
      SELECT outcome_base, count(*)::integer AS cnt
      FROM scoped_attempts
      GROUP BY outcome_base
    ) sub
  )
  SELECT
    t.total,
    t.positive,
    t.velocity_7d,
    t.week_messaged,
    t.week_followups_due,
    jsonb_build_object(
      'Lead', coalesce((SELECT cnt FROM msg WHERE status = 'Lead'), 0),
      'Contacted', coalesce((SELECT cnt FROM msg WHERE status = 'Contacted'), 0),
      'Positive Reply', coalesce((SELECT cnt FROM msg WHERE status = 'Positive Reply'), 0),
      'Proposal Sent', coalesce((SELECT cnt FROM msg WHERE status = 'Proposal Sent'), 0),
      'Calendly Sent', coalesce((SELECT cnt FROM msg WHERE status = 'Calendly Sent'), 0),
      'Booked', coalesce((SELECT cnt FROM msg WHERE status = 'Booked'), 0),
      'Closed Won', coalesce((SELECT cnt FROM msg WHERE status = 'Closed Won'), 0)
    ),
    jsonb_build_object(
      'not_called', coalesce((SELECT cnt FROM callb WHERE bucket = 'not_called'), 0),
      'attempted', coalesce((SELECT cnt FROM callb WHERE bucket = 'attempted'), 0),
      'connected', coalesce((SELECT cnt FROM callb WHERE bucket = 'connected'), 0),
      'callback', coalesce((SELECT cnt FROM callb WHERE bucket = 'callback'), 0),
      'closed', coalesce((SELECT cnt FROM callb WHERE bucket = 'closed'), 0)
    ),
    coalesce((SELECT jsonb_object_agg(tid, cnt) FROM tmpl), '{}'::jsonb),
    jsonb_build_object(
      'total_attempts', coalesce(ca.total_attempts, 0),
      'answered_count', coalesce(ca.answered_count, 0),
      'connect_rate', CASE WHEN ca.total_attempts > 0 THEN round((ca.answered_count::numeric / ca.total_attempts::numeric) * 100, 1) ELSE 0 END,
      'distinct_leads', coalesce(ca.distinct_leads, 0),
      'avg_attempts_per_lead', CASE WHEN ca.distinct_leads > 0 THEN round(ca.total_attempts::numeric / ca.distinct_leads::numeric, 1) ELSE 0 END,
      'outcomes', coalesce(ca.outcomes, '{}'::jsonb)
    )
  INTO
    v_total,
    v_positive,
    v_velocity_7d,
    v_week_messaged,
    v_week_followups_due,
    v_message,
    v_call,
    v_positive_by_template,
    v_call_activity
  FROM totals t
  CROSS JOIN call_act ca;

  RETURN jsonb_build_object(
    'total', coalesce(v_total, 0),
    'positive', coalesce(v_positive, 0),
    'velocity_7d', coalesce(v_velocity_7d, 0),
    'week_messaged', coalesce(v_week_messaged, 0),
    'week_followups_due', coalesce(v_week_followups_due, 0),
    'message_current', coalesce(v_message, '{}'::jsonb),
    'call_current', coalesce(v_call, '{}'::jsonb),
    'call_activity', coalesce(v_call_activity, '{}'::jsonb),
    'positive_by_template', coalesce(v_positive_by_template, '{}'::jsonb)
  );
END;
$$;
