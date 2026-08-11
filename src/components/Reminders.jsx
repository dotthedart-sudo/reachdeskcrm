import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Folder } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getTeamIds, getEffectiveUserTimeZone } from '../lib/utils';
import {
  updateLeadStatusAndCheckpoint,
  FOLLOW_UP_CHECK_STATUSES,
} from '../lib/reminders';
import {
  fetchUpcomingCheckpointLeads,
  leadDisplayName,
  formatOverdueLabel,
} from '../lib/checkpointNotifications';
import {
  getFollowupAttemptContext,
  getFollowupReasonTag,
  getFollowupReasonColor,
} from '../lib/followupContext';
import { todayDateKeyInZone, toDateKeyInZone } from '../lib/dateTime';
import { usePageHeader } from '../context/PageHeaderContext';
import './Reminders.css';

function addDaysToDateKey(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days, 12, 0, 0);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function relativeLabel(iso, timeZone) {
  if (!iso) return '';
  const due = new Date(iso);
  const now = Date.now();
  if (due.getTime() <= now) return formatOverdueLabel(iso);
  const dayKey = toDateKeyInZone(due, timeZone);
  const today = todayDateKeyInZone(timeZone);
  if (dayKey === today) {
    return due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone });
  }
  const tomorrow = addDaysToDateKey(today, 1);
  if (dayKey === tomorrow) return 'Tomorrow';
  return due.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });
}

function ReminderRow({ lead, callAttemptCount, timeZone, busy, onMarkDone, onOpen }) {
  const name = leadDisplayName(lead);
  const folderName = lead.folder?.name || (lead.folder_id ? 'List' : 'Unfiled');
  const reason = getFollowupReasonTag(lead);
  const reasonColors = getFollowupReasonColor(lead);
  const attemptLine = getFollowupAttemptContext(lead, { callAttemptCount });
  const when = relativeLabel(lead.next_checkpoint_at, timeZone);
  const isOverdue = lead.next_checkpoint_at && new Date(lead.next_checkpoint_at) <= new Date();

  return (
    <div className={`rd-reminder-row${isOverdue ? ' rd-reminder-row--overdue' : ''}`}>
      <button type="button" className="rd-reminder-row__main" onClick={() => onOpen(lead)}>
        <div className="rd-reminder-row__top">
          <span className="rd-reminder-row__name">{name}</span>
          <span
            className="rd-reminder-row__tag"
            style={{ background: reasonColors.bg, color: reasonColors.color }}
          >
            {reason}
          </span>
          <span className={`rd-reminder-row__when${isOverdue ? ' is-overdue' : ''}`}>{when}</span>
        </div>
        <div className="rd-reminder-row__meta">
          <span className="rd-reminder-row__folder">
            <Folder size={12} /> {folderName}
          </span>
          <span className="rd-reminder-row__attempt">{attemptLine}</span>
        </div>
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={busy}
        onClick={() => onMarkDone(lead)}
      >
        <Check size={14} /> Mark done
      </button>
    </div>
  );
}

function ReminderGroup({ title, tone, items, callAttemptsByLead, timeZone, busyId, onMarkDone, onOpen }) {
  if (!items.length) return null;
  return (
    <section className="rd-reminder-group">
      <header className={`rd-reminder-group__header rd-reminder-group__header--${tone}`}>
        <h3>{title}</h3>
        <span>{items.length}</span>
      </header>
      <div className="rd-reminder-group__list">
        {items.map((lead) => (
          <ReminderRow
            key={lead.id}
            lead={lead}
            callAttemptCount={callAttemptsByLead[lead.id] || 0}
            timeZone={timeZone}
            busy={busyId === lead.id}
            onMarkDone={onMarkDone}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  );
}

export default function Reminders({ currentUser }) {
  const navigate = useNavigate();
  const timeZone = useMemo(() => getEffectiveUserTimeZone(currentUser), [currentUser?.timezone]);
  const [leads, setLeads] = useState([]);
  const [callAttemptsByLead, setCallAttemptsByLead] = useState({});
  const [suggestionRules, setSuggestionRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  usePageHeader({ title: 'Reminders' });

  const fetchReminders = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const { data: rules } = await supabase.from('action_suggestion_rules').select('*');
      if (rules) setSuggestionRules(rules);

      const teamIds = await getTeamIds(currentUser.id);
      const today = todayDateKeyInZone(timeZone);
      // Horizon: end of week spanning ~7 days ahead from today
      const throughKey = addDaysToDateKey(today, 7);
      const [y, m, d] = throughKey.split('-').map(Number);
      const through = new Date(y, m - 1, d, 23, 59, 59, 999);

      const upcoming = await fetchUpcomingCheckpointLeads({
        userIds: teamIds,
        through,
        limit: 200,
      });
      setLeads(upcoming);

      const ids = upcoming.map((l) => l.id);
      if (ids.length) {
        const { data: attempts } = await supabase
          .from('lead_call_attempts')
          .select('lead_id')
          .in('lead_id', ids);
        const counts = {};
        for (const row of attempts || []) {
          counts[row.lead_id] = (counts[row.lead_id] || 0) + 1;
        }
        setCallAttemptsByLead(counts);
      } else {
        setCallAttemptsByLead({});
      }
    } catch (err) {
      console.error('Error fetching reminders:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, timeZone]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const groups = useMemo(() => {
    const today = todayDateKeyInZone(timeZone);
    const overdue = [];
    const todayItems = [];
    const weekItems = [];
    for (const lead of leads) {
      if (!lead.next_checkpoint_at) continue;
      const dayKey = toDateKeyInZone(new Date(lead.next_checkpoint_at), timeZone);
      if (dayKey < today) overdue.push(lead);
      else if (dayKey === today) todayItems.push(lead);
      else weekItems.push(lead);
    }
    return { overdue, today: todayItems, week: weekItems };
  }, [leads, timeZone]);

  const handleMarkDone = async (lead) => {
    if (!lead?.id || busyId) return;
    setBusyId(lead.id);
    try {
      if (FOLLOW_UP_CHECK_STATUSES.includes(lead.status)) {
        await updateLeadStatusAndCheckpoint({
          lead,
          newStatus: 'Waiting',
          suggestionRules,
          currentUser,
        });
      } else {
        const { data: updated, error } = await supabase
          .from('leads')
          .update({ next_checkpoint_at: null })
          .eq('id', lead.id)
          .select()
          .single();
        if (error) throw error;
        if (currentUser?.sync_followups_to_google) {
          const { queueFollowupGoogleSync } = await import('../lib/googleFollowupSync');
          queueFollowupGoogleSync({
            lead: { ...updated, google_followup_event_id: lead.google_followup_event_id },
            currentUser,
          });
        }
      }
      setLeads((prev) => prev.filter((l) => l.id !== lead.id));
    } catch (err) {
      console.error('Error marking reminder done:', err);
      alert(err.message || 'Could not mark reminder done.');
    } finally {
      setBusyId(null);
    }
  };

  const openLead = (lead) => {
    navigate(`/leads?leadId=${lead.id}`);
  };

  if (!currentUser) {
    return <div className="loading-container">Loading profile...</div>;
  }

  if (loading) {
    return <div className="loading-container">Loading reminders...</div>;
  }

  const empty = groups.overdue.length + groups.today.length + groups.week.length === 0;

  return (
    <div className="flex-col gap-4 page-stack rd-reminders-page">
      <p className="rd-reminders-page__sub">
        Follow-ups due from your outreach schedule. Finish them here — they stay in ReachDesk unless you turn on Google Calendar sync in Settings.
      </p>

      {empty ? (
        <div className="card rd-empty-state">
          <div className="rd-empty-state-icon">
            <Check size={28} />
          </div>
          <h3>You&apos;re all caught up!</h3>
          <p>No pending follow-ups right now.</p>
        </div>
      ) : (
        <>
          <ReminderGroup
            title="Overdue"
            tone="overdue"
            items={groups.overdue}
            callAttemptsByLead={callAttemptsByLead}
            timeZone={timeZone}
            busyId={busyId}
            onMarkDone={handleMarkDone}
            onOpen={openLead}
          />
          <ReminderGroup
            title="Today"
            tone="today"
            items={groups.today}
            callAttemptsByLead={callAttemptsByLead}
            timeZone={timeZone}
            busyId={busyId}
            onMarkDone={handleMarkDone}
            onOpen={openLead}
          />
          <ReminderGroup
            title="This week"
            tone="week"
            items={groups.week}
            callAttemptsByLead={callAttemptsByLead}
            timeZone={timeZone}
            busyId={busyId}
            onMarkDone={handleMarkDone}
            onOpen={openLead}
          />
        </>
      )}
    </div>
  );
}
