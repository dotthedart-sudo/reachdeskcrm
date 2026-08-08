import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  corsHeaders,
  createServiceClient,
  jsonResponse,
  requireUser,
} from '../_shared/auth.ts';
import { BILLING } from '../_shared/prices.ts';
import { EXTRA_TEAMS_SEAT_USD_MONTHLY, evaluateExtraSeatPurchase, previewExtraSeatPurchase, runExtraSeatPurchase } from '../_shared/subscriptionExtraSeats.ts';
import { TEAMS_INCLUDED_SEATS } from '../_shared/seatLimits.ts';
import { formatPaddleMoney } from '../_shared/subscriptionUpgrade.ts';

function monthlyTeamsPlanUsd(billingCycle: string | null | undefined): number {
  const cycle = (billingCycle || 'monthly').toLowerCase();
  const interval = BILLING[cycle as keyof typeof BILLING];
  const teams = interval?.teams;
  if (!teams) return 29;
  const perMonth = parseFloat(teams.usdPerMonth);
  return Number.isFinite(perMonth) ? perMonth : 29;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user, response: authError } = await requireUser(req);
    if (authError || !user) return authError!;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'preview').toLowerCase();
    const seatsToAdd = Math.min(50, Math.max(1, Math.floor(Number(body?.seatsToAdd ?? body?.quantity ?? 1)) || 1));

    if (!['preview', 'confirm'].includes(action)) {
      return jsonResponse({ success: false, error: 'action must be preview or confirm' }, 400);
    }

    const supabase = createServiceClient();
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, email, plan, plan_status, billing_cycle, paddle_subscription_id, team_id, team_role, extra_seats')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return jsonResponse({ success: false, error: 'Profile not found' }, 404);
    }

    const eligibility = evaluateExtraSeatPurchase(profile, seatsToAdd);
    if (!eligibility.ok) {
      return jsonResponse({ success: false, error: eligibility.reason, code: eligibility.code }, 400);
    }

    const teamsMonthlyUsd = monthlyTeamsPlanUsd(profile.billing_cycle);
    const currentExtraMonthly = eligibility.currentExtraSeats * EXTRA_TEAMS_SEAT_USD_MONTHLY;
    const newExtraMonthly = eligibility.newExtraSeats * EXTRA_TEAMS_SEAT_USD_MONTHLY;
    const currentTotalMonthly = teamsMonthlyUsd + currentExtraMonthly;
    const newTotalMonthly = teamsMonthlyUsd + newExtraMonthly;

    if (action === 'preview') {
      const preview = await previewExtraSeatPurchase({
        subscriptionId: eligibility.subscriptionId,
        newExtraSeats: eligibility.newExtraSeats,
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
        includedSeats: TEAMS_INCLUDED_SEATS,
        currentExtraSeats: eligibility.currentExtraSeats,
        seatsToAdd: eligibility.seatsToAdd,
        newExtraSeats: eligibility.newExtraSeats,
        newSeatLimit: TEAMS_INCLUDED_SEATS + eligibility.newExtraSeats,
        extraSeatMonthlyUsd: EXTRA_TEAMS_SEAT_USD_MONTHLY,
        teamsPlanMonthlyUsd: teamsMonthlyUsd,
        currentTotalMonthlyUsd: Math.round(currentTotalMonthly * 100) / 100,
        newTotalMonthlyUsd: Math.round(newTotalMonthly * 100) / 100,
        prorationBillingMode: 'prorated_immediately',
        immediateCharge: preview.charge,
        immediateChargeFallback: preview.charge.formatted
          ?? formatPaddleMoney('500', 'USD'),
      });
    }

    const result = await runExtraSeatPurchase({
      supabase,
      profile,
      seatsToAdd,
      actor: user.id,
    });

    if (!result.ok) {
      return jsonResponse({
        success: false,
        error: result.error,
        code: result.code,
      }, result.status >= 400 ? result.status : 402);
    }

    return jsonResponse({
      success: true,
      action: 'confirm',
      extraSeats: result.extraSeats,
      seatLimit: result.seatLimit,
      includedSeats: TEAMS_INCLUDED_SEATS,
      newTotalMonthlyUsd: Math.round((teamsMonthlyUsd + result.monthlyExtraCostUsd) * 100) / 100,
      immediateCharge: result.charge,
    });
  } catch (err) {
    console.error('[purchase-extra-seat] Error:', err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
});
