/**
 * Add paid Teams extra seats via Paddle subscription item quantity update.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { allowTestSubscriptions, isRealPaddleSubscriptionId, logBillingEvent } from './billing.ts';
import { getPaddleSubscription, paddleFetch } from './paddle.ts';
import { EXTRA_TEAMS_SEAT_PRICE_ID, EXTRA_TEAMS_SEAT_USD_MONTHLY } from './prices.ts';
import { PRORATION_BILLING_MODE, extractImmediateCharge, formatPaddleMoney } from './subscriptionUpgrade.ts';
import { getExtraSeatsFromProfile, normalizePlan } from './seatLimits.ts';

export { EXTRA_TEAMS_SEAT_USD_MONTHLY };

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

function getItemPriceId(item: Record<string, unknown>): string | null {
  if (typeof item.price_id === 'string') return item.price_id;
  const price = item.price as Record<string, unknown> | undefined;
  if (typeof price?.id === 'string') return price.id;
  return null;
}

function getItemQuantity(item: Record<string, unknown>): number {
  const qty = item.quantity;
  return typeof qty === 'number' && qty > 0 ? qty : 1;
}

/** Rebuild subscription items, setting extra-seat line quantity (adds line if missing). */
export function buildSubscriptionItemsWithExtraSeats(
  subscription: Record<string, unknown>,
  extraSeatQuantity: number,
): Array<{ price_id: string; quantity: number }> {
  const items = (subscription.items as Array<Record<string, unknown>> | undefined) ?? [];
  const result: Array<{ price_id: string; quantity: number }> = [];
  let extraHandled = false;

  for (const item of items) {
    const priceId = getItemPriceId(item);
    if (!priceId) continue;
    if (priceId === EXTRA_TEAMS_SEAT_PRICE_ID) {
      if (extraSeatQuantity > 0) {
        result.push({ price_id: priceId, quantity: extraSeatQuantity });
      }
      extraHandled = true;
    } else {
      result.push({ price_id: priceId, quantity: getItemQuantity(item) });
    }
  }

  if (!extraHandled && extraSeatQuantity > 0) {
    result.push({ price_id: EXTRA_TEAMS_SEAT_PRICE_ID, quantity: extraSeatQuantity });
  }

  return result;
}

/** Read extra-seat line quantity from a Paddle subscription payload. */
export function countExtraSeatsInSubscription(subscription: Record<string, unknown> | null | undefined): number {
  const items = (subscription?.items as Array<Record<string, unknown>> | undefined) ?? [];
  let total = 0;
  for (const item of items) {
    const priceId = getItemPriceId(item);
    if (priceId === EXTRA_TEAMS_SEAT_PRICE_ID) {
      total += getItemQuantity(item);
    }
  }
  return Math.max(0, total);
}

function normalizeSeatsToAdd(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 50) return 50;
  return n;
}

function buildUpdateBody(items: Array<{ price_id: string; quantity: number }>) {
  return {
    items,
    proration_billing_mode: PRORATION_BILLING_MODE,
    on_payment_failure: 'prevent_change',
  };
}

export type ExtraSeatEligibility =
  | { ok: true; subscriptionId: string; currentExtraSeats: number; newExtraSeats: number; seatsToAdd: number }
  | { ok: false; reason: string; code: string };

export function evaluateExtraSeatPurchase(profile: {
  plan?: string | null;
  plan_status?: string | null;
  team_role?: string | null;
  team_id?: string | null;
  paddle_subscription_id?: string | null;
  extra_seats?: number | null;
}, seatsToAdd = 1): ExtraSeatEligibility {
  if (normalizePlan(profile.plan) !== 'teams') {
    return { ok: false, reason: 'Extra seats are available on the Teams plan only.', code: 'not_teams' };
  }
  if ((profile.team_role || 'owner').toLowerCase() !== 'owner') {
    return { ok: false, reason: 'Only the workspace owner can purchase extra seats.', code: 'not_owner' };
  }
  const status = (profile.plan_status || '').toLowerCase();
  if (status && status !== 'active' && status !== 'cancelling') {
    return { ok: false, reason: 'An active Teams subscription is required.', code: 'inactive_plan' };
  }

  const subId = profile.paddle_subscription_id;
  const allowTest = allowTestSubscriptions();
  if (!isRealPaddleSubscriptionId(subId) && !(allowTest && String(subId || '').startsWith('sub_'))) {
    return { ok: false, reason: 'No active Paddle subscription found.', code: 'no_subscription' };
  }

  const currentExtraSeats = getExtraSeatsFromProfile(profile);
  const add = normalizeSeatsToAdd(seatsToAdd);
  return {
    ok: true,
    subscriptionId: subId as string,
    currentExtraSeats,
    newExtraSeats: currentExtraSeats + add,
    seatsToAdd: add,
  };
}

export async function previewExtraSeatPurchase(params: {
  subscriptionId: string;
  newExtraSeats: number;
}): Promise<
  | { ok: true; data: Record<string, unknown>; charge: ReturnType<typeof extractImmediateCharge>; items: Array<{ price_id: string; quantity: number }> }
  | { ok: false; status: number; error: string; raw: unknown }
> {
  const live = await getPaddleSubscription(params.subscriptionId);
  if (!live) {
    return { ok: false, status: 404, error: 'Subscription not found in Paddle.', raw: null };
  }

  const items = buildSubscriptionItemsWithExtraSeats(live, params.newExtraSeats);
  const { ok, status, data, text } = await paddleFetch(
    `/subscriptions/${encodeURIComponent(params.subscriptionId)}/preview`,
    { method: 'PATCH', body: buildUpdateBody(items) },
  );

  if (!ok || !data || typeof data !== 'object') {
    return {
      ok: false,
      status,
      error: extractPaddleErrorMessage(data, text) || 'Failed to preview extra seat charge.',
      raw: data ?? text,
    };
  }

  const payload = (data as { data?: Record<string, unknown> }).data ?? (data as Record<string, unknown>);
  return {
    ok: true,
    data: payload,
    charge: extractImmediateCharge(payload),
    items,
  };
}

export async function commitExtraSeatPurchase(params: {
  subscriptionId: string;
  newExtraSeats: number;
}): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; error: string; raw: unknown }> {
  const live = await getPaddleSubscription(params.subscriptionId);
  if (!live) {
    return { ok: false, status: 404, error: 'Subscription not found in Paddle.', raw: null };
  }

  const items = buildSubscriptionItemsWithExtraSeats(live, params.newExtraSeats);
  const { ok, status, data, text } = await paddleFetch(
    `/subscriptions/${encodeURIComponent(params.subscriptionId)}`,
    { method: 'PATCH', body: buildUpdateBody(items) },
  );

  if (!ok || !data || typeof data !== 'object') {
    return {
      ok: false,
      status,
      error: extractPaddleErrorMessage(data, text) || 'Paddle rejected the extra seat charge.',
      raw: data ?? text,
    };
  }

  const payload = (data as { data?: Record<string, unknown> }).data ?? (data as Record<string, unknown>);
  return { ok: true, data: payload };
}

export async function runExtraSeatPurchase(params: {
  supabase: SupabaseClient;
  profile: {
    id: string;
    plan?: string | null;
    plan_status?: string | null;
    team_role?: string | null;
    team_id?: string | null;
    paddle_subscription_id?: string | null;
    extra_seats?: number | null;
    billing_cycle?: string | null;
  };
  seatsToAdd?: number;
  actor?: string;
}): Promise<
  | {
    ok: true;
    extraSeats: number;
    seatLimit: number;
    charge: ReturnType<typeof extractImmediateCharge>;
    monthlyExtraCostUsd: number;
  }
  | { ok: false; status: number; error: string; code?: string }
> {
  const eligibility = evaluateExtraSeatPurchase(params.profile, params.seatsToAdd ?? 1);
  if (!eligibility.ok) {
    return { ok: false, status: 400, error: eligibility.reason, code: eligibility.code };
  }

  const allowTest = allowTestSubscriptions();
  const isTestSub = !isRealPaddleSubscriptionId(eligibility.subscriptionId)
    && allowTest
    && eligibility.subscriptionId.startsWith('sub_');

  let charge: ReturnType<typeof extractImmediateCharge> = {
    amount: '500',
    currency: 'USD',
    formatted: formatPaddleMoney('500', 'USD'),
    immediateTransaction: null,
  };

  if (!isTestSub) {
    const live = await getPaddleSubscription(eligibility.subscriptionId);
    if (live) {
      const status = typeof live.status === 'string' ? live.status : '';
      if (status === 'canceled' || status === 'paused') {
        return {
          ok: false,
          status: 409,
          error: `Subscription is ${status}. Resume billing before adding seats.`,
          code: 'subscription_inactive',
        };
      }
    }

    const preview = await previewExtraSeatPurchase({
      subscriptionId: eligibility.subscriptionId,
      newExtraSeats: eligibility.newExtraSeats,
    });
    if (!preview.ok) {
      return { ok: false, status: preview.status || 502, error: preview.error, code: 'preview_failed' };
    }
    charge = preview.charge;

    const commit = await commitExtraSeatPurchase({
      subscriptionId: eligibility.subscriptionId,
      newExtraSeats: eligibility.newExtraSeats,
    });
    if (!commit.ok) {
      return { ok: false, status: commit.status || 402, error: commit.error, code: 'charge_failed' };
    }
  }

  const { data: updated, error: updateError } = await params.supabase
    .from('user_profiles')
    .update({ extra_seats: eligibility.newExtraSeats })
    .eq('id', params.profile.id)
    .select('extra_seats')
    .single();

  if (updateError || !updated) {
    console.error('[extra-seat] profile update failed after Paddle charge:', updateError);
    return {
      ok: false,
      status: 500,
      error: 'Seat was charged but could not update your account. Contact support.',
      code: 'profile_update_failed',
    };
  }

  await logBillingEvent(params.supabase, {
    userId: params.profile.id,
    eventType: 'extra_seat_purchased',
    source: 'user_action',
    rawPayload: {
      actor: params.actor ?? null,
      previous_extra_seats: eligibility.currentExtraSeats,
      new_extra_seats: eligibility.newExtraSeats,
      seats_added: eligibility.seatsToAdd,
      paddle_subscription_id: eligibility.subscriptionId,
      immediate_charge: charge,
      test_mode: isTestSub,
    },
  });

  return {
    ok: true,
    extraSeats: eligibility.newExtraSeats,
    seatLimit: 5 + eligibility.newExtraSeats,
    charge,
    monthlyExtraCostUsd: eligibility.newExtraSeats * EXTRA_TEAMS_SEAT_USD_MONTHLY,
  };
}
