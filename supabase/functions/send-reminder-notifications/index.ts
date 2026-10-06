import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createServiceClient,
  getEnv,
  jsonResponse,
  requirePrivileged,
} from '../_shared/auth.ts';

const REPLY_CHECK_STATUSES = ['Contacted', 'Invite Sent', 'Proposal Sent', 'Followed up'];
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

function formatContactedAgo(dateStr: string | null | undefined, now = new Date()): string {
  if (!dateStr) return 'recently';
  const diffMs = now.getTime() - new Date(dateStr).getTime();
  if (diffMs <= 0) return 'just now';
  const mins = Math.floor(diffMs / (60 * 1000));
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatDigestBody(leads: any[]): string {
  const n = leads.length;
  const names = leads.map((l) => [l.first_name, l.last_name].filter(Boolean).join(' ').trim() || 'Lead');
  if (n === 1) {
    return `1 follow-up due today — ${names[0]}`;
  }
  if (n === 2) {
    return `2 follow-ups due today — ${names[0]} and ${names[1]}`;
  }
  const remaining = n - 2;
  return `${n} follow-ups due today — ${names[0]}, ${names[1]} and ${remaining} more`;
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

    const statusFilterList = CHECKPOINT_CYCLE_STATUSES.map((s) => `"${s}"`).join(',');
    const { data: dueLeads, error: leadsError } = await supabase
      .from('leads')
      .select('id, user_id, first_name, last_name, company, status, call_action, next_checkpoint_at, last_contacted_at, folder_id, checkpoint_notified_at')
      .in('user_id', profileIds)
      .or(`status.in.(${statusFilterList}),call_action.eq."Callback scheduled"`)
      .not('next_checkpoint_at', 'is', null)
      .lte('next_checkpoint_at', nowIso)
      .order('next_checkpoint_at', { ascending: true });

    if (leadsError) throw leadsError;

    // Resolve list / folder names
    const folderIds = [...new Set((dueLeads || []).map((l) => l.folder_id).filter(Boolean))];
    const folderMap = new Map<string, string>();
    if (folderIds.length > 0) {
      const { data: folders } = await supabase
        .from('folders')
        .select('id, name')
        .in('id', folderIds);
      if (folders) {
        folders.forEach((f) => folderMap.set(f.id, f.name));
      }
    }

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

      const mode = (profile.reminder_notification_mode || 'both').toLowerCase();
      const digestHour = Number.isFinite(profile.reminder_digest_hour)
        ? Number(profile.reminder_digest_hour)
        : 9;
      const tz = profile.timezone || 'UTC';
      const localHour = localHourInZone(tz, now);
      const localDate = localDateKeyInZone(tz, now);

      const shouldDigest = mode === 'digest' || mode === 'both';
      const shouldInstant = mode === 'instant' || mode === 'both';

      try {
        if (shouldDigest) {
          // Digest: once per local day at configured hour
          if (localHour === digestHour && profile.reminder_digest_sent_date !== localDate) {
            await sendPush(
              serviceRoleKey,
              profile.id,
              'ReachDesk CRM',
              formatDigestBody(userLeads),
              '/leads',
            );

            const { error: updProfileErr } = await supabase
              .from('user_profiles')
              .update({ reminder_digest_sent_date: localDate })
              .eq('id', profile.id);
            if (updProfileErr) throw updProfileErr;

            digestSent += 1;
          }
        }

        if (shouldInstant) {
          // Notify each due lead once per checkpoint value
          for (const lead of userLeads) {
            const notifiedAt = lead.checkpoint_notified_at
              ? new Date(lead.checkpoint_notified_at).getTime()
              : 0;
            const checkpointAt = lead.next_checkpoint_at
              ? new Date(lead.next_checkpoint_at).getTime()
              : 0;
            if (notifiedAt && notifiedAt >= checkpointAt) continue;

            const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim() || lead.company || 'Lead';
            const listName = (lead.folder_id && folderMap.get(lead.folder_id)) || 'Unfiled';
            const contactedAgo = formatContactedAgo(lead.last_contacted_at, now);
            const isCallback = lead.call_action === 'Callback scheduled';

            const body = isCallback
              ? `Scheduled callback for ${name} is due · ${listName}`
              : `${name} needs a follow-up · contacted ${contactedAgo} · ${listName}`;

            await sendPush(
              serviceRoleKey,
              profile.id,
              'ReachDesk CRM',
              body,
              `/leads?lead=${lead.id}`,
            );

            const { error: updErr } = await supabase
              .from('leads')
              .update({ checkpoint_notified_at: nowIso })
              .eq('id', lead.id);
            if (updErr) throw updErr;
            instantSent += 1;
          }
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
