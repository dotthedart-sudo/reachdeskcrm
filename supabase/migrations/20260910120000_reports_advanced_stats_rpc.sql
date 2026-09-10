-- Create RPC for Reports Advanced Stats (Trends, Breakdowns, Growth)
-- Matches UI expectations: grouped by List (folder), provides growth/engagement stats

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
      'growthStats', jsonb_build_object('responseRateWoW', 0)
    );
  END IF;

  -- Determine prior period for WoW growth
  v_duration := coalesce(p_created_to, now()) - coalesce(p_created_from, now() - interval '30 days');
  v_prior_end := coalesce(p_created_from, now() - interval '30 days');
  v_prior_start := v_prior_end - v_duration;

  -- 1. Breakdown Data (grouped by List/Folder)
  WITH scoped AS (
    SELECT l.folder_id
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

  -- 2. Trend Data (grouped by Date)
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

  -- 3. Growth Stats (responseRateWoW)
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
    'growthStats', coalesce(v_growth, jsonb_build_object('responseRateWoW', 0))
  );
END;
$$;

COMMENT ON FUNCTION public.get_reports_advanced_stats IS
  'Provides advanced stats for the Reports page (Trends, Breakdowns, Growth), correctly scoped by RLS and permissions.';

GRANT EXECUTE ON FUNCTION public.get_reports_advanced_stats(
  uuid[], uuid[], boolean, uuid[], boolean, timestamptz, timestamptz, uuid
) TO authenticated;
