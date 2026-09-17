/** Single source of truth for plan limits, seats, AI credits, and legacy normalization. */

export const EXCLUDED_COUNTRY_CODES = ['IL'];

/** Legacy Pro team owners (grandfathered) kept 3 seats before Teams tier launch. */
export const LEGACY_PRO_TEAM_SEATS = 3;

export const AI_BOT_CREDITS = {
  trial: 20,
  starter: 100,
  pro: 500,
  teams: 500,
};

export const PLAN_SEATS = {
  trial: 5,
  starter: 1,
  pro: 1,
  teams: 5,
};

/** Paid add-on beyond Teams included seats ($5/seat/month). */
export const EXTRA_SEAT_USD_MONTHLY = 5;
export const TEAMS_INCLUDED_SEATS = PLAN_SEATS.teams;

/** Paddle price for paid seats beyond the 5 included (sync with supabase/functions/_shared/prices.ts). */
export const EXTRA_TEAMS_SEAT_PRICE_ID = 'pri_01kzhm4mb02kxwged2bqfyqxhx';

/** Max extra seats selectable in one checkout or purchase action. */
export const MAX_EXTRA_SEATS_PER_ACTION = 50;

export let PLAN_LIMITS = {
  free: { leads: 100, templates: 3, folders: 1, users: 1, aiCredits: 0, calendarIntegration: false, sheetsIntegration: false, bulkImport: true, autoLists: false, extensionCaptures: 25 },
  trial: { leads: 100, templates: 3, folders: 1, users: 1, aiCredits: 20, calendarIntegration: true, sheetsIntegration: true, bulkImport: true, autoLists: true, extensionCaptures: 25 },
  starter: { leads: 750, templates: null, folders: null, users: 1, aiCredits: 0, calendarIntegration: false, sheetsIntegration: true, bulkImport: true, autoLists: true, extensionCaptures: 25 },
  pro: { leads: 5000, templates: null, folders: null, users: 1, aiCredits: 500, calendarIntegration: true, sheetsIntegration: true, bulkImport: true, autoLists: true, extensionCaptures: 25 },
  teams: { leads: null, templates: null, folders: null, users: null, aiCredits: 500, calendarIntegration: true, sheetsIntegration: true, bulkImport: true, autoLists: true, extensionCaptures: 25 },
  lifetime: { leads: null, templates: null, folders: null, users: null, aiCredits: 500, calendarIntegration: true, sheetsIntegration: true, bulkImport: true, autoLists: true, extensionCaptures: 25 },
};

export function normalizePlan(plan) {
  const p = (plan || 'free').toLowerCase();
  if (p === 'enterprise') return 'lifetime';
  if (p in PLAN_LIMITS) return p;
  return 'free';
}

let limitsFetched = false;
let limitsPromise = null;

export async function fetchPlanLimits(supabase) {
  if (limitsFetched) return PLAN_LIMITS;
  if (limitsPromise) return limitsPromise;
  
  limitsPromise = supabase.from('plan_limits').select('*').then(({ data, error }) => {
    if (!error && data) {
      data.forEach((row) => {
        PLAN_LIMITS[row.plan] = {
          leads: row.max_leads,
          templates: row.max_templates,
          folders: row.max_folders,
          users: row.max_users,
          aiCredits: row.ai_credits,
          calendarIntegration: row.calendar_integration,
          sheetsIntegration: row.sheets_integration,
          bulkImport: row.bulk_import,
          autoLists: row.auto_lists,
          extensionCaptures: row.max_extension_captures,
        };
      });
      limitsFetched = true;
    }
    return PLAN_LIMITS;
  });
  return limitsPromise;
}

export const NEXT_PLAN = {
  free: 'Starter',
  trial: 'Starter',
  starter: 'Pro',
  pro: 'Teams',
  teams: null,
};

export const NEXT_PLAN_ID = {
  free: 'starter',
  trial: 'starter',
  starter: 'pro',
  pro: 'teams',
  teams: null,
};

/** Starter yearly lead cap (not a flat 2× of monthly 750). */
export const STARTER_YEARLY_LEADS = 2000;

export function getPlanLeadLimit(plan, billingCycle) {
  const key = normalizePlan(plan);
  const base = PLAN_LIMITS[key]?.leads ?? null;
  if (base === null) return null;
  if ((billingCycle ?? '').toLowerCase() !== 'yearly') return base;
  if (key === 'starter') return STARTER_YEARLY_LEADS;
  if (key === 'pro') return base * 2;
  return base;
}

/** Plan used for limits and feature gates (team members inherit workspace owner plan). */
export function getEffectivePlan(profile) {
  if (!profile) return 'free';
  return normalizePlan(profile.effective_plan ?? profile.plan);
}

export function getEffectiveBillingCycle(profile) {
  return profile?.effective_billing_cycle ?? profile?.billing_cycle ?? null;
}

export function getPlanSeatLimit(plan) {
  return PLAN_SEATS[normalizePlan(plan)] ?? 1;
}

export function getExtraSeats(profile) {
  if (!profile || normalizePlan(profile.plan) !== 'teams') return 0;
  return Math.max(0, Number(profile.extra_seats) || 0);
}

/** Seat cap for team workspace UI (trial/Teams = 5 + paid extras; grandfathered Pro owners with team_id = 3). */
export function getTeamWorkspaceSeatLimit(plan, extraSeats = 0) {
  const key = normalizePlan(plan);
  if (key === 'teams') return PLAN_SEATS.teams + Math.max(0, extraSeats);
  if (key === 'trial') return PLAN_SEATS.teams;
  if (key === 'pro') return LEGACY_PRO_TEAM_SEATS;
  return 1;
}

export function canInviteTeammates(plan) {
  const key = normalizePlan(plan);
  return key === 'teams' || key === 'trial';
}
