/** Shared cold-outreach queue logic (Outreach Tracker + Calendar Plan picker). */

import { todayDateKeyInZone } from './dateTime';
import { TERMINAL_OUTCOMES, FOLLOW_UP_DAYS } from './callOutcomes';

export function startOfToday(timeZone) {
  // Device/browser midnight by default; optional IANA zone via date key
  if (timeZone) {
    const key = todayDateKeyInZone(timeZone);
    if (key) {
      const d = new Date(`${key}T00:00:00`);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function leadDisplayName(lead) {
  if (!lead) return 'Lead';
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim();
  return name || lead.email || lead.company || 'Untitled lead';
}

export function computeNextFollowUp(lastAttempt) {
  if (!lastAttempt) return null;
  const days = FOLLOW_UP_DAYS[lastAttempt.outcome];
  if (days === null || days === undefined) return null;
  return addDays(new Date(lastAttempt.created_at), days);
}

/** Latest attempt per lead_id from flat attempts list. */
export function attemptsByLeadMap(attempts) {
  const map = new Map();
  for (const row of attempts || []) {
    if (!map.has(row.lead_id)) map.set(row.lead_id, row);
  }
  return map;
}

/** Array of all attempts per lead_id from flat attempts list (assuming input is sorted newest first). */
export function allAttemptsByLeadMap(attempts) {
  const map = new Map();
  for (const row of attempts || []) {
    const list = map.get(row.lead_id) || [];
    list.push(row);
    map.set(row.lead_id, list);
  }
  return map;
}

/** Same queue as Outreach Tracker "Start Calling Session". Respects call_action on each lead. */
export function buildOutreachSessionQueue(leads, attempts, timeZone = null) {
  const byLead = attemptsByLeadMap(attempts);
  const today = startOfToday(timeZone);
  const callNow = [];
  const needs = [];
  const neverCalled = [];

  for (const lead of leads || []) {
    const action = (lead.call_action || '').trim();
    if (action && SKIP_QUEUE_CALL_ACTIONS.has(action)) continue;

    const last = byLead.get(lead.id);
    if (!last) {
      if (action === 'Try again tomorrow') continue;
      neverCalled.push(lead);
      continue;
    }

    if (TERMINAL_OUTCOMES.has(last.outcome)) continue;

    const next = computeNextFollowUp(last);
    const dueForFollowUp = next && next.getTime() <= today.getTime();

    if (PRIORITY_CALL_ACTIONS.has(action)) {
      callNow.push(lead);
    } else if (dueForFollowUp) {
      needs.push(lead);
    } else if (action === 'Try again tomorrow') {
      // Wait until follow-up date
    }
  }

  return [...callNow, ...needs, ...neverCalled];
}

const SKIP_QUEUE_CALL_ACTIONS = new Set([
  'No call needed',
  'Wrong number — remove',
  'Not interested — close',
]);

const PRIORITY_CALL_ACTIONS = new Set(['Call now']);

export function leadsNeverCalled(leads, attempts) {
  const called = new Set((attempts || []).map((a) => a.lead_id));
  return (leads || []).filter((l) => !called.has(l.id));
}

export { sortByCallability, isLeadCallableNow } from './leadTimezone';
