/** Single source of truth for plan limits, seats, AI credits, and legacy normalization. */

export const EXCLUDED_COUNTRY_CODES = ['IL'];

/** Legacy Pro team owners (grandfathered) kept 3 seats before Teams tier launch. */
export const LEGACY_PRO_TEAM_SEATS = 3;

export const AI_BOT_CREDITS = {
  trial: 20,
  starter: 25,
  pro: 500,
  teams: 300,
};

export const PLAN_SEATS = {
  trial: 1,
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
  free: { leads: 100, templates: 3, folders: 1, max_notes: 20, max_notes_yearly: 20, aiCredits: 0, users: 1, invoices: false, sheetsIntegration: false, calendarIntegration: false, reports: false, cold_calls: true, revenue_tracker: true, custom_columns: true, snippets: true, autoLists: true, bulkImport: true, data_export: true },
  trial: { leads: 500, templates: 3, folders: 2, max_notes: 20, max_notes_yearly: 20, aiCredits: 10, users: 1, invoices: true, sheetsIntegration: true, calendarIntegration: true, reports: true, cold_calls: true, revenue_tracker: true, custom_columns: true, snippets: true, autoLists: true, bulkImport: true, data_export: true },
  starter: { leads: 750, templates: 10, folders: null, max_notes: 500, max_notes_yearly: 500, aiCredits: 25, users: 1, invoices: true, sheetsIntegration: true, calendarIntegration: false, reports: false, cold_calls: true, revenue_tracker: true, custom_columns: true, snippets: true, autoLists: true, bulkImport: true, data_export: true },
  pro: { leads: 5000, templates: 50, folders: null, max_notes: null, max_notes_yearly: null, aiCredits: 500, users: 1, invoices: true, sheetsIntegration: true, calendarIntegration: true, reports: true, cold_calls: true, revenue_tracker: true, custom_columns: true, snippets: true, autoLists: true, bulkImport: true, data_export: true },
  teams: { leads: null, templates: null, folders: null, max_notes: null, max_notes_yearly: null, aiCredits: 300, users: 5, invoices: true, sheetsIntegration: true, calendarIntegration: true, reports: true, cold_calls: true, revenue_tracker: true, custom_columns: true, snippets: true, autoLists: true, bulkImport: true, data_export: true },
};

export function normalizePlan(plan) {
  const p = (plan || 'free').toLowerCase();
  if (p === 'enterprise' || p === 'lifetime') return 'pro'; // removed enterprise and lifetime
  if (p in PLAN_LIMITS) return p;
  return 'free';
}

export function getLimit(limitsObj, key) {
  if (!limitsObj) {
    console.warn(`[getLimit] Missing limits object. Fail-open for key: ${key}`);
    return Infinity;
  }
  if (key in limitsObj) {
    return limitsObj[key];
  }
  console.warn(`[getLimit] Unknown limit key: ${key}. Defaulting to ALLOWED (Infinity).`);
  return Infinity;
}

let limitsFetched = false;
let limitsPromise = null;

export async function fetchPlanLimits(supabase) {
  if (limitsFetched) return PLAN_LIMITS;
  if (limitsPromise) return limitsPromise;
  
  limitsPromise = supabase.from('plan_limits').select('*').then(({ data, error }) => {
    if (!error && data) {
      data.forEach((row) => {
        if (!['free', 'trial', 'starter', 'pro', 'teams'].includes(row.plan)) return;
        
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
          max_notes: row.max_notes,
          max_notes_yearly: row.max_notes_yearly,
          reports: row.reports,
          invoices: row.invoices,
          revenue_tracker: row.revenue_tracker,
          cold_calls: row.cold_calls,
          custom_columns: row.custom_columns,
          snippets: row.snippets,
          data_export: row.data_export ?? true,
        };
      });
      limitsFetched = true;
    } else {
      console.warn('[fetchPlanLimits] Failed to fetch limits from DB, using hardcoded fallbacks', error);
    }
    return PLAN_LIMITS;
  }).catch((err) => {
    console.warn('[fetchPlanLimits] Exception fetching limits, using hardcoded fallbacks', err);
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

/** Starter yearly lead cap (not a flat 2x of monthly 750). */
export const STARTER_YEARLY_LEADS = 1500;
export const PRO_YEARLY_LEADS = 10000;

export function getPlanLeadLimit(plan, billingCycle) {
  const key = normalizePlan(plan);
  const base = getLimit(PLAN_LIMITS[key], 'leads');
  if (base === null || base === Infinity) return null;
  if ((billingCycle ?? '').toLowerCase() !== 'yearly') return base;
  if (key === 'starter') return STARTER_YEARLY_LEADS;
  if (key === 'pro') return PRO_YEARLY_LEADS;
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
