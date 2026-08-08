import { teamMemberDisplayName } from './teamWorkspace';
import { getSuggestionForStatus } from './reminders';

const MISMATCH_CAP = 5;

/** Build grouped + capped mismatch feed items for a lead set. */
export function buildMismatchFeedItems(leads, rules, { suggestionsEnabled = true, ownerId = null, profile = null } = {}) {
  if (!suggestionsEnabled) return { items: [], overflowCount: 0 };

  const mismatches = leads.filter((l) => {
    if (ownerId && l.user_id !== ownerId) return false;
    const suggestion = getSuggestionForStatus(l.status, rules, profile);
    return suggestion && l.action_to_take !== suggestion;
  });

  const groups = new Map();
  mismatches.forEach((l) => {
    const suggestion = getSuggestionForStatus(l.status, rules, profile);
    const key = `${l.status || ''}|${l.action_to_take || ''}|${suggestion}`;
    if (!groups.has(key)) {
      groups.set(key, { status: l.status, action: l.action_to_take, suggestion, leads: [] });
    }
    groups.get(key).leads.push(l);
  });

  const groupedEntries = [...groups.values()].sort((a, b) => b.leads.length - a.leads.length);
  const items = [];
  let shown = 0;
  let overflowCount = 0;

  for (const group of groupedEntries) {
    if (group.leads.length > 1 && shown < MISMATCH_CAP) {
      items.push({
        id: `mismatch-group-${group.status}-${group.suggestion}`,
        type: 'mismatch-group',
        leads: group.leads,
        status: group.status,
        action: group.action,
        suggestion: group.suggestion,
        count: group.leads.length,
        severity: 'medium',
      });
      shown += 1;
      overflowCount += Math.max(0, group.leads.length - 1);
      continue;
    }

    for (const lead of group.leads) {
      if (shown >= MISMATCH_CAP) {
        overflowCount += 1;
        continue;
      }
      items.push({
        id: `mismatch-${lead.id}`,
        type: 'mismatch',
        lead,
        suggestion: getSuggestionForStatus(lead.status, rules, profile),
        severity: 'medium',
      });
      shown += 1;
    }
  }

  return { items, overflowCount };
}

export function buildPersonalUpNextFeed({
  leads,
  invoices,
  rules,
  windowDays,
  currentUserId,
  suggestionsEnabled = true,
  profile = null,
}) {
  const now = new Date();
  const nowStr = now.toISOString();
  const windowLimit = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000);
  const windowLimitStr = windowLimit.toISOString();
  const ownLeads = leads.filter((l) => l.user_id === currentUserId);

  // Include overdue (<= now) and upcoming within window; overdue sorts first via date
  const upcomingCheckpoints = ownLeads
    .filter((l) => l.next_checkpoint_at && l.next_checkpoint_at <= windowLimitStr)
    .map((l) => {
      const overdue = l.next_checkpoint_at <= nowStr;
      return {
        id: `checkpoint-${l.id}`,
        type: 'checkpoint',
        channel: 'message',
        lead: l,
        title: `Follow up with ${l.first_name || ''} ${l.last_name || ''}`.trim(),
        date: l.next_checkpoint_at,
        severity: overdue ? 'critical' : 'high',
        overdue,
      };
    });

  const upcomingInvoices = invoices
    .filter((inv) => {
      if (inv.status?.toLowerCase() === 'paid') return false;
      if (!inv.due_date) return false;
      const dueDate = new Date(inv.due_date);
      return dueDate > now && dueDate <= windowLimit;
    })
    .map((inv) => ({
      id: `invoice-${inv.id}`,
      type: 'invoice',
      invoice: inv,
      title: `Invoice #${inv.invoice_number} is due`,
      date: inv.due_date,
      severity: 'medium',
    }));

  const { items: mismatchItems, overflowCount: mismatchOverflow } = buildMismatchFeedItems(
    ownLeads,
    rules,
    { suggestionsEnabled, ownerId: currentUserId, profile },
  );

  const postMeetingCheckIns = ownLeads
    .filter((l) => l.status === 'Booked' && l.meeting_ends_at && l.meeting_ends_at <= nowStr)
    .map((l) => ({
      id: `meeting-checkin-${l.id}`,
      type: 'meeting-checkin',
      lead: l,
      title: `How did your meeting with ${l.first_name || ''} go?`,
      date: l.meeting_ends_at,
      severity: 'high',
    }));

  const combined = [...upcomingCheckpoints, ...upcomingInvoices, ...mismatchItems, ...postMeetingCheckIns];
  if (mismatchOverflow > 0) {
    combined.push({
      id: 'mismatch-overflow',
      type: 'mismatch-overflow',
      count: mismatchOverflow,
      severity: 'low',
    });
  }

  combined.sort((a, b) => {
    if (a.type === 'mismatch-overflow' || b.type === 'mismatch-overflow') return 1;
    if (a.date && b.date) return new Date(a.date) - new Date(b.date);
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return 0;
  });

  return combined;
}

/** Owner team summary — counts, not per-lead cards. */
export function buildTeamOverview({
  leads,
  rules,
  teamProfilesMap = {},
  suggestionsEnabled = true,
  profile = null,
  currentUserId = null,
}) {
  const byMember = {};
  leads.forEach((l) => {
    const uid = l.user_id;
    if (!byMember[uid]) {
      const entry = teamProfilesMap[uid];
      const name = uid === currentUserId
        ? 'You'
        : teamMemberDisplayName(entry);
      byMember[uid] = {
        userId: uid,
        name,
        leads: [],
        mismatchCount: 0,
        checkpointCount: 0,
      };
    }
    byMember[uid].leads.push(l);
    if (l.next_checkpoint_at && new Date(l.next_checkpoint_at) > new Date()) {
      byMember[uid].checkpointCount += 1;
    }
    if (suggestionsEnabled) {
      const suggestion = getSuggestionForStatus(l.status, rules, profile);
      if (suggestion && l.action_to_take !== suggestion) {
        byMember[uid].mismatchCount += 1;
      }
    }
  });

  const statusCounts = {};
  leads.forEach((l) => {
    const s = l.status || 'Lead';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });

  const followUpLeads = leads
    .filter((l) => l.next_checkpoint_at)
    .sort((a, b) => new Date(a.next_checkpoint_at) - new Date(b.next_checkpoint_at))
    .slice(0, 15);

  return {
    memberSummaries: Object.values(byMember).sort((a, b) => b.mismatchCount - a.mismatchCount),
    statusCounts,
    followUpLeads,
    totalLeads: leads.length,
  };
}

export function mismatchCopy({ lead, suggestion, teamProfilesMap, currentUserId, isOwnLead }) {
  const name = lead.first_name || 'this lead';
  const current = lead.action_to_take || 'No Action';
  if (isOwnLead || lead.user_id === currentUserId) {
    return `You marked ${name}'s next step as '${current}' — we'd suggest '${suggestion}' instead.`;
  }
  const owner = teamMemberDisplayName(teamProfilesMap[lead.user_id], 'A teammate');
  return `${owner}'s lead ${name} — next step is '${current}'; suggested '${suggestion}'.`;
}
