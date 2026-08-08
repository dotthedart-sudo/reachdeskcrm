/**
 * Prorated plan upgrades via Paddle Billing subscription update + preview APIs.
 * Scoped to same-cycle tier upgrades (e.g. Starter yearly → Pro yearly).
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  applyActiveSubscriptionToProfile,
  isRealPaddleSubscriptionId,
  logBillingEvent,
  type BillingProfile,
} from './billing.ts';
import { getPaddleSubscription, paddleFetch } from './paddle.ts';
import { getBillingCycleFromPriceId, getPlanFromPriceId, type PlanId, BILLING, EXTRA_TEAMS_SEAT_PRICE_ID } from './prices.ts';

export const PRORATION_BILLING_MODE = 'prorated_immediately' as const;

const PLAN_RANK: Record<string, number> = {
  trial: 0,
  starter: 1,
  pro: 2,
  teams: 3,
};

export type BillingCycleKey = 'monthly' | 'quarterly' | 'yearly';

export function getPriceIdForPlan(
  plan: string | null | undefined,
  cycle: string | null | undefined,
): string | null {
  const planKey = (plan || '').toLowerCase() as PlanId;
  const cycleKey = (cycle || '').toLowerCase() as BillingCycleKey;
  const interval = BILLING[cycleKey];
  if (!interval) return null;
  const pricing = interval[planKey];
  return pricing?.priceId ?? null;
}

export function isHigherTierPlan(fromPlan: string | null | undefined, toPlan: string | null | undefined): boolean {
  const from = PLAN_RANK[(fromPlan || '').toLowerCase()] ?? -1;
  const to = PLAN_RANK[(toPlan || '').toLowerCase()] ?? -1;
  return to > from && to >= 1;
}

export function normalizeBillingCycle(cycle: string | null | undefined): BillingCycleKey | null {
  const key = (cycle || '').toLowerCase();
  if (key === 'monthly' || key === 'quarterly' || key === 'yearly') return key;
  return null;
}

export type UpgradeEligibility =
  | { ok: true; subscriptionId: string; targetPriceId: string; targetPlan: PlanId; targetCycle: BillingCycleKey }
  | { ok: false; reason: string; code: string };

export function evaluateProratedUpgrade(params: {
  currentPlan: string | null | undefined;
  targetPlan: string | null | undefined;
  currentCycle: string | null | undefined;
  targetCycle?: string | null | undefined;
  paddleSubscriptionId: string | null | undefined;
}): UpgradeEligibility {
  const subscriptionId = params.paddleSubscriptionId;
  if (!isRealPaddleSubscriptionId(subscriptionId) && !String(subscriptionId || '').startsWith('sub_')) {
    return { ok: false, reason: 'No active Paddle subscription on this account.', code: 'no_subscription' };
  }

  const targetPlan = (params.targetPlan || '').toLowerCase() as PlanId;
  if (!['starter', 'pro', 'teams'].includes(targetPlan)) {
    return { ok: false, reason: 'Invalid target plan.', code: 'invalid_plan' };
  }

  if (!isHigherTierPlan(params.currentPlan, targetPlan)) {
    return {
      ok: false,
      reason: 'Prorated charges apply only when moving to a higher plan tier.',
      code: 'not_upgrade',
    };
  }

  const currentCycle = normalizeBillingCycle(params.currentCycle);
  const targetCycle = normalizeBillingCycle(params.targetCycle ?? params.currentCycle);
  if (!currentCycle || !targetCycle) {
    return { ok: false, reason: 'Billing cycle is missing or invalid.', code: 'invalid_cycle' };
  }
  if (currentCycle !== targetCycle) {
    return {
      ok: false,
      reason: 'Billing cycle changes are not handled by prorated upgrade. Use checkout or contact support.',
      code: 'cycle_change',
    };
  }

  const targetPriceId = getPriceIdForPlan(targetPlan, targetCycle);
  if (!targetPriceId) {
    return { ok: false, reason: 'No Paddle price configured for that plan/cycle.', code: 'missing_price' };
  }

  return {
    ok: true,
    subscriptionId: subscriptionId as string,
    targetPriceId,
    targetPlan,
    targetCycle,
  };
}

function buildUpgradeItems(targetPriceId: string, extraSeats = 0) {
  const items: Array<{ price_id: string; quantity: number }> = [
    { price_id: targetPriceId, quantity: 1 },
  ];
  const extraQty = Math.max(0, Math.floor(Number(extraSeats) || 0));
  if (extraQty > 0) {
    items.push({ price_id: EXTRA_TEAMS_SEAT_PRICE_ID, quantity: Math.min(extraQty, 50) });
  }
  return items;
}

function buildUpdateBody(targetPriceId: string, extraSeats = 0) {
  return {
    items: buildUpgradeItems(targetPriceId, extraSeats),
    proration_billing_mode: PRORATION_BILLING_MODE,
    on_payment_failure: 'prevent_change',
  };
}

/** Paddle amounts are minor units (e.g. cents). */
export function formatPaddleMoney(amount: string | null | undefined, currencyCode: string | null | undefined): string {
  const currency = (currencyCode || 'USD').toUpperCase();
  const raw = Number(amount);
  if (!Number.isFinite(raw)) return `${currency} —`;
  const major = raw / 100;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

export function extractImmediateCharge(previewData: Record<string, unknown> | null | undefined): {
  amount: string | null;
  currency: string | null;
  formatted: string | null;
  immediateTransaction: Record<string, unknown> | null;
} {
  const immediate = (previewData?.immediate_transaction as Record<string, unknown> | null | undefined) ?? null;
  if (!immediate) {
    return { amount: null, currency: null, formatted: null, immediateTransaction: null };
  }
  const details = immediate.details as Record<string, unknown> | undefined;
  const totals = details?.totals as Record<string, unknown> | undefined;
  const amount = typeof totals?.grand_total === 'string'
    ? totals.grand_total
    : (typeof totals?.total === 'string' ? totals.total : null);
  const currency = typeof totals?.currency_code === 'string'
    ? totals.currency_code
    : (typeof immediate.currency_code === 'string' ? immediate.currency_code : null);

  return {
    amount,
    currency,
    formatted: amount ? formatPaddleMoney(amount, currency) : null,
    immediateTransaction: immediate,
  };
}

export async function previewProratedUpgrade(params: {
  subscriptionId: string;
  targetPriceId: string;
  extraSeats?: number;
}): Promise<{ ok: true; data: Record<string, unknown>; charge: ReturnType<typeof extractImmediateCharge> } | { ok: false; status: number; error: string; raw: unknown }> {
  const { ok, status, data, text } = await paddleFetch(
    `/subscriptions/${encodeURIComponent(params.subscriptionId)}/preview`,
    {
      method: 'PATCH',
      body: buildUpdateBody(params.targetPriceId, params.extraSeats ?? 0),
    },
  );

  if (!ok || !data || typeof data !== 'object') {
    return {
      ok: false,
      status,
      error: extractPaddleErrorMessage(data, text) || 'Failed to preview upgrade charge.',
      raw: data ?? text,
    };
  }

  const payload = (data as { data?: Record<string, unknown> }).data ?? (data as Record<string, unknown>);
  return {
    ok: true,
    data: payload,
    charge: extractImmediateCharge(payload),
  };
}

export async function commitProratedUpgrade(params: {
  subscriptionId: string;
  targetPriceId: string;
  extraSeats?: number;
}): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; error: string; raw: unknown }> {
  const { ok, status, data, text } = await paddleFetch(
    `/subscriptions/${encodeURIComponent(params.subscriptionId)}`,
    {
      method: 'PATCH',
      body: buildUpdateBody(params.targetPriceId, params.extraSeats ?? 0),
    },
  );

  if (!ok || !data || typeof data !== 'object') {
    return {
      ok: false,
      status,
      error: extractPaddleErrorMessage(data, text) || 'Paddle rejected the upgrade charge. Your plan was not changed.',
      raw: data ?? text,
    };
  }

  const payload = (data as { data?: Record<string, unknown> }).data ?? (data as Record<string, unknown>);
  return { ok: true, data: payload };
}

function extractPaddleErrorMessage(data: unknown, text: string): string | null {
  if (data && typeof data === 'object') {
    const err = data as { error?: { detail?: string; message?: string }; detail?: string };
    if (typeof err.error?.detail === 'string') return err.error.detail;
    if (typeof err.error?.message === 'string') return err.error.message;
    if (typeof err.detail === 'string') return err.detail;
  }
  if (text && text.length < 400) return text;
  return null;
}

export async function applyProratedUpgradeToProfile(
  supabase: SupabaseClient,
  profile: BillingProfile,
  subscriptionData: Record<string, unknown>,
  opts: {
    source: 'user_action' | 'paddle_sync';
    targetPlan?: PlanId;
    targetCycle?: BillingCycleKey;
    previewCharge?: ReturnType<typeof extractImmediateCharge> | null;
    actor?: string;
    extraSeats?: number;
  },
): Promise<Record<string, unknown>> {
  const items = subscriptionData.items as Array<Record<string, unknown>> | undefined;
  const first = items?.[0];
  const price = first?.price as Record<string, unknown> | undefined;
  const priceId = (typeof first?.price_id === 'string' ? first.price_id : null)
    || (typeof price?.id === 'string' ? price.id : null);

  const resolvedPlan = opts.targetPlan || getPlanFromPriceId(priceId) || profile.plan || 'starter';
  const billingCycle = opts.targetCycle || getBillingCycleFromPriceId(priceId) || null;
  const paddleCustomerId = typeof subscriptionData.customer_id === 'string'
    ? subscriptionData.customer_id
    : null;
  const paddleSubscriptionId = typeof subscriptionData.id === 'string'
    ? subscriptionData.id
    : profile.paddle_subscription_id;
  const paddleStatus = typeof subscriptionData.status === 'string'
    ? subscriptionData.status
    : 'active';

  const updateData = await applyActiveSubscriptionToProfile(supabase, profile, {
    resolvedPlan,
    billingCycle,
    paddleCustomerId,
    paddleSubscriptionId,
    paddleStatus,
    eventData: subscriptionData,
  });

  await logBillingEvent(supabase, {
    userId: profile.id,
    eventType: 'subscription_upgraded_prorated',
    source: opts.source,
    rawPayload: {
      actor: opts.actor ?? null,
      from_plan: profile.plan,
      to_plan: resolvedPlan,
      billing_cycle: billingCycle,
      paddle_subscription_id: paddleSubscriptionId,
      proration_billing_mode: PRORATION_BILLING_MODE,
      immediate_charge: opts.previewCharge ?? null,
      subscription: subscriptionData,
    },
  });

  return updateData;
}

export async function runProratedUpgrade(params: {
  supabase: SupabaseClient;
  profile: BillingProfile & { billing_cycle?: string | null; plan?: string | null };
  targetPlan: string;
  targetCycle?: string | null;
  source: 'user_action' | 'paddle_sync';
  actor?: string;
  extraSeats?: number;
}): Promise<
  | { ok: true; plan: string; billingCycle: string; charge: ReturnType<typeof extractImmediateCharge>; subscription: Record<string, unknown> }
  | { ok: false; status: number; error: string; code?: string }
> {
  const eligibility = evaluateProratedUpgrade({
    currentPlan: params.profile.plan,
    targetPlan: params.targetPlan,
    currentCycle: params.profile.billing_cycle,
    targetCycle: params.targetCycle ?? params.profile.billing_cycle,
    paddleSubscriptionId: params.profile.paddle_subscription_id,
  });

  if (!eligibility.ok) {
    return { ok: false, status: 400, error: eligibility.reason, code: eligibility.code };
  }

  // Prefer live sub for sanity (status past_due / canceled blocks upgrades in Paddle).
  const live = await getPaddleSubscription(eligibility.subscriptionId);
  if (live) {
    const status = typeof live.status === 'string' ? live.status : '';
    if (status === 'canceled' || status === 'paused') {
      return {
        ok: false,
        status: 409,
        error: `Subscription is ${status}. Resume or purchase a new plan instead.`,
        code: 'subscription_inactive',
      };
    }
  }

  const extraSeats = eligibility.targetPlan === 'teams'
    ? Math.min(50, Math.max(0, Math.floor(Number(params.extraSeats) || 0)))
    : 0;

  const preview = await previewProratedUpgrade({
    subscriptionId: eligibility.subscriptionId,
    targetPriceId: eligibility.targetPriceId,
    extraSeats,
  });
  if (!preview.ok) {
    return { ok: false, status: preview.status || 502, error: preview.error, code: 'preview_failed' };
  }

  const commit = await commitProratedUpgrade({
    subscriptionId: eligibility.subscriptionId,
    targetPriceId: eligibility.targetPriceId,
    extraSeats,
  });
  if (!commit.ok) {
    return { ok: false, status: commit.status || 402, error: commit.error, code: 'charge_failed' };
  }

  await applyProratedUpgradeToProfile(params.supabase, params.profile, commit.data, {
    source: params.source,
    targetPlan: eligibility.targetPlan,
    targetCycle: eligibility.targetCycle,
    previewCharge: preview.charge,
    actor: params.actor,
    extraSeats,
  });

  return {
    ok: true,
    plan: eligibility.targetPlan,
    billingCycle: eligibility.targetCycle,
    charge: preview.charge,
    subscription: commit.data,
  };
}
