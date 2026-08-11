import { supabase } from './supabase';
import {
  REPLY_CHECK_STATUSES,
  FOLLOW_UP_CHECK_STATUSES,
} from './reminders';

export const CHECKPOINT_CYCLE_STATUSES = [
  ...REPLY_CHECK_STATUSES,
  ...FOLLOW_UP_CHECK_STATUSES,
];

const CHECKPOINT_LEAD_COLUMNS =
  'id, user_id, first_name, last_name, company, email, status, next_checkpoint_at, action_to_take, last_contacted_at, checkpoint_notified_at, folder_id, google_followup_event_id';

export function leadDisplayName(lead) {
  if (!lead) return 'Lead';
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim();
  return name || lead.company || lead.email || 'Lead';
}

/** Whether a lead is in the messaging checkpoint cycle and due/overdue. */
export function isCheckpointDue(lead, { now = new Date(), remindersEnabled = true } = {}) {
  if (!remindersEnabled || !lead?.next_checkpoint_at) return false;
  if (!CHECKPOINT_CYCLE_STATUSES.includes(lead.status)) return false;
  return new Date(lead.next_checkpoint_at) <= now;
}

/**
 * Attach folder names without PostgREST resource embedding.
 * leads.folder_id has no guaranteed FK relationship in the API schema cache,
 * so `folder:folders(...)` embeds 400 in production.
 */
async function attachFolderNames(leads) {
  const rows = leads || [];
  if (!rows.length) return rows;

  const folderIds = [...new Set(rows.map((l) => l.folder_id).filter(Boolean))];
  if (!folderIds.length) {
    return rows.map((l) => ({ ...l, folder: null }));
  }

  const { data: folders, error } = await supabase
    .from('folders')
    .select('id, name')
    .in('id', folderIds);

  if (error) {
    console.warn('[checkpointNotifications] folder name lookup failed:', error);
    return rows.map((l) => ({ ...l, folder: null }));
  }

  const byId = new Map((folders || []).map((f) => [f.id, f]));
  return rows.map((l) => ({
    ...l,
    folder: l.folder_id ? byId.get(l.folder_id) || null : null,
  }));
}

/**
 * Fetch due/overdue checkpoint leads for a user (or set of user ids).
 * Source of truth: leads.next_checkpoint_at (not follow_up_reminders).
 */
export async function fetchDueCheckpointLeads({
  userIds,
  limit = 50,
  now = new Date(),
} = {}) {
  const ids = (userIds || []).filter(Boolean);
  if (ids.length === 0) return [];

  const nowIso = now instanceof Date ? now.toISOString() : now;

  const { data, error } = await supabase
    .from('leads')
    .select(CHECKPOINT_LEAD_COLUMNS)
    .in('user_id', ids)
    .in('status', CHECKPOINT_CYCLE_STATUSES)
    .not('next_checkpoint_at', 'is', null)
    .lte('next_checkpoint_at', nowIso)
    .order('next_checkpoint_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return attachFolderNames(data || []);
}

/**
 * Upcoming checkpoints through `through` (inclusive), including future ones
 * for Today / This week groupings on the Reminders page.
 */
export async function fetchUpcomingCheckpointLeads({
  userIds,
  through,
  limit = 200,
} = {}) {
  const ids = (userIds || []).filter(Boolean);
  if (ids.length === 0 || !through) return [];

  const throughIso = through instanceof Date ? through.toISOString() : through;

  const { data, error } = await supabase
    .from('leads')
    .select(CHECKPOINT_LEAD_COLUMNS)
    .in('user_id', ids)
    .in('status', CHECKPOINT_CYCLE_STATUSES)
    .not('next_checkpoint_at', 'is', null)
    .lte('next_checkpoint_at', throughIso)
    .order('next_checkpoint_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return attachFolderNames(data || []);
}

/** Count due checkpoints for badge / nav. */
export async function countDueCheckpointLeads({ userIds, now = new Date() } = {}) {
  const ids = (userIds || []).filter(Boolean);
  if (ids.length === 0) return 0;

  const nowIso = now instanceof Date ? now.toISOString() : now;

  const { count, error } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .in('user_id', ids)
    .in('status', CHECKPOINT_CYCLE_STATUSES)
    .not('next_checkpoint_at', 'is', null)
    .lte('next_checkpoint_at', nowIso);

  if (error) throw error;
  return count || 0;
}

/** Format overdue phrasing for dashboard/bell. */
export function formatOverdueLabel(checkpointAt) {
  if (!checkpointAt) return '';
  const diffMs = Date.now() - new Date(checkpointAt).getTime();
  if (diffMs < 0) return 'Due soon';
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
  const days = Math.floor(diffHours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
