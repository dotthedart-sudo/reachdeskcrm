import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createServiceClient,
  getEnv,
  jsonResponse,
  requirePrivileged,
} from '../_shared/auth.ts';

import { refreshAccessToken, stopWatchChannel } from '../_shared/googleCalendar.ts';

const SUPABASE_FUNCTIONS_URL = 'https://efxgwqfdstrhrnnvtynl.supabase.co/functions/v1';

serve(async (req) => {
  const authError = requirePrivileged(req);
  if (authError) return authError;

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
  const { serviceRoleKey } = getEnv();

  try {
    const supabase = createServiceClient();

    // Find all integrations expiring within the next 2 days
    const renewalCutoff = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    const { data: expiring, error: fetchErr } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('provider', 'google')
      .eq('is_active', true)
      .or(`watch_expiration.is.null,watch_expiration.lt.${renewalCutoff}`);

    if (fetchErr) throw fetchErr;

    if (!expiring || expiring.length === 0) {
      console.log('[renew-calendar-watches] No watches need renewal.');
      return jsonResponse({ message: 'No watches need renewal.', renewed: 0 });
    }

    console.log(`[renew-calendar-watches] Renewing ${expiring.length} watch(es)...`);
    const results: { userId: string; success: boolean; error?: string }[] = [];

      for (const integration of expiring) {
      const userId = integration.user_id;

      try {
        // Skip users whose plan does not allow calendar integrations
        const { data: planCtx } = await supabase.rpc('get_user_plan_context', { p_user_id: userId });
        const effectivePlan = (planCtx?.plan || 'free').toLowerCase();
        const { data: planLimit } = await supabase
          .from('plan_limits')
          .select('calendar_integration')
          .eq('plan', effectivePlan)
          .maybeSingle();

        if (planLimit && planLimit.calendar_integration === false) {
           console.log(`[renew-calendar-watches] Skipping user ${userId} because plan does not allow calendar integration`);
           continue;
        }
        // ── Refresh token if needed ─────────────────────────────────────────
        let accessToken = integration.access_token;
        const isExpired = new Date(integration.token_expires_at) <= new Date(Date.now() + 60_000);

        if (isExpired) {
          const refreshed = await refreshAccessToken(integration.refresh_token, clientId, clientSecret);
          if (!refreshed) {
            // If refresh fails, mark integration as inactive
            await supabase
              .from('calendar_integrations')
              .update({ is_active: false })
              .eq('user_id', userId)
              .eq('provider', 'google');
            results.push({ userId, success: false, error: 'Token refresh failed — integration deactivated' });
            continue;
          }
          accessToken = refreshed.access_token;
          await supabase
            .from('calendar_integrations')
            .update({
              access_token: accessToken,
              token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
            })
            .eq('user_id', userId)
            .eq('provider', 'google');
        }

        // ── Stop the old channel (if it exists) ────────────────────────────
        if (integration.watch_channel_id && integration.watch_resource_id) {
          try {
            await stopWatchChannel(
              integration.watch_channel_id,
              integration.watch_resource_id,
              accessToken
            );
          } catch (stopErr) {
            // Non-fatal — old channel may already be expired
            console.warn(`[renew-calendar-watches] Could not stop old channel for user ${userId}:`, stopErr);
          }
        }

        // ── Create a new watch channel via setup-calendar-watch ────────────
        const setupResp = await fetch(`${SUPABASE_FUNCTIONS_URL}/setup-calendar-watch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ userId }),
        });

        const setupResult = await setupResp.json();

        if (!setupResp.ok) {
          results.push({ userId, success: false, error: setupResult.error || 'Watch setup failed' });
          continue;
        }

        results.push({ userId, success: true });
        console.log(`[renew-calendar-watches] Successfully renewed watch for user ${userId}`);
      } catch (err) {
        results.push({ userId, success: false, error: String(err) });
        console.error(`[renew-calendar-watches] Error renewing watch for user ${userId}:`, err);
      }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return jsonResponse({
      message: `Renewed ${succeeded} watch(es). Failed: ${failed}.`,
      results,
    });
  } catch (err) {
    console.error('[renew-calendar-watches] Unexpected error:', err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
