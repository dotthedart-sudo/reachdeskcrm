import { supabase } from './supabase';
import {
  canInviteTeammates,
  getExtraSeats,
  getTeamWorkspaceSeatLimit,
  normalizePlan,
} from './planConfig';

export { PLAN_SEATS as TEAM_SEAT_LIMIT } from './planConfig';

/** Paid plans with access through end of billing period (includes scheduled cancel). */
export function isPaidPlanActive(profile) {
  if (!profile?.plan_status) return true;
  return profile.plan_status === 'active' || profile.plan_status === 'cancelling';
}

/** Solo user on an active personal Starter / Pro / Teams subscription (not already a member). */
export function hasActivePersonalPaidPlan(profile) {
  if (!profile || isTeamMember(profile)) return false;
  const plan = normalizePlan(profile.plan);
  if (!['starter', 'pro', 'teams'].includes(plan)) return false;
  return isPaidPlanActive(profile);
}

/** Invited teammate — billing is owned by the workspace owner, not this user. */
export function isTeamMember(profile) {
  if (!profile?.team_id) return false;
  return (profile.team_role || 'owner').toLowerCase() === 'member';
}

const PLAN_DISPLAY_NAMES = {
  trial: 'Trial',
  starter: 'Starter',
  pro: 'Pro',
  teams: 'Teams',
  lifetime: 'Lifetime',
};

/** Sidebar / UI label for current plan (members use workspace effective plan). */
export function getSidebarPlanLabel(profile) {
  if (!profile) return '';
  const key = normalizePlan(profile.effective_plan ?? profile.plan);
  const base = PLAN_DISPLAY_NAMES[key] || key.charAt(0).toUpperCase() + key.slice(1);
  if (isTeamMember(profile)) return `${base} · Member`;
  return base;
}

/** True when a stored invite token or pending email invite exists for this user. */
export async function hasPendingTeamInvite(email) {
  if (getStoredInviteToken()) return true;
  if (!email) return false;
  const { data, error } = await supabase
    .from('team_invitations')
    .select('id')
    .eq('status', 'pending')
    .ilike('invited_email', email.trim())
    .limit(1);
  if (error) {
    console.warn('[teamWorkspace] hasPendingTeamInvite failed:', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

const INVITE_DEFER_KEY = 'rd_invite_defer_paid';

export function wasPaidInviteDeferred() {
  try {
    return sessionStorage.getItem(INVITE_DEFER_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPaidInviteDeferred(deferred) {
  try {
    if (deferred) sessionStorage.setItem(INVITE_DEFER_KEY, '1');
    else sessionStorage.removeItem(INVITE_DEFER_KEY);
  } catch { /* ignore */ }
}

/** May view Settings billing and open personal Paddle checkout. */
export function canManageOwnBilling(profile) {
  if (!profile) return false;
  if (profile.role === 'admin') return false;
  return !isTeamMember(profile);
}

/** Owner who can manage invites/permissions (Teams, Trial, or grandfathered Pro with team_id). */
export function isProTeamOwner(profile) {
  if (!profile) return false;
  const role = (profile.team_role || 'owner').toLowerCase();
  if (role !== 'owner') return false;
  const plan = normalizePlan(profile.plan);
  if (plan === 'teams' || plan === 'trial') {
    if (plan === 'teams' && profile.plan_status && !isPaidPlanActive(profile)) return false;
    return true;
  }
  // Grandfather: legacy Pro owners who already created a workspace
  if (plan === 'pro' && profile.team_id) {
    if (profile.plan_status && !isPaidPlanActive(profile)) return false;
    return true;
  }
  return false;
}

/** Full Teams page access (not upgrade-locked): trial, teams (any role), or grandfathered Pro owner. */
export function hasTeamsPageAccess(profile) {
  if (!profile) return false;
  const plan = normalizePlan(profile.plan);
  if (plan === 'trial') return true;
  if (plan === 'teams') {
    if (profile.plan_status && !isPaidPlanActive(profile)) return false;
    return true;
  }
  if (plan === 'pro' && profile.team_id) {
    if (profile.plan_status && !isPaidPlanActive(profile)) return false;
    return true;
  }
  return false;
}

/** Starter / Pro (no workspace) / lifetime — nav visible but page shows upgrade. */
export function isTeamsFeatureLocked(profile) {
  return !hasTeamsPageAccess(profile);
}

export function isTeamOwner(profile) {
  if (!profile) return false;
  return (profile.team_role || 'owner').toLowerCase() === 'owner';
}

/** True when the workspace has more than one user (invited member joined). */
export function hasTeammates(teamIds) {
  return Array.isArray(teamIds) && teamIds.length > 1;
}

/** Display name from teamProfilesMap entry (object or legacy email string). */
export function teamMemberDisplayName(entry, fallback = 'Teammate') {
  if (!entry) return fallback;
  if (typeof entry === 'string') return entry;
  return entry.full_name || entry.email || fallback;
}

/** Email string from teamProfilesMap entry. */
export function teamMemberEmail(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  return entry.email || '';
}

export function getSeatsUsed(memberCount, pendingInviteCount) {
  return (memberCount ?? 0) + (pendingInviteCount ?? 0);
}

export function getTeamSeatLimit(planOrProfile, extraSeats) {
  if (planOrProfile && typeof planOrProfile === 'object') {
    return getTeamWorkspaceSeatLimit(planOrProfile.plan, getExtraSeats(planOrProfile));
  }
  return getTeamWorkspaceSeatLimit(planOrProfile, extraSeats ?? 0);
}

export function getSeatsRemaining(planOrProfile, memberCount, pendingInviteCount) {
  const limit = typeof planOrProfile === 'object'
    ? getTeamSeatLimit(planOrProfile)
    : getTeamSeatLimit(planOrProfile, 0);
  return Math.max(0, limit - getSeatsUsed(memberCount, pendingInviteCount));
}

/** Teams owners at seat cap can self-serve purchase extra seats. */
export function canPurchaseExtraSeats(profile) {
  if (!profile) return false;
  if (normalizePlan(profile.plan) !== 'teams') return false;
  if ((profile.team_role || 'owner').toLowerCase() !== 'owner') return false;
  if (profile.plan_status && !isPaidPlanActive(profile)) return false;
  return true;
}

/** Creates team_id for eligible owners via DB RPC. Returns updated team_id or null. */
export async function ensureProTeamWorkspace(userId) {
  if (!userId) return null;
  const { data, error } = await supabase.rpc('ensure_pro_team_workspace');
  if (error) {
    console.error('[teamWorkspace] ensure_pro_team_workspace failed:', error);
    throw error;
  }
  return data;
}

export async function acceptTeamInvitationByToken(inviteToken) {
  if (!inviteToken) return { ok: false, error: 'Missing invite token' };
  const { data, error } = await supabase.rpc('accept_team_invitation', {
    p_invite_token: inviteToken,
  });
  if (error) throw error;
  return data ?? { ok: false, error: 'Unknown error' };
}

export async function acceptPendingTeamInviteByEmail() {
  const { data, error } = await supabase.rpc('accept_pending_team_invite_by_email');
  if (error) throw error;
  return data ?? { ok: false };
}

export function getStoredInviteToken() {
  try {
    return sessionStorage.getItem('rd_invite_token') || null;
  } catch {
    return null;
  }
}

export function storeInviteToken(token) {
  try {
    if (token) sessionStorage.setItem('rd_invite_token', token);
    else sessionStorage.removeItem('rd_invite_token');
  } catch { /* ignore */ }
}

const INVITE_RETRY_DELAY_MS = 600;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Look up team owner profile (teams.owner_id, then team_role=owner fallback). */
export async function getTeamOwnerProfileForMember(profile) {
  if (!profile?.team_id) return null;
  if ((profile.team_role || 'owner').toLowerCase() !== 'member') return null;

  const { data: team } = await supabase
    .from('teams')
    .select('owner_id')
    .eq('id', profile.team_id)
    .maybeSingle();

  if (team?.owner_id) {
    const { data: ownerById } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, plan, plan_status, team_id, team_role')
      .eq('id', team.owner_id)
      .maybeSingle();
    if (ownerById) return ownerById;
  }

  const { data: ownerByRole } = await supabase
    .from('user_profiles')
    .select('id, plan, plan_status, team_id, team_role')
    .eq('team_id', profile.team_id)
    .eq('team_role', 'owner')
    .maybeSingle();

  return ownerByRole ?? null;
}

/** Member on a team whose owner has active Teams plan — bypasses personal trial/sub lock. */
export async function isActiveTeamMember(profile) {
  if (!profile?.team_id) return false;
  if ((profile.team_role || 'owner').toLowerCase() !== 'member') return false;

  const { data, error } = await supabase.rpc('is_active_team_member');
  if (error) {
    console.warn('[teamWorkspace] is_active_team_member RPC failed:', error);
    return false;
  }
  return data === true;
}

/**
 * Accept pending team invite (URL token or email match). Retries briefly for signup race conditions.
 * Pass profile + confirmPaidJoin:false (default) to gate active personal paid plans behind a confirm UI.
 */
export async function processTeamInvites({
  retries = 2,
  profile = null,
  confirmPaidJoin = false,
} = {}) {
  if (hasActivePersonalPaidPlan(profile) && !confirmPaidJoin) {
    if (wasPaidInviteDeferred()) {
      return { ok: false, deferred: true };
    }
    const pending = await hasPendingTeamInvite(profile.email);
    if (pending) {
      return { ok: false, needsPaidJoinConfirm: true };
    }
  }

  const token = getStoredInviteToken();
  let lastResult = { ok: false };

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (token) {
      try {
        const result = await acceptTeamInvitationByToken(token);
        lastResult = result ?? { ok: false };
        if (result?.ok) {
          storeInviteToken(null);
          setPaidInviteDeferred(false);
          return result;
        }
      } catch (err) {
        console.warn('[teamWorkspace] accept_team_invitation failed:', err);
        lastResult = { ok: false, error: err.message };
      }
    }

    try {
      const emailResult = await acceptPendingTeamInviteByEmail();
      lastResult = emailResult ?? { ok: false };
      if (emailResult?.ok) {
        storeInviteToken(null);
        setPaidInviteDeferred(false);
        return emailResult;
      }
    } catch (err) {
      console.warn('[teamWorkspace] accept_pending_team_invite_by_email failed:', err);
      lastResult = { ok: false, error: err.message };
    }

    if (attempt < retries) {
      await delay(INVITE_RETRY_DELAY_MS);
    }
  }

  if (!lastResult?.ok && (token || lastResult?.error)) {
    console.warn('[teamWorkspace] processTeamInvites did not accept invite:', lastResult);
  }

  return lastResult;
}

/** Refresh profile after invite accept (for auth callback when full fetchProfile is skipped). */
export async function refreshProfileAfterInvite(userId, profile = null) {
  let p = profile;
  if (!p && userId) {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    p = data;
  }

  const result = await processTeamInvites({ retries: 2, profile: p });
  if (result?.needsPaidJoinConfirm) {
    return { result, profile: null, confirmProfile: p };
  }
  if (!result?.ok || !userId) return { result, profile: null };

  const { data: refreshed } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  return { result, profile: refreshed ?? null };
}

export async function ensureProOwnerWorkspaceIfNeeded(profile) {
  if (!profile?.id) return profile;
  const plan = normalizePlan(profile.plan);
  const role = (profile.team_role || 'owner').toLowerCase();
  if ((plan !== 'teams' && plan !== 'trial') || role === 'member' || profile.team_id) return profile;
  if (plan === 'teams' && profile.plan_status && !isPaidPlanActive(profile)) return profile;
  await ensureProTeamWorkspace(profile.id);
  const { data: refreshed } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', profile.id)
    .maybeSingle();
  return refreshed || profile;
}

export async function getTeamOwnerProfile(teamId) {
  if (!teamId) return null;
  const { data } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, plan')
    .eq('team_id', teamId)
    .eq('team_role', 'owner')
    .maybeSingle();
  return data;
}

export async function getTeamSettings(teamId) {
  if (!teamId) {
    return { members_can_view_revenue: false, members_see_own_leads_only: true };
  }
  const { data, error } = await supabase
    .from('teams')
    .select('members_can_view_revenue, members_see_own_leads_only')
    .eq('id', teamId)
    .maybeSingle();
  if (error) {
    console.error('[teamWorkspace] getTeamSettings failed:', error);
    return { members_can_view_revenue: false, members_see_own_leads_only: true };
  }
  return {
    members_can_view_revenue: !!data?.members_can_view_revenue,
    members_see_own_leads_only: !!data?.members_see_own_leads_only,
  };
}

export async function updateTeamSettings(teamId, settings) {
  if (!teamId) throw new Error('Missing team id');
  const { data, error } = await supabase
    .from('teams')
    .update({
      members_can_view_revenue: !!settings.members_can_view_revenue,
      members_see_own_leads_only: !!settings.members_see_own_leads_only,
    })
    .eq('id', teamId)
    .select('members_can_view_revenue, members_see_own_leads_only')
    .single();
  if (error) throw error;
  return data;
}

export { canInviteTeammates };

/** Attach workspace owner plan for limits/features when user is a team member. */
export async function enrichProfileWithEffectivePlan(profile) {
  if (!profile?.id) return profile;
  if ((profile.team_role || 'owner').toLowerCase() !== 'member' || !profile.team_id) {
    return profile;
  }

  try {
    const { data, error } = await supabase.rpc('get_my_plan_context');
    if (error || !data) return profile;

    return {
      ...profile,
      effective_plan: data.plan ?? profile.plan,
      effective_billing_cycle: data.billing_cycle ?? profile.billing_cycle,
      inherits_team_plan: !!data.inherits_workspace,
    };
  } catch (err) {
    console.warn('[teamWorkspace] get_my_plan_context failed:', err);
    return profile;
  }
}
