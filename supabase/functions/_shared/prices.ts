/**
 * ReachDesk shared pricing — Supabase Edge Functions source of truth.
 * Keep in sync with src/components/Paywalls.jsx BILLING.
 */

export interface PlanPricing {
  priceId: string;
  usdPerMonth: string;
  usdTotal: string;
  pkrPerMonth: number;
  pkrTotal: number;
  bdtPerMonth: number;
  bdtTotal: number;
  badge: string | null;
}

export interface BillingInterval {
  label: string;
  badge: string | null;
  months: number;
  starter: PlanPricing;
  pro: PlanPricing;
  teams: PlanPricing;
}

export interface BillingMap {
  monthly: BillingInterval;
  quarterly: BillingInterval;
  yearly: BillingInterval;
}

export const BILLING: BillingMap = {
  monthly: {
    label: 'Monthly',
    badge: null,
    months: 1,
    starter: { priceId: 'pri_01kyjynvsztqyctmvng7jwm3a2', usdPerMonth: '5.00',  usdTotal: '5.00',   pkrPerMonth: 350,  pkrTotal: 350,   bdtPerMonth: 209, bdtTotal: 209, badge: null },
    pro:     { priceId: 'pri_01kym7e8a59znm8wt54233phs0', usdPerMonth: '15.00', usdTotal: '15.00',  pkrPerMonth: 999,  pkrTotal: 999,   bdtPerMonth: 599, bdtTotal: 599, badge: null },
    teams:   { priceId: 'pri_01kymbs35k74ep884frg6cvjze', usdPerMonth: '29.00', usdTotal: '29.00',  pkrPerMonth: 1949, pkrTotal: 1949,  bdtPerMonth: 1159, bdtTotal: 1159, badge: null },
  },
  quarterly: {
    label: 'Quarterly',
    badge: 'Save 15%',
    months: 3,
    starter: { priceId: 'pri_01kym6qvynxjby24z4s1303qne', usdPerMonth: '4.25',  usdTotal: '12.75',  pkrPerMonth: 298,  pkrTotal: 893,   bdtPerMonth: 178,  bdtTotal: 533,  badge: 'Save 15%' },
    pro:     { priceId: 'pri_01kym7nbacv5z4p9w9e4z3ggh7', usdPerMonth: '12.75', usdTotal: '38.25',  pkrPerMonth: 849,  pkrTotal: 2549,  bdtPerMonth: 509,  bdtTotal: 1527, badge: 'Save 15%' },
    teams:   { priceId: 'pri_01kymckgvx8xsg84zkygzfr72d', usdPerMonth: '24.65', usdTotal: '73.95',  pkrPerMonth: 1657, pkrTotal: 4971,  bdtPerMonth: 985,  bdtTotal: 2955, badge: 'Save 15%' },
  },
  yearly: {
    label: 'Yearly',
    badge: 'Save 30%',
    months: 12,
    starter: { priceId: 'pri_01kym74hqdz60rj3fn5hvtk487', usdPerMonth: '3.50',  usdTotal: '42.00',  pkrPerMonth: 245,  pkrTotal: 2940,  bdtPerMonth: 146,  bdtTotal: 1754, badge: 'Save 30%' },
    pro:     { priceId: 'pri_01kym81ydj3gdb8crd8m9qrdk2', usdPerMonth: '10.50', usdTotal: '126.00', pkrPerMonth: 699,  pkrTotal: 8392,  bdtPerMonth: 419,  bdtTotal: 5030, badge: 'Save 30%' },
    teams:   { priceId: 'pri_01kymd8sne7zm5hvz7vdqwcymg', usdPerMonth: '20.30', usdTotal: '243.60', pkrPerMonth: 1364, pkrTotal: 16368, bdtPerMonth: 811,  bdtTotal: 9732, badge: 'Save 30%' },
  },
};

/** Active checkout plans. */
export type PlanId = 'starter' | 'pro' | 'teams';

export function getPlanFromPriceId(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  const targetId = priceId.trim();
  for (const interval of Object.values(BILLING)) {
    if (interval.starter?.priceId === targetId) return 'starter';
    if (interval.pro?.priceId === targetId) return 'pro';
    if (interval.teams?.priceId === targetId) return 'teams';
  }
  return null;
}

/** monthly | quarterly | yearly from a Paddle price id. */
export function getBillingCycleFromPriceId(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  const targetId = priceId.trim();
  for (const [cycle, interval] of Object.entries(BILLING)) {
    if (
      interval.starter?.priceId === targetId
      || interval.pro?.priceId === targetId
      || interval.teams?.priceId === targetId
    ) {
      return cycle;
    }
  }
  return null;
}

export const STARTER_MONTHLY_USD: string = BILLING.monthly.starter.usdTotal;

/** Teams plan add-on: one extra seat beyond the 5 included ($5/seat/month). */
export const EXTRA_TEAMS_SEAT_PRICE_ID = 'pri_01kzhm4mb02kxwged2bqfyqxhx';
export const EXTRA_TEAMS_SEAT_USD_MONTHLY = 5;
