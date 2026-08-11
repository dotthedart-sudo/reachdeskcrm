import {
  CHECKPOINT_OFFSETS_HOURS,
  REPLY_CHECK_STATUSES,
  FOLLOW_UP_CHECK_STATUSES,
} from './reminders';

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

function ordinal(n) {
  if (n >= 1 && n <= ORDINALS.length) return ORDINALS[n - 1];
  return `${n}th`;
}

/**
 * Infer which follow-up attempt this checkpoint is (1-based) from
 * last_contacted_at → next_checkpoint_at vs CHECKPOINT_OFFSETS_HOURS.
 */
export function getCheckpointAttemptNumber(lead) {
  if (!lead?.last_contacted_at || !lead?.next_checkpoint_at) return 1;
  const base = new Date(lead.last_contacted_at).getTime();
  const due = new Date(lead.next_checkpoint_at).getTime();
  if (!Number.isFinite(base) || !Number.isFinite(due) || due <= base) return 1;
  const hours = (due - base) / (1000 * 60 * 60);
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < CHECKPOINT_OFFSETS_HOURS.length; i += 1) {
    const dist = Math.abs(CHECKPOINT_OFFSETS_HOURS[i] - hours);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx + 1;
}

/**
 * Human context line, e.g. "3rd attempt — because no reply after 2 calls".
 */
export function getFollowupAttemptContext(lead, { callAttemptCount = 0 } = {}) {
  const attempt = getCheckpointAttemptNumber(lead);
  const ord = ordinal(attempt);
  const status = lead?.status || '';

  if (callAttemptCount > 0) {
    const prior = Math.max(0, callAttemptCount);
    if (prior === 1) {
      return `${ord} attempt — because no reply after 1 call`;
    }
    return `${ord} attempt — because no reply after ${prior} calls`;
  }

  if (REPLY_CHECK_STATUSES.includes(status)) {
    const prior = Math.max(0, attempt - 1);
    if (prior <= 0) {
      return `${ord} attempt — waiting for a first reply`;
    }
    if (prior === 1) {
      return `${ord} attempt — because no reply after outreach`;
    }
    return `${ord} attempt — because no reply after ${prior} follow-ups`;
  }

  if (FOLLOW_UP_CHECK_STATUSES.includes(status)) {
    return `${ord} attempt — follow up on “${status}”`;
  }

  return `${ord} follow-up`;
}

/** Reason chip label for Reminder rows. */
export function getFollowupReasonTag(lead) {
  const status = lead?.status || 'Follow-up';
  if (REPLY_CHECK_STATUSES.includes(status)) return 'No reply yet';
  if (status === 'No show') return 'No show';
  if (status === 'Not Interested') return 'Not interested';
  return status;
}

export function getFollowupReasonColor(lead) {
  const status = lead?.status || '';
  if (status === 'No show') return { bg: 'color-mix(in srgb, var(--status-hot) 16%, transparent)', color: 'var(--status-hot)' };
  if (status === 'Not Interested') return { bg: 'color-mix(in srgb, var(--text-muted) 18%, transparent)', color: 'var(--text-secondary)' };
  if (FOLLOW_UP_CHECK_STATUSES.includes(status)) {
    return { bg: 'color-mix(in srgb, var(--status-warm) 16%, transparent)', color: 'var(--status-warm)' };
  }
  return { bg: 'color-mix(in srgb, var(--status-cold) 16%, transparent)', color: 'var(--status-cold)' };
}
