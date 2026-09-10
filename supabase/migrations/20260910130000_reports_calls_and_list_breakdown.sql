-- Migration: Add call activity & per-list breakdown KPI aggregations to Reports RPCs

-- 1. Update get_lead_pipeline_stats to include call_activity metrics from lead_call_attempts
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
        'outcomes', jsonb_build_object(
          'Answered', 0,
          'No Answer', 0,
          'Voicemail Left', 0,
          'Busy', 0,
          'Wrong Number', 0,
          'Callback Requested', 0,
          'Not Interested', 0
        )
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
    SELECT a.id, a.lead_id, a.outcome
    FROM public.lead_call_attempts a
    JOIN scoped s ON a.lead_id = s.id
    WHERE (p_created_from IS NULL OR coalesce(a.occurred_at, a.created_at) >= p_created_from)
      AND (p_created_to IS NULL OR coalesce(a.occurred_at, a.created_at) <= p_created_to)
  ),
  call_act AS (
    SELECT
      count(*)::integer AS total_attempts,
      count(*) FILTER (WHERE outcome = 'Answered')::integer AS answered_count,
      count(DISTINCT lead_id)::integer AS distinct_leads,
      jsonb_build_object(
        'Answered', count(*) FILTER (WHERE outcome = 'Answered')::integer,
        'No Answer', count(*) FILTER (WHERE outcome = 'No Answer')::integer,
        'Voicemail Left', count(*) FILTER (WHERE outcome = 'Voicemail Left')::integer,
        'Busy', count(*) FILTER (WHERE outcome = 'Busy')::integer,
        'Wrong Number', count(*) FILTER (WHERE outcome = 'Wrong Number')::integer,
        'Callback Requested', count(*) FILTER (WHERE outcome = 'Callback Requested')::integer,
        'Not Interested', count(*) FILTER (WHERE outcome = 'Not Interested')::integer
      ) AS outcomes
    FROM scoped_attempts
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
      'outcomes', coalesce(ca.outcomes, jsonb_build_object(
        'Answered', 0, 'No Answer', 0, 'Voicemail Left', 0, 'Busy', 0, 'Wrong Number', 0, 'Callback Requested', 0, 'Not Interested', 0
      ))
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

-- 2. Update get_reports_advanced_stats to include listTableData (per-List KPI breakdown)
CREATE OR REPLACE FUNCTION public.get_reports_advanced_stats(
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
  v_breakdown jsonb;
  v_list_table jsonb;
  v_trend jsonb;
  v_growth jsonb;
  v_duration interval;
  v_prior_start timestamptz;
  v_prior_end timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_user_ids IS NULL OR cardinality(p_user_ids) = 0 THEN
    RETURN jsonb_build_object(
      'trendData', '[]'::jsonb,
      'breakdownData', '[]'::jsonb,
      'listTableData', '[]'::jsonb,
      'growthStats', jsonb_build_object('responseRateWoW', 0)
    );
  END IF;

  v_duration := coalesce(p_created_to, now()) - coalesce(p_created_from, now() - interval '30 days');
  v_prior_end := coalesce(p_created_from, now() - interval '30 days');
  v_prior_start := v_prior_end - v_duration;

  -- 1. Breakdown Data (grouped by List/Folder for chart)
  WITH scoped AS (
    SELECT l.id, l.folder_id, l.status
    FROM public.leads l
    WHERE (
      l.user_id = ANY (p_user_ids)
      OR (p_shared_folder_ids IS NOT NULL AND cardinality(p_shared_folder_ids) > 0 AND l.folder_id = ANY (p_shared_folder_ids))
    )
    AND (p_owner_user_id IS NULL OR l.user_id = p_owner_user_id)
    AND (p_created_from IS NULL OR l.created_at >= p_created_from)
    AND (p_created_to IS NULL OR l.created_at <= p_created_to)
    AND (
      NOT p_apply_folder_filter
      OR (
        (p_selected_folder_ids IS NOT NULL AND cardinality(p_selected_folder_ids) > 0 AND l.folder_id = ANY (p_selected_folder_ids))
        OR (p_include_unfiled AND l.folder_id IS NULL)
      )
    )
  ),
  grouped AS (
    SELECT coalesce(f.name, 'Unfiled') AS "listName", count(*)::integer AS value
    FROM scoped s
    LEFT JOIN public.folders f ON s.folder_id = f.id
    GROUP BY coalesce(f.name, 'Unfiled')
  )
  SELECT coalesce(jsonb_agg(row_to_json(grouped)), '[]'::jsonb) INTO v_breakdown FROM grouped;

  -- 2. Per-List Breakdown KPIs Table
  WITH scoped AS (
    SELECT l.id, l.folder_id, l.status
    FROM public.leads l
    WHERE (
      l.user_id = ANY (p_user_ids)
      OR (p_shared_folder_ids IS NOT NULL AND cardinality(p_shared_folder_ids) > 0 AND l.folder_id = ANY (p_shared_folder_ids))
    )
    AND (p_owner_user_id IS NULL OR l.user_id = p_owner_user_id)
    AND (p_created_from IS NULL OR l.created_at >= p_created_from)
    AND (p_created_to IS NULL OR l.created_at <= p_created_to)
    AND (
      NOT p_apply_folder_filter
      OR (
        (p_selected_folder_ids IS NOT NULL AND cardinality(p_selected_folder_ids) > 0 AND l.folder_id = ANY (p_selected_folder_ids))
        OR (p_include_unfiled AND l.folder_id IS NULL)
      )
    )
  ),
  list_kpis AS (
    SELECT 
      coalesce(f.name, 'Unfiled') AS "listName",
      s.folder_id AS "folderId",
      f.color AS "color",
      count(*)::integer AS "contacts",
      count(*) FILTER (WHERE s.status IN ('Contacted', 'Positive Reply', 'Proposal Sent', 'Invite Sent', 'Booked', 'Closed Won'))::integer AS "contacted_cum",
      count(*) FILTER (WHERE s.status IN ('Positive Reply', 'Proposal Sent', 'Invite Sent', 'Booked', 'Closed Won'))::integer AS "positive_reply_cum",
      count(*) FILTER (WHERE s.status IN ('Booked', 'Closed Won'))::integer AS "booked_cum",
      count(*) FILTER (WHERE s.status = 'Closed Won')::integer AS "closed_won_cum",
      count(*) FILTER (WHERE s.status = 'Contacted')::integer AS "contacted_curr",
      count(*) FILTER (WHERE s.status = 'Positive Reply')::integer AS "positive_reply_curr",
      count(*) FILTER (WHERE s.status = 'Booked')::integer AS "booked_curr",
      count(*) FILTER (WHERE s.status = 'Closed Won')::integer AS "closed_won_curr"
    FROM scoped s
    LEFT JOIN public.folders f ON s.folder_id = f.id
    GROUP BY coalesce(f.name, 'Unfiled'), s.folder_id, f.color
    ORDER BY count(*) DESC
  )
  SELECT coalesce(jsonb_agg(row_to_json(list_kpis)), '[]'::jsonb) INTO v_list_table FROM list_kpis;

  -- 3. Trend Data (grouped by Date)
  WITH scoped_trend AS (
    SELECT 
      l.created_at::date AS "date",
      l.status,
      l.call_status
    FROM public.leads l
    WHERE (
      l.user_id = ANY (p_user_ids)
      OR (p_shared_folder_ids IS NOT NULL AND cardinality(p_shared_folder_ids) > 0 AND l.folder_id = ANY (p_shared_folder_ids))
    )
    AND (p_owner_user_id IS NULL OR l.user_id = p_owner_user_id)
    AND (p_created_from IS NULL OR l.created_at >= p_created_from)
    AND (p_created_to IS NULL OR l.created_at <= p_created_to)
    AND (
      NOT p_apply_folder_filter
      OR (
        (p_selected_folder_ids IS NOT NULL AND cardinality(p_selected_folder_ids) > 0 AND l.folder_id = ANY (p_selected_folder_ids))
        OR (p_include_unfiled AND l.folder_id IS NULL)
      )
    )
  ),
  trend_grouped AS (
    SELECT 
      to_char("date", 'YYYY-MM-DD') AS "date",
      count(*) AS "outreach",
      count(*) FILTER (WHERE call_status IS NOT NULL AND call_status != 'Not Called') AS "calls",
      count(*) FILTER (WHERE status IS NOT NULL AND status != 'Lead') AS "messages",
      0 AS "invoices"
    FROM scoped_trend
    GROUP BY "date"
    ORDER BY "date"
  )
  SELECT coalesce(jsonb_agg(row_to_json(trend_grouped)), '[]'::jsonb) INTO v_trend FROM trend_grouped;

  -- 4. Growth Stats (responseRateWoW)
  WITH current_period AS (
    SELECT 
      count(*) AS total,
      count(*) FILTER (WHERE reply_type = 'positive') AS positive
    FROM public.leads l
    WHERE (
      l.user_id = ANY (p_user_ids)
      OR (p_shared_folder_ids IS NOT NULL AND cardinality(p_shared_folder_ids) > 0 AND l.folder_id = ANY (p_shared_folder_ids))
    )
    AND (p_owner_user_id IS NULL OR l.user_id = p_owner_user_id)
    AND (p_created_from IS NULL OR l.created_at >= p_created_from)
    AND (p_created_to IS NULL OR l.created_at <= p_created_to)
    AND (
      NOT p_apply_folder_filter
      OR (
        (p_selected_folder_ids IS NOT NULL AND cardinality(p_selected_folder_ids) > 0 AND l.folder_id = ANY (p_selected_folder_ids))
        OR (p_include_unfiled AND l.folder_id IS NULL)
      )
    )
  ),
  prior_period AS (
    SELECT 
      count(*) AS total,
      count(*) FILTER (WHERE reply_type = 'positive') AS positive
    FROM public.leads l
    WHERE (
      l.user_id = ANY (p_user_ids)
      OR (p_shared_folder_ids IS NOT NULL AND cardinality(p_shared_folder_ids) > 0 AND l.folder_id = ANY (p_shared_folder_ids))
    )
    AND (p_owner_user_id IS NULL OR l.user_id = p_owner_user_id)
    AND (l.created_at >= v_prior_start AND l.created_at < v_prior_end)
    AND (
      NOT p_apply_folder_filter
      OR (
        (p_selected_folder_ids IS NOT NULL AND cardinality(p_selected_folder_ids) > 0 AND l.folder_id = ANY (p_selected_folder_ids))
        OR (p_include_unfiled AND l.folder_id IS NULL)
      )
    )
  )
  SELECT 
    jsonb_build_object(
      'responseRateWoW', 
      CASE 
        WHEN (SELECT total FROM prior_period) = 0 THEN 0
        WHEN (SELECT total FROM current_period) = 0 THEN 0
        ELSE 
          round(
            (
              ((SELECT positive::numeric FROM current_period) / (SELECT total::numeric FROM current_period))
              -
              ((SELECT positive::numeric FROM prior_period) / (SELECT total::numeric FROM prior_period))
            ) * 100
          , 1)
      END
    )
  INTO v_growth;

  RETURN jsonb_build_object(
    'trendData', coalesce(v_trend, '[]'::jsonb),
    'breakdownData', coalesce(v_breakdown, '[]'::jsonb),
    'listTableData', coalesce(v_list_table, '[]'::jsonb),
    'growthStats', coalesce(v_growth, jsonb_build_object('responseRateWoW', 0))
  );
END;
$$;
