import { supabase } from './supabase';

/** PostgREST default max-rows; fetch in pages so we never assume one response is complete. */
export const LEADS_PAGE_SIZE = 1000;

/**
 * Page through a PostgREST query until every matching row is collected.
 * @param {() => import('@supabase/supabase-js').PostgrestFilterBuilder} makeQuery
 *   Factory that returns a fresh query builder (without .range). Called once per page.
 * @param {{ pageSize?: number }} [opts]
 * @returns {Promise<any[]>}
 */
export async function fetchAllPaged(makeQuery, { pageSize = LEADS_PAGE_SIZE } = {}) {
  const all = [];
  let from = 0;

  for (;;) {
    const to = from + pageSize - 1;
    const { data, error } = await makeQuery().range(from, to);
    if (error) throw error;
    const batch = data || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

/**
 * Exact lead count (no rows). Applies the same ownership / or-filter pattern as CRM loads.
 * @param {{
 *   userIds: string[],
 *   sharedFolderIds?: string[] | null,
 *   ownerUserId?: string | null,
 * }} opts
 */
export async function countLeadsExact({
  userIds,
  sharedFolderIds = null,
  ownerUserId = null,
} = {}) {
  if (!userIds?.length) return 0;

  let q = supabase.from('leads').select('id', { count: 'exact', head: true });

  if (sharedFolderIds?.length) {
    q = q.or(
      `user_id.in.(${userIds.join(',')}),folder_id.in.(${sharedFolderIds.join(',')})`,
    );
  } else {
    q = q.in('user_id', userIds);
  }

  if (ownerUserId) {
    q = q.eq('user_id', ownerUserId);
  }

  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Server-side pipeline / overview aggregates (exact; not capped by max-rows).
 * @see supabase/migrations/20260810140000_lead_pipeline_stats_rpc.sql
 */
export async function fetchLeadPipelineStats({
  userIds,
  sharedFolderIds = null,
  applyFolderFilter = false,
  selectedFolderIds = null,
  includeUnfiled = false,
  createdFrom = null,
  createdTo = null,
  ownerUserId = null,
} = {}) {
  if (!userIds?.length) {
    return emptyPipelineStats();
  }

  const { data, error } = await supabase.rpc('get_lead_pipeline_stats', {
    p_user_ids: userIds,
    p_shared_folder_ids: sharedFolderIds?.length ? sharedFolderIds : null,
    p_apply_folder_filter: !!applyFolderFilter,
    p_selected_folder_ids:
      applyFolderFilter && selectedFolderIds?.length ? selectedFolderIds : null,
    p_include_unfiled: !!includeUnfiled,
    p_created_from: createdFrom,
    p_created_to: createdTo,
    p_owner_user_id: ownerUserId,
  });

  if (error) throw error;
  return normalizePipelineStats(data);
}

export function emptyPipelineStats() {
  return {
    total: 0,
    positive: 0,
    velocity_7d: 0,
    week_messaged: 0,
    week_followups_due: 0,
    message_current: {
      Lead: 0,
      Contacted: 0,
      'Positive Reply': 0,
      'Proposal Sent': 0,
      'Invite Sent': 0,
      Booked: 0,
      'Closed Won': 0,
    },
    call_current: {
      not_called: 0,
      attempted: 0,
      connected: 0,
      callback: 0,
      closed: 0,
    },
    positive_by_template: {},
  };
}

function normalizePipelineStats(raw) {
  const base = emptyPipelineStats();
  if (!raw || typeof raw !== 'object') return base;
  return {
    total: Number(raw.total) || 0,
    positive: Number(raw.positive) || 0,
    velocity_7d: Number(raw.velocity_7d) || 0,
    week_messaged: Number(raw.week_messaged) || 0,
    week_followups_due: Number(raw.week_followups_due) || 0,
    message_current: { ...base.message_current, ...(raw.message_current || {}) },
    call_current: { ...base.call_current, ...(raw.call_current || {}) },
    positive_by_template: raw.positive_by_template || {},
  };
}

/**
 * Fetch every lead row matching CRM/App ownership scope (paged).
 */
export async function fetchAllLeadsForScope({
  userIds,
  sharedFolderIds = null,
  columns = '*',
  orderBy = [
    { column: 'created_at', ascending: false },
    { column: 'id', ascending: true },
  ],
} = {}) {
  if (!userIds?.length) return [];

  return fetchAllPaged(() => {
    let q = supabase.from('leads').select(columns);
    if (sharedFolderIds?.length) {
      q = q.or(
        `user_id.in.(${userIds.join(',')}),folder_id.in.(${sharedFolderIds.join(',')})`,
      );
    } else {
      q = q.in('user_id', userIds);
    }
    for (const ord of orderBy) {
      q = q.order(ord.column, { ascending: !!ord.ascending });
    }
    return q;
  });
}

/**
 * Fetch advanced stats for reports (Trends, Breakdowns)
 * Falls back to dummy data if the RPC is not yet available on the backend.
 */
export async function fetchReportsAdvancedStats(opts = {}) {
  try {
    const { data, error } = await supabase.rpc('get_reports_advanced_stats', opts);
    if (error) throw error;
    if (data) return data;
  } catch (err) {
    console.warn('[Reports] Advanced stats RPC failed or missing, using fallback data:', err);
  }

  // Fallback dummy data for UI development
  return {
    trendData: [
      { date: '2026-09-01', outreach: 45, calls: 20, messages: 25, invoices: 2 },
      { date: '2026-09-02', outreach: 52, calls: 25, messages: 27, invoices: 3 },
      { date: '2026-09-03', outreach: 38, calls: 15, messages: 23, invoices: 1 },
      { date: '2026-09-04', outreach: 65, calls: 30, messages: 35, invoices: 4 },
      { date: '2026-09-05', outreach: 48, calls: 22, messages: 26, invoices: 2 },
      { date: '2026-09-06', outreach: 55, calls: 28, messages: 27, invoices: 5 },
      { date: '2026-09-07', outreach: 60, calls: 25, messages: 35, invoices: 3 },
    ],
    breakdownData: [
      { listName: 'Q3 Outbound', value: 120 },
      { listName: 'Inbound Signups', value: 85 },
      { listName: 'Cold Email Campaign', value: 65 },
      { listName: 'Referrals', value: 30 },
      { listName: 'Unfiled', value: 15 },
    ],
    growthStats: {
      responseRateWoW: 12.5, // +12.5%
    }
  };
}
