import { supabase } from './supabase';
import { PLAN_LIMITS, normalizePlan, getEffectivePlan } from './planConfig';
import { isActiveTeamMember } from './teamWorkspace';
import {
  applyOutcomeToLead,
  applyCallStatusToLead,
  displayCallStatus,
  outcomeForCallStatus,
  normalizeCallStatus,
  getOutcomeMapping,
  shouldAutoApplyCallSuggestions,
} from './callOutcomeRules';
import { captureDeviceTimestamp } from './dateTime';
import { logLeadTimelineEvent } from './leadTimeline';

export { computeNextFollowUp, leadDisplayName } from './outreachQueue';
export { CALL_OUTCOMES } from './callOutcomes';

export function hasOutreachByPlan(profile) {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  const key = getEffectivePlan(profile);
  return !!PLAN_LIMITS[key]?.coldOutreach;
}

/** Trial/Pro/Teams plan OR active Teams workspace member. */
export async function getEffectiveOutreachAccess(profile) {
  if (!profile) return false;
  if (hasOutreachByPlan(profile)) return true;
  return isActiveTeamMember(profile);
}

export async function getEffectiveCalendarAccess(profile) {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  const key = getEffectivePlan(profile);
  if (PLAN_LIMITS[key]?.calendarIntegration) return true;
  return isActiveTeamMember(profile);
}

export function hasReportsAccess(profile) {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  const key = getEffectivePlan(profile);
  return !!PLAN_LIMITS[key]?.cumulativeReports;
}

/** Trial/Pro/Teams plan OR active Teams workspace member on a Reports-enabled workspace. */
export async function getEffectiveReportsAccess(profile) {
  if (!profile) return false;
  if (hasReportsAccess(profile)) return true;
  return isActiveTeamMember(profile);
}

import { hasTeammates } from './teamWorkspace';

export function hasTeamCallActivity(profile, teamIds = null) {
  if (Array.isArray(teamIds)) return hasTeammates(teamIds);
  return false;
}

export async function insertCallAttempt({
  userId,
  leadId,
  outcome,
  outcome_base,
  note,
  noteVisibility = 'team',
  teamId = null,
  occurredAt = null,
}) {
  const outcomeText = typeof outcome === 'string' ? outcome.trim() : '';
  if (!outcomeText) {
    throw new Error('Call outcome is required.');
  }

  const payload = {
    lead_id: leadId,
    user_id: userId,
    outcome: outcomeText,
    outcome_base: outcome_base || outcomeText,
    note: note?.trim() || null,
    note_visibility: noteVisibility === 'private' ? 'private' : 'team',
    occurred_at: occurredAt || new Date().toISOString(),
  };
  if (teamId) payload.team_id = teamId;

  const { data, error } = await supabase
    .from('lead_call_attempts')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Log call attempt and optionally update lead status + call_action from outcome rules. */
export async function logCallWithUpdates({
  userId,
  leadId,
  outcome,
  outcomeBase,
  note = null,
  noteVisibility = 'team',
  teamId = null,
  updateLeadFields = true,
  customOutcomeRules = null,
  timeZone = null,
  profile = null,
  occurredAt = null,
}) {
  const stamp = captureDeviceTimestamp(timeZone);
  const when = occurredAt ? new Date(occurredAt) : null;
  const occurredIso = when && !Number.isNaN(when.getTime()) ? when.toISOString() : stamp.occurredAt;
  const attempt = await insertCallAttempt({
    userId,
    leadId,
    outcome,
    outcome_base: outcomeBase,
    note,
    noteVisibility,
    teamId,
    occurredAt: occurredIso,
  });

  let leadUpdates = null;
  let prevCallStatus = null;
  if (updateLeadFields) {
    const { data: before } = await supabase
      .from('leads')
      .select('call_status')
      .eq('id', leadId)
      .maybeSingle();
    prevCallStatus = before?.call_status ?? null;

    leadUpdates = await applyOutcomeToLead(leadId, outcomeBase, userId, profile, customOutcomeRules);

    // Stamp last_called_at (+ last_contacted_at) to the logged time (or device now)
    const timePatch = {
      last_called_at: occurredIso,
      last_contacted_at: occurredIso,
    };
    const { data: stamped, error: stampErr } = await supabase
      .from('leads')
      .update(timePatch)
      .eq('id', leadId)
      .select('*')
      .single();
    if (!stampErr && stamped) {
      leadUpdates = { ...(leadUpdates || {}), ...stamped };
    }
  }

  const prevDisplay = displayCallStatus(prevCallStatus);
  const nextDisplay = displayCallStatus(leadUpdates?.call_status ?? prevCallStatus);
  const callStatusDelta =
    leadUpdates?.call_status != null && normalizeCallStatus(prevCallStatus) !== normalizeCallStatus(leadUpdates.call_status)
      ? { from: prevDisplay, to: nextDisplay }
      : null;

  await logLeadTimelineEvent({
    leadId,
    userId,
    teamId,
    eventType: 'call_logged',
    summary: callStatusDelta
      ? `Call: ${outcome} · Call status → ${callStatusDelta.to}`
      : `Call: ${outcome}`,
    detail: {
      outcome,
      note: note?.trim() || null,
      ...(callStatusDelta || {}),
    },
    timeZone,
    occurredAt: occurredIso,
  });

  return { attempt, leadUpdates };
}

/** Changing Call Queue status counts as a call attempt and applies call-action/priority rules. */
export async function logCallStatusChange({
  userId,
  leadId,
  newCallStatus,
  teamId = null,
  timeZone = null,
  profile = null,
}) {
  const { data: before } = await supabase
    .from('leads')
    .select('call_status')
    .eq('id', leadId)
    .maybeSingle();

  const prevCallStatus = before?.call_status ?? null;
  if (normalizeCallStatus(prevCallStatus) === normalizeCallStatus(newCallStatus)) {
    return null;
  }

  const outcome = outcomeForCallStatus(newCallStatus);
  const stamp = captureDeviceTimestamp(timeZone);
  const attempt = await insertCallAttempt({
    userId,
    leadId,
    outcome,
    teamId,
    occurredAt: stamp.occurredAt,
  });

  const leadUpdates = await applyCallStatusToLead(leadId, newCallStatus, userId, profile);

  const timePatch = {
    last_called_at: stamp.occurredAt,
    last_contacted_at: stamp.occurredAt,
  };
  const { data: stamped, error: stampErr } = await supabase
    .from('leads')
    .update(timePatch)
    .eq('id', leadId)
    .select('*')
    .single();

  const mergedUpdates = stampErr ? leadUpdates : { ...(leadUpdates || {}), ...stamped };
  const prevDisplay = displayCallStatus(prevCallStatus);
  const nextDisplay = displayCallStatus(newCallStatus);

  await logLeadTimelineEvent({
    leadId,
    userId,
    teamId,
    eventType: 'call_logged',
    summary: `Call status → ${nextDisplay}`,
    detail: {
      outcome,
      from: prevDisplay,
      to: nextDisplay,
    },
    timeZone,
    occurredAt: stamp.occurredAt,
  });

  return { attempt, leadUpdates: mergedUpdates };
}

export async function updateCallAttempt(
  attemptId,
  { outcome, outcome_base, note, noteVisibility, occurredAt },
  context = {}
) {
  const updates = {};
  if (outcome !== undefined) {
    updates.outcome = outcome;
    updates.outcome_base = outcome_base || outcome;
  }
  if (outcome_base !== undefined) {
    updates.outcome_base = outcome_base;
  }
  if (note !== undefined) updates.note = note?.trim() || null;
  if (noteVisibility !== undefined) {
    updates.note_visibility = noteVisibility === 'private' ? 'private' : 'team';
  }
  if (occurredAt !== undefined) {
    updates.occurred_at = occurredAt ? new Date(occurredAt).toISOString() : null;
  }
  const { data, error } = await supabase
    .from('lead_call_attempts')
    .update(updates)
    .eq('id', attemptId)
    .select('*')
    .single();
  if (error) throw error;

  const { oldOutcome, isLatest, profile, lead } = context;
  if (isLatest && outcome && oldOutcome && outcome !== oldOutcome && lead && profile && shouldAutoApplyCallSuggestions(profile)) {
    const oldMapping = getOutcomeMapping(oldOutcome, lead.user_id, profile);
    const newMapping = getOutcomeMapping(outcome, lead.user_id, profile);
    const patch = {};
    const oldStatus = oldMapping?.suggested_call_status ?? oldMapping?.suggested_status;
    const newStatus = newMapping?.suggested_call_status ?? newMapping?.suggested_status;
    if (newStatus && normalizeCallStatus(lead.call_status) === normalizeCallStatus(oldStatus)) {
      patch.call_status = newStatus;
    }
    if (newMapping?.suggested_call_action && lead.call_action === oldMapping?.suggested_call_action) {
      patch.call_action = newMapping.suggested_call_action;
    }
    if (newMapping?.suggested_priority && lead.priority === oldMapping?.suggested_priority) {
      patch.priority = newMapping.suggested_priority;
    }
    if (Object.keys(patch).length > 0) {
      await supabase.from('leads').update(patch).eq('id', lead.id);
    }
  }

  return data;
}

export async function deleteCallAttempt(id) {
  const { error } = await supabase.from('lead_call_attempts').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteCallAttempts(ids = []) {
  if (!ids.length) return;
  const { error } = await supabase.from('lead_call_attempts').delete().in('id', ids);
  if (error) throw error;
}

export async function fetchMyCallAttempts(userId) {
  const { data, error } = await supabase
    .from('lead_call_attempts')
    .select('id, lead_id, user_id, outcome, note, note_visibility, created_at, occurred_at')
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Sync lead.last_called_at to the latest remaining attempt time for this user. */
export async function refreshLeadLastCalledAt(leadId, userId) {
  const { data: rows } = await supabase
    .from('lead_call_attempts')
    .select('occurred_at, created_at')
    .eq('lead_id', leadId)
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .limit(1);
  const latest = rows?.[0];
  const stamp = latest ? (latest.occurred_at || latest.created_at) : null;
  await supabase.from('leads').update({ last_called_at: stamp }).eq('id', leadId);
  return stamp;
}

export async function fetchTeamCallActivity({
  memberId = null,
  outcome = null,
  fromDate = null,
  toDate = null,
  limit = 200,
} = {}) {
  const { data, error } = await supabase.rpc('get_team_call_activity', {
    p_member_id: memberId || null,
    p_outcome: outcome || null,
    p_from: fromDate || null,
    p_to: toDate || null,
    p_limit: limit,
  });
  if (error) throw error;
  return data || [];
}

export async function fetchLeadCallTimeline(leadId) {
  const { data, error } = await supabase.rpc('get_lead_call_timeline', {
    p_lead_id: leadId,
  });
  if (error) throw error;
  return data || [];
}

export async function fetchTeamCallStats({ fromDate = null, toDate = null } = {}) {
  const { data, error } = await supabase.rpc('get_team_call_stats', {
    p_from: fromDate || null,
    p_to: toDate || null,
  });
  if (error) throw error;
  return data || [];
}

export async function fetchTeamMembersForCalls(teamId) {
  if (!teamId) return [];
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, team_role')
    .eq('team_id', teamId)
    .order('team_role', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchTeamCallPermissions(teamId) {
  if (!teamId) {
    return {
      call_activity_sharing: 'all_members',
      call_notes_visible_to_team: true,
      memberPermissions: {},
    };
  }
  const [{ data: team }, { data: perms }] = await Promise.all([
    supabase
      .from('teams')
      .select('call_activity_sharing, call_notes_visible_to_team')
      .eq('id', teamId)
      .maybeSingle(),
    supabase
      .from('team_member_permissions')
      .select('user_id, can_view_team_call_activity, can_view_call_notes')
      .eq('team_id', teamId),
  ]);

  const memberPermissions = {};
  for (const row of perms || []) {
    memberPermissions[row.user_id] = {
      can_view_team_call_activity: !!row.can_view_team_call_activity,
      can_view_call_notes: !!row.can_view_call_notes,
    };
  }

  return {
    call_activity_sharing: team?.call_activity_sharing || 'all_members',
    call_notes_visible_to_team: team?.call_notes_visible_to_team !== false,
    memberPermissions,
  };
}

export async function updateTeamCallSettings(teamId, settings) {
  const { data, error } = await supabase
    .from('teams')
    .update({
      call_activity_sharing: settings.call_activity_sharing || 'off',
      call_notes_visible_to_team: !!settings.call_notes_visible_to_team,
    })
    .eq('id', teamId)
    .select('call_activity_sharing, call_notes_visible_to_team')
    .single();
  if (error) throw error;
  return data;
}

export async function upsertMemberCallPermission(teamId, userId, permissions) {
  const { data, error } = await supabase
    .from('team_member_permissions')
    .upsert(
      {
        team_id: teamId,
        user_id: userId,
        can_view_team_call_activity: !!permissions.can_view_team_call_activity,
        can_view_call_notes: !!permissions.can_view_call_notes,
      },
      { onConflict: 'team_id,user_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Recent team calls on a lead (for calling session hint). */
export async function fetchRecentCallsOnLead(leadId, excludeUserId = null, days = 7) {
  const timeline = await fetchLeadCallTimeline(leadId);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return timeline.filter((row) => {
    if (excludeUserId && row.user_id === excludeUserId) return false;
    return new Date(row.created_at).getTime() >= cutoff;
  });
}
