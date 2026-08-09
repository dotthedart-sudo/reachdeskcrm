import { supabase } from './supabase';
import { hasTeammates, isTeamOwner } from './teamWorkspace';
import { fetchTeamTimelineForDay as fetchTimelineRpc } from './leadTimeline';

export function hasTeamCalendarActivity(profile, teamIds = null) {
  if (Array.isArray(teamIds)) return hasTeammates(teamIds);
  return false;
}

export function canViewTeamCalendarFeed(currentUser, perms) {
  if (!currentUser?.team_id || !perms) return isTeamOwner(currentUser);
  if (isTeamOwner(currentUser)) return true;
  if (perms.calendar_activity_sharing === 'off') return false;
  if (perms.calendar_activity_sharing === 'all_members') return true;
  return !!perms.memberPermissions?.[currentUser.id]?.can_view_team_calendar_activity;
}

export async function fetchTeamCalendarPermissions(teamId) {
  if (!teamId) {
    return {
      calendar_activity_sharing: 'all_members',
      memberPermissions: {},
    };
  }
  const [{ data: team }, { data: perms }] = await Promise.all([
    supabase
      .from('teams')
      .select('calendar_activity_sharing')
      .eq('id', teamId)
      .maybeSingle(),
    supabase
      .from('team_member_permissions')
      .select('user_id, can_view_team_calendar_activity')
      .eq('team_id', teamId),
  ]);

  const memberPermissions = {};
  for (const row of perms || []) {
    memberPermissions[row.user_id] = {
      can_view_team_calendar_activity: !!row.can_view_team_calendar_activity,
    };
  }

  return {
    calendar_activity_sharing: team?.calendar_activity_sharing || 'all_members',
    memberPermissions,
  };
}

export async function updateTeamCalendarSettings(teamId, settings) {
  const { data, error } = await supabase
    .from('teams')
    .update({
      calendar_activity_sharing: settings.calendar_activity_sharing || 'off',
    })
    .eq('id', teamId)
    .select('calendar_activity_sharing')
    .single();
  if (error) throw error;
  return data;
}

export async function upsertMemberCalendarPermission(teamId, userId, permissions) {
  const { data: existing } = await supabase
    .from('team_member_permissions')
    .select('can_view_team_call_activity, can_view_call_notes')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();

  const { data, error } = await supabase
    .from('team_member_permissions')
    .upsert(
      {
        team_id: teamId,
        user_id: userId,
        can_view_team_call_activity: !!existing?.can_view_team_call_activity,
        can_view_call_notes: !!existing?.can_view_call_notes,
        can_view_team_calendar_activity: !!permissions.can_view_team_calendar_activity,
      },
      { onConflict: 'team_id,user_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function fetchTeamMembersForCalendar(teamId) {
  if (!teamId) return [];
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, team_role')
    .eq('team_id', teamId)
    .order('team_role', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchTeamPlannedTasks({
  fromDate,
  toDate,
  memberId = null,
} = {}) {
  const { data, error } = await supabase.rpc('get_team_planned_outreach', {
    p_from: fromDate,
    p_to: toDate,
    p_member_id: memberId || null,
  });
  if (error) throw error;
  return data || [];
}

export async function fetchCalendarTimelineForDay(opts = {}) {
  return fetchTimelineRpc(opts);
}

export { fetchTeamTimelineForDay } from './leadTimeline';
