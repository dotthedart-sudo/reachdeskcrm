import { supabase } from './supabase';
import { getEffectiveUserTimeZone, googleDateTimePayload } from './dateTime';
import { leadDisplayName } from './checkpointNotifications';

/**
 * Create / update / delete Google Calendar events for lead follow-up checkpoints
 * when the user has sync_followups_to_google enabled.
 */

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Local HH:mm for an ISO timestamp in a given IANA zone. */
function isoToHmInZone(iso, timeZone) {
  if (!iso) return '09:00';
  try {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const hour = parts.find((p) => p.type === 'hour')?.value || '09';
    const minute = parts.find((p) => p.type === 'minute')?.value || '00';
    return `${hour}:${minute}`;
  } catch {
    const d = new Date(iso);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
}

function isoToDateKeyInZone(iso, timeZone) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (y && m && day) return `${y}-${m}-${day}`;
  } catch {
    /* fall through */
  }
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addMinutesHm(hm, minutes) {
  const [h, m] = (hm || '09:00').split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(((total % (24 * 60)) + 24 * 60) % (24 * 60) / 60);
  const nm = ((total % 60) + 60) % 60;
  return `${pad2(nh)}:${pad2(nm)}`;
}

async function invokeCalendar(body) {
  const { data, error } = await supabase.functions.invoke('google-calendar-api', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Sync a lead's follow-up checkpoint to Google Calendar if the preference is on.
 * Safe no-op when preference off, not connected, or no checkpoint.
 */
export async function syncFollowupToGoogleCalendar({
  lead,
  currentUser,
  previousCheckpointAt = null,
} = {}) {
  if (!lead?.id || !currentUser?.id) return null;

  const syncOn = currentUser.sync_followups_to_google === true;
  const tz = getEffectiveUserTimeZone(currentUser);
  const existingEventId = lead.google_followup_event_id || null;
  const nextAt = lead.next_checkpoint_at || null;

  // Preference off: remove remote event if we previously created one
  if (!syncOn) {
    if (existingEventId) {
      try {
        await invokeCalendar({ action: 'delete', eventId: existingEventId });
      } catch (err) {
        console.warn('[googleFollowupSync] delete while sync off failed:', err);
      }
      await supabase
        .from('leads')
        .update({ google_followup_event_id: null })
        .eq('id', lead.id);
    }
    return null;
  }

  // No checkpoint → delete remote event
  if (!nextAt) {
    if (existingEventId) {
      try {
        await invokeCalendar({ action: 'delete', eventId: existingEventId });
      } catch (err) {
        console.warn('[googleFollowupSync] delete cleared checkpoint failed:', err);
      }
      const { data } = await supabase
        .from('leads')
        .update({ google_followup_event_id: null })
        .eq('id', lead.id)
        .select()
        .maybeSingle();
      return data;
    }
    return lead;
  }

  const dateKey = isoToDateKeyInZone(nextAt, tz);
  const startHm = isoToHmInZone(nextAt, tz);
  const endHm = addMinutesHm(startHm, 30);
  const name = leadDisplayName(lead);
  const summary = `Follow up: ${name}`;
  const description = [
    lead.action_to_take ? `Next step: ${lead.action_to_take}` : null,
    lead.status ? `Status: ${lead.status}` : null,
    'Created by ReachDesk (follow-up sync).',
  ].filter(Boolean).join('\n');

  const payload = {
    summary,
    description,
    start: googleDateTimePayload(dateKey, startHm, tz),
    end: googleDateTimePayload(dateKey, endHm, tz),
    timeZone: tz,
  };

  try {
    if (existingEventId) {
      const data = await invokeCalendar({
        action: 'update',
        eventId: existingEventId,
        ...payload,
      });
      return { ...lead, google_followup_event_id: data?.event?.id || existingEventId };
    }

    const data = await invokeCalendar({ action: 'create', ...payload });
    const newId = data?.event?.id || null;
    if (!newId) return lead;

    const { data: updated } = await supabase
      .from('leads')
      .update({ google_followup_event_id: newId })
      .eq('id', lead.id)
      .select()
      .maybeSingle();

    return updated || { ...lead, google_followup_event_id: newId };
  } catch (err) {
    // Not connected / scope / network — leave in-app reminder intact
    console.warn('[googleFollowupSync] sync failed:', err?.message || err);
    return lead;
  }
}

/** Fire-and-forget wrapper used after status updates. */
export function queueFollowupGoogleSync(args) {
  Promise.resolve()
    .then(() => syncFollowupToGoogleCalendar(args))
    .catch((err) => console.warn('[googleFollowupSync] queue failed:', err));
}
