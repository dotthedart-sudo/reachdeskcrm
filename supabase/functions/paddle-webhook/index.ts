import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  applyActiveSubscriptionToProfile,
  findProfileByEmail,
  getScheduledChange,
  logBillingEvent,
  resolvePlanCancelsAt,
  resolvePlanFromPayload,
  resolveProfileForPaddleEvent,
  sendBillingEmail,
} from '../_shared/billing.ts';
import { refreshAccessToken, stopWatchChannel } from '../_shared/googleCalendar.ts';
import {
  extractCustomerId,
  extractCustomerEmail,
  extractSubscriptionId,
} from '../_shared/paddle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function verifySignature(
  rawBody: string,
  signatureHeader: string,
  secretKey: string,
): Promise<boolean> {
  const parts = signatureHeader.split(';');
  let ts = '';
  let h1 = '';
  for (const part of parts) {
    const [key, val] = part.split('=');
    if (key === 'ts') ts = val;
    if (key === 'h1') h1 = val;
  }

  if (!ts || !h1) return false;

  const payload = `${ts}:${rawBody}`;
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBuf = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(payload));
  const expectedHash = Array.from(new Uint8Array(signatureBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (expectedHash.length !== h1.length) return false;
  let result = 0;
  for (let i = 0; i < expectedHash.length; i++) {
    result |= expectedHash.charCodeAt(i) ^ h1.charCodeAt(i);
  }
  return result === 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get('Paddle-Signature');
    const secretKey = Deno.env.get('PADDLE_WEBHOOK_SECRET');
    const testBypassSecret = Deno.env.get('TEST_BYPASS_SECRET');
    const allowTestBypass = Deno.env.get('ALLOW_TEST_BYPASS') === 'true';
    const isTestMode = allowTestBypass && !!testBypassSecret && req.headers.get('X-Test-Bypass') === testBypassSecret;

    if (!isTestMode && (!signatureHeader || !secretKey)) {
      console.error('[Webhook] Auth rejected: missing Paddle-Signature or PADDLE_WEBHOOK_SECRET', {
        hasSignature: !!signatureHeader,
        hasSecret: !!secretKey,
      });
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    if (!isTestMode) {
      const isValid = await verifySignature(rawBody, signatureHeader!, secretKey!);
      if (!isValid) {
        console.error('[Webhook] Invalid Paddle-Signature — check PADDLE_WEBHOOK_SECRET matches Paddle dashboard');
        return new Response(JSON.stringify({ success: false, error: 'Invalid signature' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        });
      }
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload.event_type || payload.alert_name;
    const data = (payload.data || {}) as Record<string, unknown>;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const payloadEmail =
      extractCustomerEmail(data)
      || (payload.email as string)
      || null;

    const { profile, customerEmail, matchVia } = await resolveProfileForPaddleEvent(
      supabaseAdmin,
      data,
      payloadEmail,
    );

    let lastEmailId: string | null = null;

    if (
      eventType === 'transaction.completed'
      || eventType === 'subscription.created'
      || eventType === 'subscription.activated'
    ) {
      if (!profile) {
        console.error('[Webhook] No matching user for Paddle event', {
          eventType,
          customerEmail,
          customerId: extractCustomerId(data),
          subscriptionId: extractSubscriptionId(data, eventType),
        });
        await logBillingEvent(supabaseAdmin, {
          userId: null,
          eventType: 'webhook_unmatched_user',
          source: 'paddle_webhook',
          rawPayload: {
            event_type: eventType,
            customer_email: customerEmail,
            customer_id: extractCustomerId(data),
            subscription_id: extractSubscriptionId(data, eventType),
          },
        });
        // 200 so Paddle does not infinite-retry; sync-paddle-subscription can repair later
        return new Response(JSON.stringify({ success: false, error: 'No matching user' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      const { resolvedPlan, rawProductName, billingCycle } = resolvePlanFromPayload(data);
      const paddleCustomerId = extractCustomerId(data);
      const paddleSubscriptionId = extractSubscriptionId(data, eventType);
      const paddleStatus = typeof data.status === 'string' ? data.status : 'active';
      const pendingCancel = hasPendingCancelFromProfile(data, profile);

      await applyActiveSubscriptionToProfile(supabaseAdmin, profile, {
        resolvedPlan,
        billingCycle,
        paddleCustomerId,
        paddleSubscriptionId,
        paddleStatus: paddleStatus === 'completed' ? 'active' : paddleStatus,
        pendingCancel,
        eventData: data,
      });

      await logBillingEvent(supabaseAdmin, {
        userId: profile.id,
        eventType: 'webhook_transaction_completed',
        source: 'paddle_webhook',
        rawPayload: {
          event_type: eventType,
          match_via: matchVia,
          pending_cancel: pendingCancel,
          subscription_id: paddleSubscriptionId,
          customer_id: paddleCustomerId,
          plan: resolvedPlan,
        },
      });

      const isFirstPayment = profile.plan_status !== 'active' && profile.plan_status !== 'cancelling';
      if (isFirstPayment && customerEmail) {
        const planName = rawProductName.toLowerCase().endsWith('plan') ? rawProductName : `${rawProductName || resolvedPlan} Plan`;
        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        if (resendApiKey) {
          const welcomeHtml = `
            <div style="background-color: #0D1117; color: #FFFFFF; font-family: sans-serif; padding: 30px; border-radius: 3px; max-width: 600px; margin: 0 auto; border: 1px solid #21262D;">
              <h2 style="color: #5B8FB9;">Welcome to ReachDesk CRM!</h2>
              <p>Your ${planName} is now active.</p>
              <p style="color: #8B949E; font-size: 0.85rem;">Paddle sends receipts and renewal reminders for billing. ReachDesk emails you about workspace access.</p>
            </div>
          `;
          lastEmailId = await sendBillingEmail(customerEmail, "You're in — Welcome to ReachDesk CRM!", welcomeHtml);
        }
      }
    } else if (eventType === 'subscription.updated') {
      if (!profile) {
        await logBillingEvent(supabaseAdmin, {
          userId: null,
          eventType: 'webhook_unmatched_user',
          source: 'paddle_webhook',
          rawPayload: { event_type: eventType, customer_email: customerEmail },
        });
        return new Response(JSON.stringify({ success: false, error: 'No matching user' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      const scheduledChange = getScheduledChange(data);
      const paddleStatus = typeof data.status === 'string' ? data.status : null;
      const paddleCustomerId = extractCustomerId(data);
      const paddleSubscriptionId = extractSubscriptionId(data, eventType);
      const { resolvedPlan, billingCycle } = resolvePlanFromPayload(data);

      // Keep plan/IDs in sync on updates (price changes, renewals)
      if (resolvedPlan && (paddleStatus === 'active' || paddleStatus === 'trialing' || !paddleStatus)) {
        await applyActiveSubscriptionToProfile(supabaseAdmin, profile, {
          resolvedPlan,
          billingCycle,
          paddleCustomerId,
          paddleSubscriptionId,
          paddleStatus: paddleStatus ?? 'active',
          pendingCancel: scheduledChange?.action === 'cancel',
          planCancelsAt: resolvePlanCancelsAt(data, scheduledChange),
          eventData: data,
        });
      } else {
        const updateData: Record<string, unknown> = {
          paddle_subscription_status: paddleStatus,
        };
        if (scheduledChange?.action === 'cancel') {
          updateData.plan_status = 'cancelling';
          updateData.plan_cancels_at = resolvePlanCancelsAt(data, scheduledChange);
        } else if (
          (scheduledChange == null || scheduledChange === null)
          && profile.plan_status === 'cancelling'
        ) {
          updateData.plan_status = 'active';
          updateData.plan_cancels_at = null;
        }
        if (paddleCustomerId) updateData.paddle_customer_id = paddleCustomerId;
        if (paddleSubscriptionId) updateData.paddle_subscription_id = paddleSubscriptionId;

        const { error: updateError } = await supabaseAdmin
          .from('user_profiles')
          .update(updateData)
          .eq('id', profile.id);
        if (updateError) throw new Error(`Failed to update user profile: ${updateError.message}`);
      }

      await logBillingEvent(supabaseAdmin, {
        userId: profile.id,
        eventType: scheduledChange?.action === 'cancel'
          ? 'webhook_subscription_cancel_scheduled'
          : 'webhook_subscription_updated',
        source: 'paddle_webhook',
        rawPayload: { scheduled_change: scheduledChange, status: paddleStatus, match_via: matchVia },
      });
    } else if (eventType === 'subscription.canceled') {
      const target = profile
        || (customerEmail ? await findProfileByEmail(supabaseAdmin, customerEmail) : null);

      if (target) {
        const { error: updateError } = await supabaseAdmin
          .from('user_profiles')
          .update({
            plan: 'free',
            plan_status: 'inactive',
            plan_cancels_at: null,
            paddle_subscription_status: 'canceled',
          })
          .eq('id', target.id);

        if (updateError) throw new Error(`Failed to update user profile: ${updateError.message}`);

        // Stop Calendar watch and mark Sheets sync inactive
        const { data: calInt } = await supabaseAdmin
          .from('calendar_integrations')
          .select('*')
          .eq('user_id', target.id)
          .eq('provider', 'google')
          .maybeSingle();

        if (calInt?.watch_channel_id && calInt?.watch_resource_id) {
          try {
            const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
            const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
            let accessToken = calInt.access_token;
            const isExpired = new Date(calInt.token_expires_at) <= new Date(Date.now() + 60_000);
            if (isExpired) {
              const refreshed = await refreshAccessToken(calInt.refresh_token, clientId, clientSecret);
              if (refreshed) accessToken = refreshed.access_token;
            }
            await stopWatchChannel(calInt.watch_channel_id, calInt.watch_resource_id, accessToken);
          } catch (e) {
            console.warn('Failed to stop google calendar watch on downgrade', e);
          }
        }

        await supabaseAdmin
          .from('calendar_integrations')
          .update({ watch_channel_id: null, watch_resource_id: null, watch_expiration: null })
          .eq('user_id', target.id);

        await supabaseAdmin
          .from('sheets_integrations')
          .update({ is_active: false })
          .eq('user_id', target.id);

        await logBillingEvent(supabaseAdmin, {
          userId: target.id,
          eventType: 'webhook_subscription_canceled',
          source: 'paddle_webhook',
          rawPayload: { match_via: matchVia, data },
        });
      }
    } else if (eventType === 'transaction.payment_failed') {
      await logBillingEvent(supabaseAdmin, {
        userId: profile?.id ?? null,
        eventType: 'webhook_transaction_payment_failed',
        source: 'paddle_webhook',
        rawPayload: data,
      });
    }

    return new Response(JSON.stringify({ success: true, email_id: lastEmailId, match_via: matchVia }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[Webhook] Error processing Paddle Webhook:', error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});

function hasPendingCancelFromProfile(
  data: Record<string, unknown>,
  profile: { plan_status: string | null; plan_cancels_at: string | null },
): boolean {
  const scheduled = getScheduledChange(data);
  if (scheduled?.action === 'cancel') return true;
  return profile.plan_status === 'cancelling' && !!profile.plan_cancels_at;
}
