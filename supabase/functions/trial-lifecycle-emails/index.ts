import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requirePrivileged, jsonResponse } from '../_shared/auth.ts';
import { refreshAccessToken, stopWatchChannel } from '../_shared/googleCalendar.ts';

serve(async (req) => {
  // Check x-cron-secret
  const authError = requirePrivileged(req);
  if (authError) return authError;

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: users, error: usersErr } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email, full_name, plan, trial_ends_at, trial_reminder_2day_sent, trial_reminder_sent, trial_ended_email_sent')
      .eq('plan', 'trial')
      .or('account_locked.is.null,account_locked.eq.false')
      .or('team_role.neq.member,team_id.is.null');

    if (usersErr) throw usersErr;

    console.log(`[trial-lifecycle-emails] Found ${users?.length || 0} active trial users.`);

    const now = new Date();
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    const wrapperHeader = `
      <div style="background-color: #0D1117; color: #FFFFFF; font-family: sans-serif; padding: 30px; border-radius: 3px; max-width: 600px; margin: 0 auto; border: 1px solid #21262D;">
        <div style="text-align: center; margin-bottom: 20px;">
          <span style="font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.08em; font-size: 22px; color: #FFFFFF; font-weight: bold;">ReachDesk</span>
        </div>
    `;
    const wrapperFooter = `</div>`;

    for (const user of users || []) {
      if (!user.trial_ends_at) continue;
      
      const trialEndsAt = new Date(user.trial_ends_at);
      const msUntilExpiry = trialEndsAt.getTime() - now.getTime();
      const daysUntilExpiry = msUntilExpiry / (1000 * 60 * 60 * 24);

      try {
        // 1. Trial Ended
        if (daysUntilExpiry <= 0 && !user.trial_ended_email_sent) {
          if (resendApiKey) {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${resendApiKey}`,
              },
              body: JSON.stringify({
                from: 'ReachDesk CRM <noreply@reachdeskcrm.com>',
                reply_to: 'support@reachdeskcrm.com',
                to: user.email,
                subject: 'Your trial has ended — you are now on the Free plan',
                html: `
                  ${wrapperHeader}
                  <h2 style="color: #5B8FB9; border-bottom: 1px solid #21262D; padding-bottom: 10px;">Your trial has ended</h2>
                  <p>Hi ${user.full_name || 'there'},</p>
                  <p>Your trial has ended, and your account has been moved to the Free plan. You can still access basic features, but integrations like Google Calendar and Sheets have been paused.</p>
                  <div style="text-align: center; margin: 28px 0;">
                    <a href="https://app.reachdeskcrm.com/configuration?tab=billing" style="background-color: #5B8FB9; color: #0D1117; padding: 12px 24px; text-decoration: none; border-radius: 3px; font-weight: bold; display: inline-block;">Upgrade to unlock features</a>
                  </div>
                  ${wrapperFooter}
                `,
              }),
            });
          }

          // Stop Calendar watch
          const { data: calInt } = await supabaseAdmin
            .from('calendar_integrations')
            .select('*')
            .eq('user_id', user.id)
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
              console.warn(`[trial-lifecycle-emails] Failed to stop calendar watch for ${user.id}:`, e);
            }
          }

          await supabaseAdmin
            .from('calendar_integrations')
            .update({ is_active: false, watch_channel_id: null, watch_resource_id: null, watch_expiration: null })
            .eq('user_id', user.id);

          await supabaseAdmin
            .from('sheets_integrations')
            .update({ is_active: false })
            .eq('user_id', user.id);

          await supabaseAdmin
            .from('user_profiles')
            .update({ plan: 'free', trial_ended_email_sent: true })
            .eq('id', user.id);

        } 
        // 2. 1-day reminder
        else if (daysUntilExpiry <= 1 && daysUntilExpiry > 0 && !user.trial_reminder_sent) {
          if (resendApiKey) {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${resendApiKey}`,
              },
              body: JSON.stringify({
                from: 'ReachDesk CRM <noreply@reachdeskcrm.com>',
                reply_to: 'support@reachdeskcrm.com',
                to: user.email,
                subject: 'Your trial ends tomorrow',
                html: `
                  ${wrapperHeader}
                  <h2 style="color: #5B8FB9; border-bottom: 1px solid #21262D; padding-bottom: 10px;">Your trial ends tomorrow</h2>
                  <p>Hi ${user.full_name || 'there'},</p>
                  <p>Your ReachDesk CRM trial ends tomorrow. Your account will automatically move to the Free plan.</p>
                  <p>Keep your integrations and premium features active by upgrading your plan.</p>
                  <div style="text-align: center; margin: 28px 0;">
                    <a href="https://app.reachdeskcrm.com/configuration?tab=billing" style="background-color: #5B8FB9; color: #0D1117; padding: 12px 24px; text-decoration: none; border-radius: 3px; font-weight: bold; display: inline-block;">Upgrade now</a>
                  </div>
                  ${wrapperFooter}
                `,
              }),
            });
          }
          await supabaseAdmin.from('user_profiles').update({ trial_reminder_sent: true }).eq('id', user.id);
        }
        // 3. 2-day reminder
        else if (daysUntilExpiry <= 2.5 && daysUntilExpiry > 1 && !user.trial_reminder_2day_sent) {
          if (resendApiKey) {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${resendApiKey}`,
              },
              body: JSON.stringify({
                from: 'ReachDesk CRM <noreply@reachdeskcrm.com>',
                reply_to: 'support@reachdeskcrm.com',
                to: user.email,
                subject: 'Your trial ends in 2 days',
                html: `
                  ${wrapperHeader}
                  <h2 style="color: #5B8FB9; border-bottom: 1px solid #21262D; padding-bottom: 10px;">Your trial ends in 2 days</h2>
                  <p>Hi ${user.full_name || 'there'},</p>
                  <p>Your ReachDesk CRM trial ends in 2 days. Your account will automatically move to the Free plan.</p>
                  <p>Keep your integrations and premium features active by upgrading your plan.</p>
                  <div style="text-align: center; margin: 28px 0;">
                    <a href="https://app.reachdeskcrm.com/configuration?tab=billing" style="background-color: #5B8FB9; color: #0D1117; padding: 12px 24px; text-decoration: none; border-radius: 3px; font-weight: bold; display: inline-block;">Upgrade now</a>
                  </div>
                  ${wrapperFooter}
                `,
              }),
            });
          }
          await supabaseAdmin.from('user_profiles').update({ trial_reminder_2day_sent: true }).eq('id', user.id);
        }
      } catch (e) {
        console.error(`[trial-lifecycle-emails] Error processing user ${user.id}:`, e);
      }
    }

    return jsonResponse({ success: true, processed: users?.length || 0 });
  } catch (error) {
    console.error('[trial-lifecycle-emails] Error:', error);
    return jsonResponse({ error: String(error) }, 500);
  }
});
