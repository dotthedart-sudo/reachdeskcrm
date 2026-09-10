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
    call_activity: {
      total_attempts: 0,
      answered_count: 0,
      connect_rate: 0,
      distinct_leads: 0,
      avg_attempts_per_lead: 0,
      outcomes: {
        Answered: 0,
        'No Answer': 0,
        'Voicemail Left': 0,
        Busy: 0,
        'Wrong Number': 0,
        'Callback Requested': 0,
        'Not Interested': 0,
      },
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
    call_activity: {
      total_attempts: Number(raw.call_activity?.total_attempts) || 0,
      answered_count: Number(raw.call_activity?.answered_count) || 0,
      connect_rate: Number(raw.call_activity?.connect_rate) || 0,
      distinct_leads: Number(raw.call_activity?.distinct_leads) || 0,
      avg_attempts_per_lead: Number(raw.call_activity?.avg_attempts_per_lead) || 0,
      outcomes: { ...base.call_activity.outcomes, ...(raw.call_activity?.outcomes || {}) },
    },
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
export async function fetchReportsAdvancedStats({
  userIds,
  sharedFolderIds = null,
  applyFolderFilter = false,
  selectedFolderIds = null,
  includeUnfiled = false,
  createdFrom = null,
  createdTo = null,
  ownerUserId = null,
} = {}) {
  try {
    const { data, error } = await supabase.rpc('get_reports_advanced_stats', {
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
    listTableData: [
      { listName: 'Q3 Outbound', folderId: '1', color: '#3b82f6', contacts: 120, contacted_cum: 95, positive_reply_cum: 40, booked_cum: 18, closed_won_cum: 8, contacted_curr: 30, positive_reply_curr: 15, booked_curr: 5, closed_won_curr: 8 },
      { listName: 'Inbound Signups', folderId: '2', color: '#10b981', contacts: 85, contacted_cum: 70, positive_reply_cum: 35, booked_cum: 15, closed_won_cum: 6, contacted_curr: 20, positive_reply_curr: 12, booked_curr: 4, closed_won_curr: 6 },
      { listName: 'Cold Email Campaign', folderId: '3', color: '#f59e0b', contacts: 65, contacted_cum: 50, positive_reply_cum: 20, booked_cum: 8, closed_won_cum: 3, contacted_curr: 18, positive_reply_curr: 8, booked_curr: 2, closed_won_curr: 3 },
      { listName: 'Referrals', folderId: '4', color: '#8b5cf6', contacts: 30, contacted_cum: 28, positive_reply_cum: 18, booked_cum: 10, closed_won_cum: 5, contacted_curr: 5, positive_reply_curr: 6, booked_curr: 2, closed_won_curr: 5 },
      { listName: 'Unfiled', folderId: null, color: null, contacts: 15, contacted_cum: 10, positive_reply_cum: 3, booked_cum: 1, closed_won_cum: 0, contacted_curr: 5, positive_reply_curr: 2, booked_curr: 1, closed_won_curr: 0 },
    ],
    growthStats: {
      responseRateWoW: 12.5, // +12.5%
    }
  };
}
