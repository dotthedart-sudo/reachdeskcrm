import { supabase } from './supabase';
import { DEFAULT_CALL_STATUSES } from './callOutcomeRules';

export const CUSTOM_STATUS_CHANNELS = {
  messaging: 'messaging',
  calls: 'calls',
};

/** Messaging CRM status seeds (mirrors GroupedStatusDropdown DEFAULT_STATUSES). */
export const DEFAULT_MESSAGING_STATUSES = [
  { label: 'Lead', color: '#3b82f6' },
  { label: 'Contacted', color: '#f59e0b' },
  { label: 'Positive Reply', color: '#8b5cf6' },
  { label: 'Calendly Sent', color: '#6B9FD4' },
  { label: 'Booked', color: '#ec4899' },
  { label: 'No show', color: '#ef4444' },
  { label: 'Rescheduled', color: '#a855f7' },
  { label: 'Proposal Sent', color: '#06b6d4' },
  { label: 'Followed up', color: '#10b981' },
  { label: 'Not Interested', color: '#6b7280' },
  { label: 'Closed Won', color: '#10b981' },
];

const DEFAULT_COLOR = '#6b7280';

function channelDefaults(channel) {
  return channel === 'calls' ? DEFAULT_CALL_STATUSES : DEFAULT_MESSAGING_STATUSES;
}

function normalizeLabel(label) {
  return (label || '').trim();
}

function dedupeByLabel(rows) {
  const seen = new Set();
  return (rows || []).filter((row) => {
    const key = (row.label || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Fetch custom statuses for a workspace scope (may include multiple user_ids on Teams).
 * @param {{ userIds: string[], channel: 'messaging'|'calls' }} opts
 * @returns {Promise<Array<{ id?: string, label: string, color: string, sort_order?: number }>>}
 */
export async function fetchCustomStatuses({ userIds, channel }) {
  const ids = (userIds || []).filter(Boolean);
  if (!ids.length) return channelDefaults(channel).map((d) => ({ ...d }));

  const { data, error } = await supabase
    .from('custom_statuses')
    .select('id, user_id, channel, label, color, sort_order')
    .in('user_id', ids)
    .eq('channel', channel)
    .order('sort_order', { ascending: true });

  if (error) throw error;

  const unique = dedupeByLabel(data || []);
  if (unique.length === 0) {
    return channelDefaults(channel).map((d) => ({ ...d }));
  }
  return unique;
}

/**
 * Labels only (deduped, sorted as stored).
 */
export async function fetchCustomStatusLabels({ userIds, channel }) {
  const rows = await fetchCustomStatuses({ userIds, channel });
  return rows.map((r) => r.label).filter(Boolean);
}

/**
 * Insert a status for userId+channel if missing (case-insensitive label).
 * @returns {Promise<object|null>} inserted row or existing match (null if empty label)
 */
export async function ensureCustomStatus({
  userId,
  channel,
  label,
  color = DEFAULT_COLOR,
}) {
  const trimmed = normalizeLabel(label);
  if (!userId || !trimmed) return null;

  const { data: existing, error: findErr } = await supabase
    .from('custom_statuses')
    .select('*')
    .eq('user_id', userId)
    .eq('channel', channel);

  if (findErr) throw findErr;

  const match = (existing || []).find(
    (r) => (r.label || '').toLowerCase() === trimmed.toLowerCase(),
  );
  if (match) return match;

  const sort_order = (existing || []).length;
  const defaults = channelDefaults(channel);
  const defaultMatch = defaults.find(
    (d) => d.label.toLowerCase() === trimmed.toLowerCase(),
  );
  const resolvedColor = defaultMatch?.color || color || DEFAULT_COLOR;

  const { data, error } = await supabase
    .from('custom_statuses')
    .insert({
      user_id: userId,
      channel,
      label: trimmed,
      color: resolvedColor,
      sort_order,
    })
    .select()
    .single();

  if (error) {
    // Race: unique constraint — re-fetch
    if (error.code === '23505') {
      const { data: again } = await supabase
        .from('custom_statuses')
        .select('*')
        .eq('user_id', userId)
        .eq('channel', channel);
      return (again || []).find(
        (r) => (r.label || '').toLowerCase() === trimmed.toLowerCase(),
      ) || null;
    }
    throw error;
  }
  return data;
}

/**
 * Ensure many labels exist for a channel.
 */
export async function ensureCustomStatuses({ userId, channel, labels }) {
  const unique = [...new Set((labels || []).map(normalizeLabel).filter(Boolean))];
  const results = [];
  for (const label of unique) {
    // Sequential to keep sort_order stable and avoid races
    // eslint-disable-next-line no-await-in-loop
    results.push(await ensureCustomStatus({ userId, channel, label }));
  }
  return results;
}

function rewriteRuleList(rules, fieldKeys, oldLabel, newLabel) {
  if (!Array.isArray(rules)) return rules;
  const oldLower = oldLabel.toLowerCase();
  return rules.map((rule) => {
    const next = { ...rule };
    for (const key of fieldKeys) {
      if (typeof next[key] === 'string' && next[key].toLowerCase() === oldLower) {
        next[key] = newLabel;
      }
    }
    return next;
  });
}

/** Pure helper for in-memory rule arrays after Edit Statuses rename. */
export function applyStatusLabelRenameToRules({
  channel,
  oldLabel,
  newLabel,
  messagingActionRules,
  callStatusRules,
  callOutcomeRules,
}) {
  if (channel === 'messaging') {
    return {
      messagingActionRules: rewriteRuleList(
        messagingActionRules,
        ['status'],
        oldLabel,
        newLabel,
      ),
    };
  }
  return {
    callStatusRules: rewriteRuleList(callStatusRules, ['status'], oldLabel, newLabel),
    callOutcomeRules: rewriteRuleList(
      callOutcomeRules,
      ['suggested_call_status', 'suggested_status'],
      oldLabel,
      newLabel,
    ),
  };
}

/**
 * When a custom status label is renamed in Edit Statuses, rewrite matching
 * automation rule strings on the active rules store (team or profile).
 */
export async function rewriteAutomationRulesOnStatusRename({
  userId,
  teamId = null,
  channel,
  oldLabel,
  newLabel,
}) {
  const from = normalizeLabel(oldLabel);
  const to = normalizeLabel(newLabel);
  if (!userId || !from || !to || from.toLowerCase() === to.toLowerCase()) return;

  if (teamId) {
    const { data: team, error } = await supabase
      .from('teams')
      .select('messaging_action_rules, call_status_rules, call_outcome_rules')
      .eq('id', teamId)
      .maybeSingle();
    if (error) throw error;
    if (!team) return;

    const patch = {};
    if (channel === 'messaging') {
      patch.messaging_action_rules = rewriteRuleList(
        team.messaging_action_rules,
        ['status'],
        from,
        to,
      );
    } else {
      patch.call_status_rules = rewriteRuleList(
        team.call_status_rules,
        ['status'],
        from,
        to,
      );
      patch.call_outcome_rules = rewriteRuleList(
        team.call_outcome_rules,
        ['suggested_call_status', 'suggested_status'],
        from,
        to,
      );
    }

    const { error: updErr } = await supabase.from('teams').update(patch).eq('id', teamId);
    if (updErr) throw updErr;
    return;
  }

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('messaging_action_rules, call_status_rules, call_outcome_rules')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!profile) return;

  const patch = {};
  if (channel === 'messaging') {
    patch.messaging_action_rules = rewriteRuleList(
      profile.messaging_action_rules,
      ['status'],
      from,
      to,
    );
  } else {
    patch.call_status_rules = rewriteRuleList(
      profile.call_status_rules,
      ['status'],
      from,
      to,
    );
    patch.call_outcome_rules = rewriteRuleList(
      profile.call_outcome_rules,
      ['suggested_call_status', 'suggested_status'],
      from,
      to,
    );
  }

  const { error: updErr } = await supabase
    .from('user_profiles')
    .update(patch)
    .eq('id', userId);
  if (updErr) throw updErr;
}
