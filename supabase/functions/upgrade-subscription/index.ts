import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  requireUser,
} from '../_shared/auth.ts';
import { allowTestSubscriptions, isRealPaddleSubscriptionId } from '../_shared/billing.ts';
import {
  evaluateProratedUpgrade,
  previewProratedUpgrade,
  runProratedUpgrade,
} from '../_shared/subscriptionUpgrade.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user, response: authError } = await requireUser(req);
    if (authError || !user) return authError!;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'preview').toLowerCase();
    const targetPlan = String(body?.targetPlan || body?.plan || '').toLowerCase();
    const targetCycle = body?.billingCycle ? String(body.billingCycle).toLowerCase() : null;
    const extraSeats = targetPlan === 'teams'
      ? Math.min(50, Math.max(0, Math.floor(Number(body?.extraSeats ?? 0)) || 0))
      : 0;

    if (!['preview', 'confirm'].includes(action)) {
      return jsonResponse({ success: false, error: 'action must be preview or confirm' }, 400);
    }
    if (!targetPlan) {
      return jsonResponse({ success: false, error: 'targetPlan is required' }, 400);
    }

    const supabase = createServiceClient();
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, email, plan, billing_cycle, plan_status, paddle_subscription_id, paddle_customer_id, plan_cancels_at, team_id, team_role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return jsonResponse({ success: false, error: 'Profile not found' }, 404);
    }

    if ((profile.team_role || 'owner').toLowerCase() === 'member' && profile.team_id) {
      return jsonResponse(
        { success: false, error: 'Billing is managed by your workspace owner.' },
        403,
      );
    }

    const subId = profile.paddle_subscription_id;
    const allowTest = allowTestSubscriptions();
    if (!isRealPaddleSubscriptionId(subId) && !(allowTest && String(subId || '').startsWith('sub_'))) {
      return jsonResponse({
        success: false,
        error: 'No Paddle subscription to upgrade. Complete checkout for a new plan instead.',
        code: 'no_subscription',
        useCheckout: true,
      }, 400);
    }

    const eligibility = evaluateProratedUpgrade({
      currentPlan: profile.plan,
      targetPlan,
      currentCycle: profile.billing_cycle,
      targetCycle: targetCycle ?? profile.billing_cycle,
      paddleSubscriptionId: subId,
    });

    if (!eligibility.ok) {
      return jsonResponse({
        success: false,
        error: eligibility.reason,
        code: eligibility.code,
        useCheckout: eligibility.code === 'cycle_change' || eligibility.code === 'no_subscription',
      }, 400);
    }

    if (action === 'preview') {
      const preview = await previewProratedUpgrade({
        subscriptionId: eligibility.subscriptionId,
        targetPriceId: eligibility.targetPriceId,
        extraSeats,
      });
      if (!preview.ok) {
        return jsonResponse({
          success: false,
          error: preview.error,
          code: 'preview_failed',
        }, preview.status >= 400 ? preview.status : 502);
      }

      return jsonResponse({
        success: true,
        action: 'preview',
        fromPlan: profile.plan,
        toPlan: eligibility.targetPlan,
        billingCycle: eligibility.targetCycle,
        prorationBillingMode: 'prorated_immediately',
        immediateCharge: preview.charge,
        nextTransaction: preview.data.next_transaction ?? null,
      });
    }

    const result = await runProratedUpgrade({
      supabase,
      profile,
      targetPlan: eligibility.targetPlan,
      targetCycle: eligibility.targetCycle,
      source: 'user_action',
      actor: user.id,
      extraSeats,
    });

    if (!result.ok) {
      return jsonResponse({
        success: false,
        error: result.error,
        code: result.code,
      }, result.status >= 400 ? result.status : 402);
    }

    await supabase
      .from('user_profiles')
      .update({ payment_pending: false, requested_plan: null, status: 'approved' })
      .eq('id', user.id);

    return jsonResponse({
      success: true,
      action: 'confirm',
      plan: result.plan,
      billingCycle: result.billingCycle,
      immediateCharge: result.charge,
    });
  } catch (err) {
    console.error('[upgrade-subscription] Error:', err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
});
