/** Team workspace seat caps — keep in sync with src/lib/planConfig.js */

export const TEAMS_INCLUDED_SEATS = 5;
export const TRIAL_SEAT_LIMIT = 5;
export const LEGACY_PRO_TEAM_SEAT_LIMIT = 3;

export function normalizePlan(plan: string | null | undefined): string {
  return (plan || 'trial').toLowerCase();
}

export function getExtraSeatsFromProfile(profile: { plan?: string | null; extra_seats?: number | null }): number {
  if (normalizePlan(profile.plan) !== 'teams') return 0;
  return Math.max(0, Number(profile.extra_seats) || 0);
}

export function getTeamSeatLimitFromProfile(profile: {
  plan?: string | null;
  team_id?: string | null;
  extra_seats?: number | null;
}): number {
  const plan = normalizePlan(profile.plan);
  if (plan === 'teams') {
    return TEAMS_INCLUDED_SEATS + getExtraSeatsFromProfile(profile);
  }
  if (plan === 'trial') return TRIAL_SEAT_LIMIT;
  if (plan === 'pro' && profile.team_id) return LEGACY_PRO_TEAM_SEAT_LIMIT;
  return 0;
}

export function canInviteTeammates(plan: string, teamId: string | null): boolean {
  return getTeamSeatLimitFromProfile({ plan, team_id: teamId }) > 0;
}
