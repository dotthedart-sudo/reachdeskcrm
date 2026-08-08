import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DEFAULT_FROM_EMAIL } from './email.ts';
import { getBillingCycleFromPriceId, getPlanFromPriceId, type PlanId } from './prices.ts';
import { countExtraSeatsInSubscription } from './subscriptionExtraSeats.ts';
import {
  extractCustomerEmail,
  extractCustomerId,
  extractCustomData,
  fetchPaddleCustomerEmail,
} from './paddle.ts';

export const BILLING_SUPPORT_EMAIL = 'support@reachdeskcrm.com';
export const BILLING_ERROR_MESSAGE =
  "We couldn't find an active subscription to cancel. Please contact support@reachdeskcrm.com.";

export function allowTestSubscriptions(): boolean {
  if (Deno.env.get('ALLOW_TEST_SUBSCRIPTIONS') === 'true') return true;
  const env = Deno.env.get('NODE_ENV') ?? Deno.env.get('ENVIRONMENT') ?? '';
  return env !== 'production';
}

export function isRealPaddleSubscriptionId(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') return false;
  if (id.startsWith('sub_test')) return false;
  return /^sub_[0-9a-z]+$/i.test(id);
}

export function getScheduledChange(data: Record<string, unknown> | null | undefined) {
  if (!data) return null;
  const direct = data.scheduled_change as Record<string, unknown> | null | undefined;
  if (direct) return direct;
  const subscription = data.subscription as Record<string, unknown> | null | undefined;
  return (subscription?.scheduled_change as Record<string, unknown> | null | undefined) ?? null;
}

export function hasPendingCancelSchedule(data: Record<string, unknown> | null | undefined): boolean {
  const scheduled = getScheduledChange(data);
  return scheduled?.action === 'cancel';
}

export function resolvePlanCancelsAt(
  subData: Record<string, unknown> | null | undefined,
  scheduledChange?: Record<string, unknown> | null,
): string | null {
  const scheduled = scheduledChange ?? getScheduledChange(subData);
  if (!scheduled || scheduled.action !== 'cancel') return null;

  const effectiveAt = scheduled.effective_at;
  if (typeof effectiveAt === 'string' && effectiveAt !== 'next_billing_period') {
    const parsed = new Date(effectiveAt);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const period = subData?.current_billing_period as Record<string, unknown> | undefined;
  const endsAt = period?.ends_at;
  if (typeof endsAt === 'string') {
    const parsed = new Date(endsAt);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return null;
}

export async function logBillingEvent(
  supabase: SupabaseClient,
  params: {
    userId: string | null;
    eventType: string;
    source: 'user_action' | 'paddle_webhook' | 'paddle_sync';
    rawPayload?: unknown;
  },
): Promise<void> {
  const { error } = await supabase.from('billing_events').insert({
    user_id: params.userId,
    event_type: params.eventType,
    source: params.source,
    raw_payload: params.rawPayload ?? null,
  });
  if (error) {
    console.error('[Billing] Failed to log billing event:', error.message);
  }
}

export async function sendBillingEmail(
  to: string,
  subject: string,
  html: string,
): Promise<string | null> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.error('[Billing] RESEND_API_KEY not set — skipping email');
    return null;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: DEFAULT_FROM_EMAIL,
      reply_to: BILLING_SUPPORT_EMAIL,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    console.error('[Billing] Resend failed:', await response.text());
    return null;
  }

  const data = await response.json();
  return data?.id ?? null;
}

export function formatAccessDate(iso: string | null | undefined): string {
  if (!iso) return 'the end of your billing period';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export type BillingProfile = {
  id: string;
  email: string | null;
  plan: string | null;
  plan_status: string | null;
  plan_cancels_at: string | null;
  paddle_subscription_id: string | null;
  paddle_customer_id?: string | null;
};

export async function findProfileByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<BillingProfile | null> {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();

  const { data: exact } = await supabase
    .from('user_profiles')
    .select('id, email, plan, plan_status, plan_cancels_at, paddle_subscription_id, paddle_customer_id')
    .eq('email', email.trim())
    .maybeSingle();
  if (exact) return exact;

  const { data: rows } = await supabase
    .from('user_profiles')
    .select('id, email, plan, plan_status, plan_cancels_at, paddle_subscription_id, paddle_customer_id')
    .ilike('email', normalized)
    .limit(5);

  if (!rows?.length) return null;
  const match = rows.find((r) => (r.email || '').toLowerCase() === normalized);
  return match ?? rows[0] ?? null;
}

export async function findProfileById(
  supabase: SupabaseClient,
  userId: string,
): Promise<BillingProfile | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from('user_profiles')
    .select('id, email, plan, plan_status, plan_cancels_at, paddle_subscription_id, paddle_customer_id')
    .eq('id', userId)
    .maybeSingle();
  return data;
}

export async function findProfileByPaddleCustomerId(
  supabase: SupabaseClient,
  customerId: string,
): Promise<BillingProfile | null> {
  if (!customerId) return null;
  const { data } = await supabase
    .from('user_profiles')
    .select('id, email, plan, plan_status, plan_cancels_at, paddle_subscription_id, paddle_customer_id')
    .eq('paddle_customer_id', customerId)
    .maybeSingle();
  return data;
}

export function resolvePlanFromPayload(data: Record<string, unknown>): {
  resolvedPlan: PlanId;
  rawProductName: string;
  priceId: string | undefined;
  billingCycle: string | null;
} {
  const items = data.items as Array<Record<string, unknown>> | undefined;
  const firstItem = items?.[0];
  const price = firstItem?.price as Record<string, unknown> | undefined;
  const priceId = (firstItem?.price_id as string) || (price?.id as string);
  const rawProductName = ((price?.product as Record<string, unknown>)?.name as string) || '';

  let resolvedPlan = getPlanFromPriceId(priceId);
  if (!resolvedPlan) {
    const nameLower = rawProductName.toLowerCase();
    if (nameLower.includes('pro')) resolvedPlan = 'pro';
    else if (nameLower.includes('teams') || nameLower.includes('team')) resolvedPlan = 'teams';
    else if (nameLower.includes('starter')) resolvedPlan = 'starter';
    else resolvedPlan = 'starter';
  }

  return {
    resolvedPlan,
    rawProductName,
    priceId,
    billingCycle: getBillingCycleFromPriceId(priceId),
  };
}

/**
 * Resolve app user for a Paddle webhook/sync payload.
 * Prefer custom_data.supabase_user_id (set at checkout), then paddle_customer_id,
 * then email (fetched from Paddle API when missing from the event).
 */
export async function resolveProfileForPaddleEvent(
  supabase: SupabaseClient,
  data: Record<string, unknown>,
  payloadEmail?: string | null,
): Promise<{ profile: BillingProfile | null; customerEmail: string | null; matchVia: string | null }> {
  const custom = extractCustomData(data);
  const userId =
    (typeof custom.supabase_user_id === 'string' && custom.supabase_user_id)
    || (typeof custom.user_id === 'string' && custom.user_id)
    || null;

  if (userId) {
    const byId = await findProfileById(supabase, userId);
    if (byId) {
      return {
        profile: byId,
        customerEmail: byId.email || payloadEmail || null,
        matchVia: 'supabase_user_id',
      };
    }
  }

  const customerId = extractCustomerId(data);
  if (customerId) {
    const byCustomer = await findProfileByPaddleCustomerId(supabase, customerId);
    if (byCustomer) {
      return {
        profile: byCustomer,
        customerEmail: byCustomer.email || payloadEmail || null,
        matchVia: 'paddle_customer_id',
      };
    }
  }

  let customerEmail = payloadEmail || extractCustomerEmail(data) || null;

  if (!customerEmail && customerId) {
    try {
      customerEmail = await fetchPaddleCustomerEmail(customerId);
    } catch (err) {
      console.warn('[Billing] Failed to fetch Paddle customer email:', err);
    }
  }

  if (customerEmail) {
    const byEmail = await findProfileByEmail(supabase, customerEmail);
    if (byEmail) {
      return { profile: byEmail, customerEmail, matchVia: 'email' };
    }
  }

  return { profile: null, customerEmail, matchVia: null };
}

export async function applyActiveSubscriptionToProfile(
  supabase: SupabaseClient,
  profile: BillingProfile,
  params: {
    resolvedPlan: string;
    billingCycle?: string | null;
    paddleCustomerId?: string | null;
    paddleSubscriptionId?: string | null;
    paddleStatus?: string | null;
    pendingCancel?: boolean;
    planCancelsAt?: string | null;
    eventData?: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const pendingCancel = params.pendingCancel
    ?? hasPendingCancelSchedule(params.eventData)
    ?? false;

  const { data: lockRow } = await supabase
    .from('user_profiles')
    .select('lock_reason')
    .eq('id', profile.id)
    .maybeSingle();
  const hasModerationLock = typeof lockRow?.lock_reason === 'string' && lockRow.lock_reason.trim().length > 0;

  const updateData: Record<string, unknown> = {
    plan: params.resolvedPlan,
    trial_ends_at: null,
    payment_pending: false,
    paddle_subscription_status: params.paddleStatus ?? 'active',
  };

  if (!hasModerationLock) {
    updateData.account_locked = false;
    updateData.locked_at = null;
  }

  if (params.billingCycle) {
    updateData.billing_cycle = params.billingCycle;
  }

  if (pendingCancel) {
    updateData.plan_status = 'cancelling';
    updateData.plan_cancels_at = params.planCancelsAt ?? resolvePlanCancelsAt(params.eventData);
  } else {
    updateData.plan_status = 'active';
    updateData.plan_cancels_at = null;
  }

  if (params.paddleCustomerId) {
    updateData.paddle_customer_id = params.paddleCustomerId;
  }

  if (params.paddleSubscriptionId && isRealPaddleSubscriptionId(params.paddleSubscriptionId)) {
    updateData.paddle_subscription_id = params.paddleSubscriptionId;
  }

  if (params.resolvedPlan === 'teams') {
    await ensureTeamsWorkspaceForProfile(supabase, profile, updateData);
    if (params.eventData) {
      updateData.extra_seats = countExtraSeatsInSubscription(params.eventData);
    }
  } else {
    updateData.extra_seats = 0;
  }

  const { error } = await supabase
    .from('user_profiles')
    .update(updateData)
    .eq('id', profile.id);

  if (error) throw new Error(`Failed to update user profile: ${error.message}`);
  return updateData;
}

async function ensureTeamsWorkspaceForProfile(
  supabase: SupabaseClient,
  profile: BillingProfile,
  updateData: Record<string, unknown>,
) {
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('id, email, team_id, team_role')
    .eq('id', profile.id)
    .maybeSingle();

  if (
    existing
    && !existing.team_id
    && (existing.team_role || 'owner') !== 'member'
  ) {
    const ownerEmail = existing.email || profile.email || 'user';
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({
        owner_id: existing.id,
        name: `${ownerEmail}'s Team`,
      })
      .select('id')
      .single();

    if (teamError || !team) {
      throw new Error(`Failed to create team workspace: ${teamError?.message || 'unknown error'}`);
    }

    updateData.team_id = team.id;
    updateData.team_role = 'owner';
  }
}
