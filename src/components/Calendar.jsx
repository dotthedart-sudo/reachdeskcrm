import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon,
  Phone, X, Link as LinkIcon, Lock, ExternalLink, Activity,
  Pencil, Trash2, ClipboardList, Layers, Mail, Bell,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getTeamIds } from '../lib/utils';
import { useAppContext } from '../App';
import { leadDisplayName } from '../lib/outreachQueue';
import {
  getEffectiveUserTimeZone,
  todayDateKeyInZone,
  toDateKeyInZone,
  parseEventDayKeyInZone,
  formatLocalTime,
  formatTimeZoneHint,
  googleDateTimePayload,
  isoToLocalTimeInZone,
  addMinutesToTimeStr,
  pad2,
  getActivityDayKey,
} from '../lib/dateTime';
import { LogCallModal } from './CRM/OutreachTracker';
import PlanColdCallsModal from './Calendar/PlanColdCallsModal';
import CallWindowBadge from './CRM/CallWindowBadge';
import ActivityTimelineRow from './CRM/ActivityTimelineRow';
import { getLeadLocalTimeLabel } from '../lib/leadTimezone';
import { fetchTeamTimelineForDay, logLeadTimelineEvent } from '../lib/leadTimeline';
import {
  fetchTeamCalendarPermissions,
  fetchTeamMembersForCalendar,
  fetchTeamPlannedTasks,
  canViewTeamCalendarFeed,
  hasTeamCalendarActivity,
} from '../lib/calendarActivity';
import { hasTeammates } from '../lib/teamWorkspace';
import MemberActivityFilter from './CRM/callActivity/MemberActivityFilter';
import './Calendar/Calendar.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const VIEWS = [
  { id: 'plan', label: 'Plan', icon: ClipboardList },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'meetings', label: 'Meetings', icon: CalendarIcon },
  { id: 'all', label: 'All', icon: Layers },
];

const DURATION_CHIPS = [
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '45m', minutes: 45 },
  { label: '1h', minutes: 60 },
];

const ACTIVITY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'calls', label: 'Calls' },
  { id: 'messages', label: 'Messages' },
  { id: 'status', label: 'Status changes' },
  { id: 'notes', label: 'Notes' },
  { id: 'plan', label: 'Plan' },
];

const TASK_TYPE_LABELS = {
  call: 'Call',
  email: 'Email',
  follow_up: 'Follow-up',
  other: 'Task',
};

function matchesActivityFilter(event, filterId) {
  if (!event || filterId === 'all') return true;
  const type = event.event_type;
  if (filterId === 'calls') return type === 'call_logged';
  if (filterId === 'messages') return type === 'reply_logged' || type === 'message_sent';
  if (filterId === 'status') return type === 'status_changed' || type === 'field_changed' || type === 'timestamp_corrected';
  if (filterId === 'notes') return type === 'note_added';
  if (filterId === 'plan') return type === 'plan_completed' || type === 'plan_missed' || type === 'plan_cancelled';
  return true;
}

function toDateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthBounds(year, month) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - start.getDay());
  const gridEnd = new Date(end);
  gridEnd.setDate(end.getDate() + (6 - end.getDay()));
  return { start, end, gridStart, gridEnd };
}

function isWriteScopeError(err, data) {
  const msg = `${err?.message || ''} ${data?.error || ''} ${data?.details || ''}`.toLowerCase();
  return (
    msg.includes('insufficient')
    || msg.includes('insufficientpermissions')
    || msg.includes('forbidden')
    || msg.includes('403')
    || msg.includes('scope')
    || msg.includes('reconnect')
  );
}

function ViewSwitcher({ view, onChange }) {
  return (
    <div role="tablist" aria-label="Calendar view" className="cal-segment">
      {VIEWS.map(({ id, label, icon: Icon }) => {
        const active = view === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={`cal-segment__btn${active ? ' cal-segment__btn--active' : ''}`}
          >
            <Icon size={14} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function MeetingCard({ ev, onEdit, onDelete, deleting, timeZone }) {
  return (
    <div className="cal-list-row">
      <div className="cal-list-row__title">{ev.summary}</div>
      <div className="cal-list-row__meta">
        {formatLocalTime(ev.start, { timeZone, showZone: true, allDay: ev.allDay })}
        {ev.attendees?.length > 0 && (
          <> · {ev.attendees.map((a) => a.email).join(', ')}</>
        )}
      </div>
      <div className="cal-list-row__actions">
        {(ev.hangoutLink || ev.htmlLink) && (
          <a
            href={ev.hangoutLink || ev.htmlLink}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary btn-sm"
            style={{ textDecoration: 'none' }}
          >
            <LinkIcon size={12} /> {ev.hangoutLink ? 'Join Meet' : 'Open in Google'}
          </a>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(ev)}>
          <Pencil size={12} /> Edit
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onDelete(ev)}
          disabled={deleting}
          style={{ color: 'var(--status-hot)' }}
        >
          <Trash2 size={12} /> {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

function PlanTaskRow({ task, onLog, onCancel, onOpenLead, defaultCountryCode }) {
  const lead = task.leads || task.lead;
  const taskType = task.task_type || 'call';
  const isCheckpoint = !!task.is_checkpoint;
  const localTime = lead ? getLeadLocalTimeLabel(lead, new Date(), defaultCountryCode) : null;
  const statusStyle = {
    pending: { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' },
    done: { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' },
    missed: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' },
    cancelled: { bg: 'rgba(107, 114, 128, 0.2)', color: '#9ca3af' },
  }[task.status] || { bg: 'var(--bg-tertiary)', color: 'var(--text-muted)' };

  const actionLabel = taskType === 'email'
    ? 'Open lead'
    : taskType === 'follow_up'
      ? 'Follow up'
      : 'Log call';
  const ActionIcon = taskType === 'email' ? Mail : taskType === 'follow_up' ? Bell : Phone;

  return (
    <div className="cal-list-row">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'flex-start' }}>
        <button
          type="button"
          onClick={() => onOpenLead(lead?.id)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit', flex: 1 }}
        >
          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{leadDisplayName(lead)}</div>
          {lead?.phone && taskType === 'call' && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{lead.phone}</div>
          )}
          {isCheckpoint && lead?.action_to_take && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Next step: {lead.action_to_take}
            </div>
          )}
          {localTime && taskType === 'call' && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Their time: {localTime}
            </div>
          )}
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
            {isCheckpoint ? 'Due follow-up' : TASK_TYPE_LABELS[taskType] || taskType}
          </span>
          {!isCheckpoint && (
            <span className="badge" style={{ background: statusStyle.bg, color: statusStyle.color }}>
              {task.status}
            </span>
          )}
          {lead && taskType === 'call' && <CallWindowBadge lead={lead} defaultCountryCode={defaultCountryCode} />}
        </div>
      </div>
      {(task.status === 'pending' || task.status === 'missed' || isCheckpoint) && onLog && (
        <div className="cal-list-row__actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onLog(task)}>
            <ActionIcon size={12} /> {actionLabel}
          </button>
          {!isCheckpoint && onCancel && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onCancel(task)}>
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function CalendarPage({ currentUser }) {
  const navigate = useNavigate();
  const { calendarUnlocked } = useAppContext() || {};
  const calAllowed = !!calendarUnlocked;
  const userTz = useMemo(() => getEffectiveUserTimeZone(currentUser), [currentUser?.timezone]);
  const todayKey = useMemo(() => todayDateKeyInZone(userTz), [userTz]);
  const timezoneHint = useMemo(() => formatTimeZoneHint(userTz), [userTz]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [view, setView] = useState('plan');
  const [meetingsLayout, setMeetingsLayout] = useState('month');
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(() => todayDateKeyInZone());
  const [events, setEvents] = useState([]);
  const [outreachByDay, setOutreachByDay] = useState({});
  const [timelineByDay, setTimelineByDay] = useState({});
  const [planByDay, setPlanByDay] = useState({});
  const [allLeads, setAllLeads] = useState([]);
  const [allAttempts, setAllAttempts] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calConnected, setCalConnected] = useState(null);
  const [error, setError] = useState('');
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [eventModal, setEventModal] = useState(null);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [logCallTask, setLogCallTask] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [activityTypeFilter, setActivityTypeFilter] = useState('all');
  const [memberFilter, setMemberFilter] = useState('');
  const [calendarMembers, setCalendarMembers] = useState([]);
  const [calendarPerms, setCalendarPerms] = useState(null);
  const [teamIds, setTeamIds] = useState([currentUser?.id].filter(Boolean));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const { gridStart, gridEnd, start: monthStart, end: monthEnd } = useMemo(
    () => monthBounds(year, month),
    [year, month],
  );

  const days = useMemo(() => {
    const list = [];
    const d = new Date(gridStart);
    while (d <= gridEnd) {
      list.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return list;
  }, [gridStart, gridEnd]);

  const markPastPendingAsMissed = useCallback(async (userId) => {
    const todayStartKey = todayDateKeyInZone(userTz);
    await supabase
      .from('planned_outreach_tasks')
      .update({ status: 'missed' })
      .eq('user_id', userId)
      .eq('status', 'pending')
      .lt('planned_date', todayStartKey);
  }, [userTz]);

  const loadData = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    setError('');

    try {
      await markPastPendingAsMissed(currentUser.id);

      const { data: integration } = await supabase
        .from('calendar_integrations')
        .select('id, is_active')
        .eq('user_id', currentUser.id)
        .eq('provider', 'google')
        .eq('is_active', true)
        .maybeSingle();
      setCalConnected(!!integration);

      const outreachStart = new Date(monthStart);
      outreachStart.setDate(outreachStart.getDate() - 7);
      const outreachEnd = new Date(monthEnd);
      outreachEnd.setDate(outreachEnd.getDate() + 7);

      const planStartKey = toDateKeyInZone(gridStart, userTz);
      const planEndKey = toDateKeyInZone(gridEnd, userTz);

      const upcomingEnd = new Date(today);
      upcomingEnd.setDate(upcomingEnd.getDate() + 14);
      upcomingEnd.setHours(23, 59, 59, 999);

      const eventsTimeMin = gridStart.toISOString();
      const eventsTimeMax = new Date(
        Math.max(
          new Date(gridEnd.getFullYear(), gridEnd.getMonth(), gridEnd.getDate(), 23, 59, 59).getTime(),
          upcomingEnd.getTime(),
        ),
      ).toISOString();

      const teamIdsResolved = await getTeamIds(currentUser.id);
      setTeamIds(teamIdsResolved);

      const teamId = currentUser.team_id || null;
      if (teamId && hasTeammates(teamIdsResolved)) {
        const [members, perms] = await Promise.all([
          fetchTeamMembersForCalendar(teamId),
          fetchTeamCalendarPermissions(teamId),
        ]);
        setCalendarMembers(members || []);
        setCalendarPerms(perms);
      } else {
        setCalendarMembers([]);
        setCalendarPerms(null);
      }

      const [
        { data: attempts, error: attErr },
        { data: leads, error: leadsErr },
        { data: folderRows, error: folderErr },
        { data: checkpointLeads, error: checkpointErr },
      ] = await Promise.all([
        supabase
          .from('lead_call_attempts')
          .select('id, lead_id, outcome, created_at, leads:lead_id(id, first_name, last_name, email, phone, status, timezone, timezone_source)')
          .eq('user_id', currentUser.id)
          .gte('created_at', outreachStart.toISOString())
          .lte('created_at', outreachEnd.toISOString())
          .order('created_at', { ascending: false }),
        supabase
          .from('leads')
          .select('id, first_name, last_name, email, phone, company, folder_id, status, timezone, timezone_source, next_checkpoint_at, action_to_take')
          .in('user_id', teamIdsResolved)
          .order('created_at', { ascending: false }),
        supabase
          .from('folders')
          .select('id, name, color')
          .in('user_id', teamIdsResolved)
          .order('sort_order', { ascending: true }),
        supabase
          .from('leads')
          .select('id, first_name, last_name, email, phone, status, timezone, timezone_source, next_checkpoint_at, action_to_take')
          .in('user_id', teamIdsResolved)
          .not('next_checkpoint_at', 'is', null)
          .gte('next_checkpoint_at', `${planStartKey}T00:00:00`)
          .lte('next_checkpoint_at', `${planEndKey}T23:59:59`),
      ]);

      let planned = [];
      try {
        planned = await fetchTeamPlannedTasks({
          fromDate: planStartKey,
          toDate: planEndKey,
          memberId: memberFilter || null,
        });
        if (planned.length > 0) {
          const leadIds = [...new Set(planned.map((t) => t.lead_id).filter(Boolean))];
          const leadMap = new Map((leads || []).map((l) => [l.id, l]));
          planned = planned.map((task) => ({
            ...task,
            leads: leadMap.get(task.lead_id) || null,
          }));
        }
      } catch (planFetchErr) {
        console.warn('[Calendar] planned tasks RPC failed, falling back:', planFetchErr);
        const { data: fallbackPlan, error: planErr } = await supabase
          .from('planned_outreach_tasks')
          .select('*, leads:lead_id(id, first_name, last_name, email, phone, status, timezone, timezone_source)')
          .eq('user_id', currentUser.id)
          .gte('planned_date', planStartKey)
          .lte('planned_date', planEndKey)
          .neq('status', 'cancelled')
          .order('planned_date', { ascending: true });
        if (planErr) throw planErr;
        planned = fallbackPlan || [];
      }

      if (attErr) throw attErr;
      if (leadsErr) throw leadsErr;
      if (folderErr) throw folderErr;
      if (checkpointErr) throw checkpointErr;

      setAllLeads(leads || []);
      setFolders(folderRows || []);

      const { data: allAtt } = await supabase
        .from('lead_call_attempts')
        .select('id, lead_id, outcome, created_at')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
      setAllAttempts(allAtt || []);

      const byDay = {};
      for (const row of attempts || []) {
        const key = parseEventDayKeyInZone(row.created_at, userTz);
        if (!byDay[key]) byDay[key] = new Map();
        if (!byDay[key].has(row.lead_id)) {
          byDay[key].set(row.lead_id, {
            lead: row.leads,
            attemptCount: 0,
            lastOutcome: row.outcome,
          });
        }
        byDay[key].get(row.lead_id).attemptCount += 1;
      }
      const outreachMap = {};
      for (const [key, map] of Object.entries(byDay)) {
        outreachMap[key] = Array.from(map.values());
      }
      setOutreachByDay(outreachMap);

      try {
        const timelineRows = await fetchTeamTimelineForDay({
          fromDate: planStartKey,
          toDate: planEndKey,
          memberId: memberFilter || null,
          limit: 1000,
        });
        const tMap = {};
        for (const row of timelineRows || []) {
          const key = getActivityDayKey(row, userTz);
          if (!key) continue;
          if (!tMap[key]) tMap[key] = [];
          tMap[key].push(row);
        }
        for (const key of Object.keys(tMap)) {
          tMap[key].sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
        }
        setTimelineByDay(tMap);
      } catch (tlErr) {
        console.warn('[Calendar] timeline load failed:', tlErr);
        setTimelineByDay({});
      }

      const planMap = {};
      for (const task of planned || []) {
        const key = task.planned_date || parseEventDayKeyInZone(task.planned_at, userTz);
        if (!key) continue;
        if (!planMap[key]) planMap[key] = [];
        planMap[key].push(task);
      }
      for (const lead of checkpointLeads || []) {
        const key = parseEventDayKeyInZone(lead.next_checkpoint_at, userTz);
        if (!key) continue;
        if (!planMap[key]) planMap[key] = [];
        planMap[key].push({
          id: `checkpoint-${lead.id}-${key}`,
          lead_id: lead.id,
          leads: lead,
          lead,
          task_type: 'follow_up',
          status: 'pending',
          is_checkpoint: true,
        });
      }
      setPlanByDay(planMap);

      if (integration && calAllowed) {
        const { data, error: fnErr } = await supabase.functions.invoke('google-calendar-api', {
          body: {
            action: 'list',
            timeMin: eventsTimeMin,
            timeMax: eventsTimeMax,
          },
        });
        if (fnErr) throw fnErr;
        if (data?.error) throw new Error(data.error);
        setEvents(data?.events || []);
      } else {
        setEvents([]);
      }
    } catch (err) {
      console.error('[Calendar] load failed:', err);
      setError(err.message || 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, currentUser?.team_id, monthStart, monthEnd, gridStart, gridEnd, calAllowed, today, markPastPendingAsMissed, userTz, memberFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const eventsByDay = useMemo(() => {
    const map = {};
    for (const ev of events) {
      const key = parseEventDayKeyInZone(ev.start, userTz);
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    return map;
  }, [events, userTz]);

  const upcomingEvents = useMemo(() => {
    const end = new Date(today);
    end.setDate(end.getDate() + 14);
    const endKey = toDateKeyInZone(end, userTz);
    return events
      .filter((ev) => {
        const key = parseEventDayKeyInZone(ev.start, userTz);
        return key && key >= todayKey && key <= endKey;
      })
      .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  }, [events, today, todayKey, userTz]);

  const selectedEvents = eventsByDay[selectedDay] || [];
  const selectedOutreach = outreachByDay[selectedDay] || [];
  const filteredTimeline = (timelineByDay[selectedDay] || []).filter((ev) => matchesActivityFilter(ev, activityTypeFilter));
  const selectedTimeline = filteredTimeline;
  const selectedPlan = planByDay[selectedDay] || [];
  const planPending = selectedPlan.filter((t) => t.status === 'pending' || t.is_checkpoint);
  const planDone = selectedPlan.filter((t) => t.status === 'done' && !t.is_checkpoint);
  const planMissed = selectedPlan.filter((t) => t.status === 'missed' && !t.is_checkpoint);

  const showMemberFilter = hasTeamCalendarActivity(currentUser, teamIds)
    && canViewTeamCalendarFeed(currentUser, calendarPerms);

  const isPlan = view === 'plan';
  const isActivity = view === 'activity';
  const isMeetings = view === 'meetings';
  const isAll = view === 'all';

  const showPlanBadges = isPlan || isAll;
  const showActivityBadges = isActivity || isAll;
  const showMeetingBadges = isMeetings || isAll;

  const openLead = (leadId) => {
    if (!leadId) return;
    sessionStorage.setItem('reachdesk_auto_open_lead', JSON.stringify({ leadId }));
    navigate('/leads');
  };

  const handlePlanAction = (task) => {
    if (task.is_checkpoint || task.task_type === 'follow_up' || task.task_type === 'email') {
      openLead(task.lead_id || task.leads?.id);
      return;
    }
    setLogCallTask(task);
  };

  const handleCalendarWriteError = (err, data) => {
    if (isWriteScopeError(err, data)) {
      setNeedsReconnect(true);
      setError('Reconnect Google Calendar in Settings to create or edit events.');
      return true;
    }
    setError(data?.error || err?.message || 'Something went wrong');
    return false;
  };

  const openAddEvent = (dateKey = selectedDay) => {
    if (!calConnected) {
      const go = window.confirm(
        'Connect Google Calendar in Settings to add meetings. Go to Settings now?',
      );
      if (go) navigate('/settings');
      return;
    }
    setView('meetings');
    setMeetingsLayout('month');
    setSelectedDay(dateKey);
    setEventModal({ mode: 'create', defaultDate: dateKey });
  };

  const openEditEvent = (ev) => {
    setView('meetings');
    setMeetingsLayout('month');
    setEventModal({ mode: 'edit', event: ev });
  };

  const handleDayClick = (key) => {
    setSelectedDay(key);
    if (isMeetings) {
      openAddEvent(key);
    }
  };

  const buildEventPayload = (form) => {
    const [sh, sm] = form.startTime.split(':').map(Number);
    const [eh, em] = form.endTime.split(':').map(Number);
    if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) {
      throw new Error('Invalid date/time');
    }
    if (eh * 60 + em <= sh * 60 + sm) {
      throw new Error('End time must be after start time');
    }
    const attendeeEmails = form.attendeeEmail.trim()
      ? [form.attendeeEmail.trim().toLowerCase()]
      : [];
    return {
      summary: form.title.trim(),
      description: form.description.trim() || undefined,
      start: googleDateTimePayload(form.date, form.startTime, userTz),
      end: googleDateTimePayload(form.date, form.endTime, userTz),
      timeZone: userTz,
      attendeeEmails,
    };
  };

  const handleSaveEvent = async (form) => {
    setSaving(true);
    setError('');
    try {
      const payload = buildEventPayload(form);
      const isEdit = eventModal?.mode === 'edit';

      const { data, error: fnErr } = await supabase.functions.invoke('google-calendar-api', {
        body: {
          action: isEdit ? 'update' : 'create',
          eventId: isEdit ? eventModal.event?.id : undefined,
          ...payload,
        },
      });
      if (fnErr) {
        if (!handleCalendarWriteError(fnErr, data)) throw fnErr;
        return;
      }
      if (data?.error) {
        if (!handleCalendarWriteError(new Error(data.error), data)) throw new Error(data.error);
        return;
      }

      setEventModal(null);
      setView('meetings');
      await loadData();
    } catch (err) {
      console.error('[Calendar] save failed:', err);
      if (!needsReconnect) {
        setError(err.message || 'Failed to save event');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async (ev) => {
    if (!ev?.id) return;
    if (!window.confirm(`Delete "${ev.summary}" from your Google Calendar? Attendees will be notified.`)) return;

    setDeletingId(ev.id);
    setError('');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('google-calendar-api', {
        body: { action: 'delete', eventId: ev.id },
      });
      if (fnErr) {
        if (!handleCalendarWriteError(fnErr, data)) throw fnErr;
        return;
      }
      if (data?.error) {
        if (!handleCalendarWriteError(new Error(data.error), data)) throw new Error(data.error);
        return;
      }
      await loadData();
    } catch (err) {
      console.error('[Calendar] delete failed:', err);
      if (!needsReconnect) {
        setError(err.message || 'Failed to delete event');
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleCancelPlanTask = async (task) => {
    try {
      const { error: updErr } = await supabase
        .from('planned_outreach_tasks')
        .update({ status: 'cancelled' })
        .eq('id', task.id)
        .eq('user_id', currentUser.id);
      if (updErr) throw updErr;
      if (task.lead_id && currentUser?.id) {
        logLeadTimelineEvent({
          leadId: task.lead_id,
          userId: currentUser.id,
          teamId: currentUser.team_id || null,
          eventType: 'plan_cancelled',
          summary: 'Planned call cancelled',
          detail: { task_id: task.id },
          timeZone: userTz,
        }).catch(() => {});
      }
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to remove planned call');
    }
  };

  const handleCallLogged = async () => {
    if (!logCallTask) return;
    try {
      await supabase
        .from('planned_outreach_tasks')
        .update({ status: 'done', completed_at: new Date().toISOString() })
        .eq('id', logCallTask.id)
        .eq('user_id', currentUser.id);
      if (logCallTask.lead_id && currentUser?.id) {
        logLeadTimelineEvent({
          leadId: logCallTask.lead_id,
          userId: currentUser.id,
          teamId: currentUser.team_id || null,
          eventType: 'plan_completed',
          summary: 'Planned call completed',
          detail: { task_id: logCallTask.id },
          timeZone: userTz,
        }).catch(() => {});
      }
      setLogCallTask(null);
      await loadData();
    } catch (err) {
      console.error('[Calendar] mark plan done failed:', err);
    }
  };

  const viewSubtitle = {
    plan: 'Plan who to call each day — log calls from here or Call Activity.',
    activity: 'All lead activity for the day — calls, status changes, and more.',
    meetings: 'Google Calendar meetings. Click a day to schedule; click an event to edit.',
    all: 'Plan, activity timeline, and meetings in one view.',
  }[view];

  if (!calAllowed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: '1rem', textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
        <Lock size={32} />
        <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Calendar is on Pro and Teams</h3>
        <p style={{ margin: 0, maxWidth: 420 }}>
          Plan outreach, track activity, and see Google meetings in one place. Teams members inherit access from an active workspace.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/upgrade')}>
          Upgrade to Pro
        </button>
      </div>
    );
  }

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const existingPlanLeadIds = selectedPlan.map((t) => t.lead_id).filter(Boolean);
  const defaultCountryCode = currentUser?.default_country_code || '+92';

  return (
    <div className="flex-col gap-4 page-stack" style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarIcon size={22} style={{ color: 'var(--accent-blue)' }} /> Calendar
          </h2>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {viewSubtitle}
          </p>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {timezoneHint}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {calConnected === false && (
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/settings')}>
              Connect Google Calendar
            </button>
          )}
          {(isPlan || isAll) && (
            <button type="button" className="btn btn-secondary" onClick={() => setPlanModalOpen(true)}>
              <Phone size={14} /> Plan cold calls
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => openAddEvent()}
            title={!calConnected ? 'Connect Google Calendar to add events' : 'Add meeting'}
          >
            <Plus size={14} /> Add Event
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <ViewSwitcher view={view} onChange={setView} />
        {showMemberFilter && (
          <MemberActivityFilter
            members={calendarMembers}
            value={memberFilter}
            onChange={setMemberFilter}
          />
        )}
        {isMeetings && (
          <div className="cal-segment">
            {[
              { id: 'month', label: 'Month' },
              { id: 'upcoming', label: 'Next 14 days' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMeetingsLayout(opt.id)}
                className={`cal-segment__btn${meetingsLayout === opt.id ? ' cal-segment__btn--active' : ''}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {needsReconnect && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 8,
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          fontSize: '0.875rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}>
          <span>
            Reconnect Google Calendar in Settings to create, edit, or delete events.
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/settings')}>
            Go to Settings
          </button>
        </div>
      )}

      {error && !needsReconnect && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: 8, background: 'rgba(224,82,82,0.1)', border: '1px solid rgba(224,82,82,0.25)', color: 'var(--status-hot)', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {isMeetings && meetingsLayout === 'upcoming' ? (
        <div className="card flex-col gap-3" style={{ padding: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Upcoming meetings</h3>
          {!calConnected ? (
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Connect Google Calendar in Settings to see upcoming meetings.
            </p>
          ) : upcomingEvents.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              No meetings in the next 14 days.
            </p>
          ) : (
            <div className="flex-col gap-2">
              {upcomingEvents.map((ev) => {
                const dayKey = parseEventDayKeyInZone(ev.start, userTz);
                return (
                  <div key={ev.id}>
                    <MeetingCard
                      ev={ev}
                      onEdit={openEditEvent}
                      onDelete={handleDeleteEvent}
                      deleting={deletingId === ev.id}
                      timeZone={userTz}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ marginTop: '0.35rem' }}
                      onClick={() => {
                        if (dayKey) setSelectedDay(dayKey);
                        setMeetingsLayout('month');
                        if (dayKey) {
                          const [y, m] = dayKey.split('-').map(Number);
                          setCursor(new Date(y, m - 1, 1));
                        }
                      }}
                    >
                      View on {dayKey && new Date(dayKey + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {loading && <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</div>}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(280px, 1fr)', gap: '1rem' }} className="calendar-layout">
          <div className="card flex-col gap-3" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="Previous month">
                <ChevronLeft size={16} />
              </button>
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{monthLabel}</h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="Next month">
                <ChevronRight size={16} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {WEEKDAYS.map((d) => (
                <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', padding: '0.25rem' }}>
                  {d}
                </div>
              ))}

              {days.map((day) => {
                const key = toDateKey(day);
                const inMonth = day.getMonth() === month;
                const isToday = key === todayKey;
                const isSelected = key === selectedDay;
                const dayEvents = eventsByDay[key] || [];
                const outreachCount = (outreachByDay[key] || []).length;
                const activityCount = (timelineByDay[key] || []).length || outreachCount;
                const planCount = (planByDay[key] || []).filter((t) => t.status === 'pending').length;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleDayClick(key)}
                    style={{
                      minHeight: 76,
                      border: isSelected ? '1px solid var(--accent-blue)' : '1px solid var(--border-color)',
                      borderRadius: 6,
                      background: isSelected ? 'rgba(91, 143, 185, 0.12)' : 'var(--bg-tertiary)',
                      padding: '0.35rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                      opacity: inMonth ? 1 : 0.45,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isToday ? 'var(--accent-blue)' : 'transparent',
                        color: isToday ? '#fff' : 'var(--text-primary)',
                      }}
                    >
                      {day.getDate()}
                    </span>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 'auto' }}>
                      {showPlanBadges && planCount > 0 && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 999,
                            background: 'rgba(59, 130, 246, 0.18)',
                            color: '#3b82f6',
                            width: 'fit-content',
                          }}
                        >
                          {planCount} to call
                        </span>
                      )}

                      {showActivityBadges && activityCount > 0 && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 999,
                            background: 'rgba(236, 72, 153, 0.18)',
                            color: '#ec4899',
                            width: 'fit-content',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Activity size={9} /> {activityCount} activity
                        </span>
                      )}

                      {showMeetingBadges && dayEvents.slice(0, 2).map((ev) => (
                        <span
                          key={ev.id}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); openEditEvent(ev); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); openEditEvent(ev); } }}
                          style={{
                            fontSize: '0.62rem',
                            lineHeight: 1.2,
                            padding: '1px 4px',
                            borderRadius: 3,
                            background: 'rgba(91, 143, 185, 0.25)',
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                          }}
                          title={`Edit: ${ev.summary}`}
                        >
                          {ev.summary}
                        </span>
                      ))}
                      {showMeetingBadges && dayEvents.length > 2 && (
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>+{dayEvents.length - 2} more</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {loading && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</div>
            )}
          </div>

          <div className="card flex-col gap-3" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
                  {new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </h3>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {isPlan && 'Planned outreach'}
                  {isActivity && 'Lead activity'}
                  {isMeetings && 'Meetings'}
                  {isAll && 'Everything for this day'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {(isPlan || isAll) && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPlanModalOpen(true)}>
                    <Plus size={12} /> Plan
                  </button>
                )}
                {(isMeetings || isAll) && calConnected && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => openAddEvent(selectedDay)}>
                    <Plus size={12} /> Event
                  </button>
                )}
              </div>
            </div>

            {(isPlan || isAll) && (
              <>
                <DaySection title={`TO CALL (${planPending.length})`}>
                  {planPending.length === 0 ? (
                    <EmptyHint>No calls planned. Use Plan cold calls to add leads.</EmptyHint>
                  ) : (
                    planPending.map((task) => (
                      <PlanTaskRow
                        key={task.id}
                        task={task}
                        onLog={handlePlanAction}
                        onCancel={handleCancelPlanTask}
                        onOpenLead={openLead}
                        defaultCountryCode={defaultCountryCode}
                      />
                    ))
                  )}
                </DaySection>

                {planDone.length > 0 && (
                  <DaySection title={`DONE (${planDone.length})`}>
                    {planDone.map((task) => (
                      <PlanTaskRow key={task.id} task={task} onOpenLead={openLead} defaultCountryCode={defaultCountryCode} />
                    ))}
                  </DaySection>
                )}

                {planMissed.length > 0 && (
                  <DaySection title={`MISSED (${planMissed.length})`}>
                    {planMissed.map((task) => (
                      <PlanTaskRow
                        key={task.id}
                        task={task}
                        onLog={handlePlanAction}
                        onCancel={handleCancelPlanTask}
                        onOpenLead={openLead}
                        defaultCountryCode={defaultCountryCode}
                      />
                    ))}
                  </DaySection>
                )}
              </>
            )}

            {(isActivity || isAll) && (
              <DaySection title={`ACTIVITY (${selectedTimeline.length || selectedOutreach.length})`}>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  {ACTIVITY_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={activityTypeFilter === f.id ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                      onClick={() => setActivityTypeFilter(f.id)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => navigate('/leads?view=outreach')}
                  >
                    View in Call Activity
                  </button>
                </div>
                {selectedTimeline.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {selectedTimeline.map((ev) => (
                      <ActivityTimelineRow
                        key={ev.id}
                        event={ev}
                        showLead
                        compact
                        onOpenLead={openLead}
                      />
                    ))}
                  </div>
                ) : selectedOutreach.length === 0 ? (
                  <EmptyHint>No activity this day. Change a status, log a call, or complete a plan item.</EmptyHint>
                ) : (
                  selectedOutreach.map((row) => (
                    <button
                      key={row.lead?.id || `${row.lastOutcome}-${row.attemptCount}`}
                      type="button"
                      onClick={() => openLead(row.lead?.id)}
                      style={{
                        padding: '0.65rem 0.75rem',
                        borderRadius: 6,
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-tertiary)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        color: 'inherit',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <span>{leadDisplayName(row.lead)}</span>
                        <ExternalLink size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {row.attemptCount} call{row.attemptCount === 1 ? '' : 's'}
                        {row.lastOutcome ? ` · ${row.lastOutcome}` : ''}
                      </div>
                    </button>
                  ))
                )}
              </DaySection>
            )}

            {(isMeetings || isAll) && (
              <DaySection title={`MEETINGS (${selectedEvents.length})`}>
                {selectedEvents.length === 0 ? (
                  <EmptyHint>
                    {calConnected ? 'No meetings — click the day on the grid to schedule one.' : 'Connect Google Calendar to see meetings.'}
                  </EmptyHint>
                ) : (
                  selectedEvents.map((ev) => (
                    <MeetingCard
                      key={ev.id}
                      ev={ev}
                      onEdit={openEditEvent}
                      onDelete={handleDeleteEvent}
                      deleting={deletingId === ev.id}
                      timeZone={userTz}
                    />
                  ))
                )}
              </DaySection>
            )}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 860px) {
          .calendar-layout {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {eventModal && (
        <EventModal
          mode={eventModal.mode}
          event={eventModal.event}
          defaultDate={eventModal.defaultDate || selectedDay}
          timeZone={userTz}
          saving={saving}
          onClose={() => setEventModal(null)}
          onSubmit={handleSaveEvent}
        />
      )}

      {planModalOpen && (
        <PlanColdCallsModal
          open={planModalOpen}
          onClose={() => setPlanModalOpen(false)}
          plannedDate={selectedDay}
          userId={currentUser.id}
          leads={allLeads}
          attempts={allAttempts}
          folders={folders}
          existingLeadIds={existingPlanLeadIds}
          defaultCountryCode={defaultCountryCode}
          userTimeZone={userTz}
          onPlanned={loadData}
        />
      )}

      {logCallTask && (
        <LogCallModal
          open
          onClose={() => setLogCallTask(null)}
          leads={allLeads}
          userId={currentUser.id}
          teamId={currentUser.team_id || null}
          fixedLead={logCallTask.leads}
          onLogged={handleCallLogged}
          timeZone={userTz}
        />
      )}
    </div>
  );
}

function DaySection({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem', letterSpacing: '0.04em' }}>
        {title}
      </div>
      <div className="flex-col gap-2">{children}</div>
    </div>
  );
}

function EmptyHint({ children }) {
  return (
    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{children}</p>
  );
}

function EventModal({ mode, event, defaultDate, timeZone, saving, onClose, onSubmit }) {
  const isEdit = mode === 'edit';
  const initialDate = isEdit ? (parseEventDayKeyInZone(event?.start, timeZone) || defaultDate) : defaultDate;

  const [title, setTitle] = useState(isEdit ? (event?.summary || '') : '');
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(isEdit ? isoToLocalTimeInZone(event?.start, timeZone) : '10:00');
  const [endTime, setEndTime] = useState(isEdit ? isoToLocalTimeInZone(event?.end, timeZone) : '10:30');
  const [attendeeEmail, setAttendeeEmail] = useState(isEdit ? (event?.attendees?.[0]?.email || '') : '');
  const [description, setDescription] = useState(isEdit ? (event?.description || '') : '');

  const applyDuration = (minutes) => {
    setEndTime(addMinutesToTimeStr(startTime, minutes));
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100 }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 'min(440px, 92vw)', padding: '1.25rem', background: 'var(--bg-card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>{isEdit ? 'Edit Event' : 'Add Event'}</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <form
          className="flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ title, date, startTime, endTime, attendeeEmail, description });
          }}
        >
          <div className="form-group">
            <label className="form-label">Title</label>
            <input className="form-input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Discovery call" />
          </div>
          <div className="form-group">
            <label className="form-label">Date</label>
            <input className="form-input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Start</label>
              <input className="form-input" type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">End</label>
              <input className="form-input" type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Duration</label>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {DURATION_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => applyDuration(chip.minutes)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Attendee email (optional)</label>
            <input className="form-input" type="email" value={attendeeEmail} onChange={(e) => setAttendeeEmail(e.target.value)} placeholder="prospect@email.com" />
          </div>
          <div className="form-group">
            <label className="form-label">Notes (optional)</label>
            <textarea className="form-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !title.trim()}>
              {saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save changes' : 'Create in Google Calendar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
