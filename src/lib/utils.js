import { supabase } from './supabase';
import {
  PLAN_LIMITS,
  normalizePlan,
  getPlanLeadLimit,
  canInviteTeammates,
  getEffectivePlan,
  getEffectiveBillingCycle,
} from './planConfig';
import { getEffectiveUserTimeZone } from './dateTime';

export {
  PLAN_LIMITS,
  normalizePlan,
  getPlanLeadLimit,
  canInviteTeammates,
  getEffectivePlan,
  getEffectiveBillingCycle,
  getEffectiveUserTimeZone,
};

/**
 * Resolve user IDs to scope CRM queries.
 * @param {string} userId
 * @param {{ respectLeadIsolation?: boolean }} [opts]
 *   When respectLeadIsolation is true (default), hybrid members only get their own id.
 *   Pass false for always-shared workspace surfaces (templates, notes, snippets).
 */
export const getTeamIds = async (userId, opts = {}) => {
  const respectLeadIsolation = opts.respectLeadIsolation !== false;
  if (!userId) return [];
  try {
    const { data: p } = await supabase.from('user_profiles')
      .select('team_id, team_role').eq('id', userId).maybeSingle();
    if (!p || !p.team_id) return [userId];

    const role = (p.team_role || 'owner').toLowerCase();
    if (respectLeadIsolation && role === 'member') {
      const { data: team } = await supabase
        .from('teams')
        .select('members_see_own_leads_only')
        .eq('id', p.team_id)
        .maybeSingle();
      if (team?.members_see_own_leads_only) {
        return [userId];
      }
    }

    const { data: members } = await supabase.from('user_profiles')
      .select('id').eq('team_id', p.team_id);
    if (!members || members.length === 0) return [userId];
    const ids = members.map(m => m.id).filter(Boolean);
    if (!ids.includes(userId)) ids.push(userId);
    return ids;
  } catch (err) {
    console.error('Error fetching team IDs:', err);
    return [userId];
  }
};

export function cn(...inputs) {
  return inputs.filter(Boolean).join(' ');
}
