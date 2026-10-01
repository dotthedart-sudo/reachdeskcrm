import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createServiceClient,
  getEnv,
  jsonResponse,
  requirePrivileged,
} from '../_shared/auth.ts';

const REPLY_CHECK_STATUSES = ['Contacted', 'Calendly Sent', 'Proposal Sent', 'Followed up'];
const FOLLOW_UP_CHECK_STATUSES = ['No show', 'Not Interested'];
const CHECKPOINT_CYCLE_STATUSES = [...REPLY_CHECK_STATUSES, ...FOLLOW_UP_CHECK_STATUSES];

function localHourInZone(timeZone: string | null | undefined, date = new Date()): number {
  const tz = (timeZone || '').trim() || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date);
    const hour = parts.find((p) => p.type === 'hour')?.value;
    return hour != null ? Number(hour) : date.getUTCHours();
  } catch {
    return date.getUTCHours();
  }
}

function localDateKeyInZone(timeZone: string | null | undefined, date = new Date()): string {
  const tz = (timeZone || '').trim() || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // fall through
  }
  return date.toISOString().slice(0, 10);
}

async function sendPush(
  serviceRoleKey: string,
  targetUserId: string,
  title: string,
  body: string,
  url: string,
) {
  const resp = await fetch(
    `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        target_user_id: targetUserId,
        title,
        body,
        url,
      }),
    },
  );
  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(errBody || 'Push invoke failed');
  }
}

serve(async (req) => {
  const authError = requirePrivileged(req);
  if (authError) return authError;

  try {
    const supabase = createServiceClient();
    const { serviceRoleKey } = getEnv();
    const now = new Date();
    const nowIso = now.toISOString();

    // Profiles with reminders enabled + push subscriptions
    const { data: subs, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('user_id');
    if (subsError) throw subsError;

    const subscribedUserIds = [...new Set((subs || []).map((s) => s.user_id).filter(Boolean))];
    if (subscribedUserIds.length === 0) {
      return jsonResponse({ message: 'No push subscriptions.' });
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('user_profiles')
      .select('id, timezone, reminders_enabled, reminder_notification_mode, reminder_digest_hour, reminder_digest_sent_date')
      .in('id', subscribedUserIds)
      .neq('reminders_enabled', false);

    if (profilesError) throw profilesError;
    if (!profiles || profiles.length === 0) {
      return jsonResponse({ message: 'No users with reminders enabled.' });
    }

    const profileIds = profiles.map((p) => p.id);

    const { data: dueLeads, error: leadsError } = await supabase
      .from('leads')
      .select('id, user_id, first_name, last_name, status, call_action, next_checkpoint_at, checkpoint_notified_at')
      .in('user_id', profileIds)
      .or(`status.in.(${CHECKPOINT_CYCLE_STATUSES.join(',')}),call_action.eq.Callback scheduled`)
      .not('next_checkpoint_at', 'is', null)
      .lte('next_checkpoint_at', nowIso)
      .order('next_checkpoint_at', { ascending: true });

    if (leadsError) throw leadsError;

    const leadsByUser = new Map<string, typeof dueLeads>();
    for (const lead of dueLeads || []) {
      if (!leadsByUser.has(lead.user_id)) leadsByUser.set(lead.user_id, []);
      leadsByUser.get(lead.user_id)!.push(lead);
    }

    let digestSent = 0;
    let instantSent = 0;
    let failed = 0;

    for (const profile of profiles) {
      const userLeads = leadsByUser.get(profile.id) || [];
      if (userLeads.length === 0) continue;

      const mode = (profile.reminder_notification_mode || 'digest').toLowerCase();
      const digestHour = Number.isFinite(profile.reminder_digest_hour)
        ? Number(profile.reminder_digest_hour)
        : 9;
      const tz = profile.timezone || 'UTC';
      const localHour = localHourInZone(tz, now);
      const localDate = localDateKeyInZone(tz, now);

      try {
        if (mode === 'instant') {
          // Notify each due lead once per checkpoint value
          for (const lead of userLeads) {
            const notifiedAt = lead.checkpoint_notified_at
              ? new Date(lead.checkpoint_notified_at).getTime()
              : 0;
            const checkpointAt = lead.next_checkpoint_at
              ? new Date(lead.next_checkpoint_at).getTime()
              : 0;
            if (notifiedAt && notifiedAt >= checkpointAt) continue;

            const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim() || 'Lead';
            const isCallback = lead.call_action === 'Callback scheduled';
            await sendPush(
              serviceRoleKey,
              profile.id,
              isCallback ? 'ReachDesk CRM — Callback Due' : 'ReachDesk CRM — Follow-up Due',
              isCallback ? `Scheduled callback for ${name} is due.` : `Did ${name} reply? Open the lead to update status.`,
              `/crm?lead=${lead.id}`,
            );

            const { error: updErr } = await supabase
              .from('leads')
              .update({ checkpoint_notified_at: nowIso })
              .eq('id', lead.id);
            if (updErr) throw updErr;
            instantSent += 1;
          }
        } else {
          // Digest: once per local day at configured hour
          if (localHour !== digestHour) continue;
          if (profile.reminder_digest_sent_date === localDate) continue;

          const n = userLeads.length;
          await sendPush(
            serviceRoleKey,
            profile.id,
            'ReachDesk CRM — Follow-ups due',
            n === 1
              ? 'You have 1 follow-up due today'
              : `You have ${n} follow-ups due today`,
            '/dashboard?dueFollowups=1',
          );

          const leadIds = userLeads.map((l) => l.id);
          const { error: updLeadsErr } = await supabase
            .from('leads')
            .update({ checkpoint_notified_at: nowIso })
            .in('id', leadIds);
          if (updLeadsErr) throw updLeadsErr;

          const { error: updProfileErr } = await supabase
            .from('user_profiles')
            .update({ reminder_digest_sent_date: localDate })
            .eq('id', profile.id);
          if (updProfileErr) throw updProfileErr;

          digestSent += 1;
        }
      } catch (err) {
        console.error(`[send-reminder-notifications] user ${profile.id}:`, err);
        failed += 1;
      }
    }

    console.log(
      `[send-reminder-notifications] digest=${digestSent} instant=${instantSent} failed=${failed}`,
    );

    return jsonResponse({ digestSent, instantSent, failed });
  } catch (err) {
    console.error('[send-reminder-notifications] Error:', err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
