import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CURRENCY_MAP } from './CurrencySelector';
import { supabase } from '../lib/supabase';
import { useAppContext } from '../App';
import { getTeamIds, PLAN_LIMITS, getLimit, getEffectivePlan } from '../lib/utils';
import { isTeamOwner, hasTeammates } from '../lib/teamWorkspace';
import {
  buildPersonalUpNextFeed,
  buildTeamOverview,
  mismatchCopy,
} from '../lib/dashboardFeed';
import {
  fetchTeamTimelineForDay,
  actorDisplayName,
  leadDisplayFromTimeline,
} from '../lib/leadTimeline';
import { 
  updateLeadStatusAndCheckpoint, 
  applySuggestion, 
  REPLY_CHECK_STATUSES, 
  FOLLOW_UP_CHECK_STATUSES 
} from '../lib/reminders';
import {
  fetchDueCheckpointLeads,
  leadDisplayName,
  formatOverdueLabel,
} from '../lib/checkpointNotifications';
import { getEffectiveUserTimeZone, todayDateKeyInZone } from '../lib/dateTime';
import { softBadgeStyle, softDotStyle } from '../lib/softBadgeStyle';
import { 
  Users, Mail, MessageSquare, ThumbsUp, Trophy, Bell,
  ArrowRight, Lock, TrendingUp, DollarSign, Activity,
  ChevronRight, Calendar, AlertCircle, Check, X, BarChart2, Phone
} from 'lucide-react';

import { usePageHeader } from '../context/PageHeaderContext';
import { getLatestRates, convertToBase } from '../lib/exchangeRates';
import HelpPopover from './HelpPopover';
import { celebrateClosedWon } from '../utils/celebrateWin';
import { useFirstVisitReveal } from '../hooks/useFirstVisitReveal';
import PipelineStepper from './Dashboard/PipelineStepper';
import {
  MESSAGE_PIPELINE_STAGES,
  MESSAGE_STAGE_COLORS,
  CALL_PIPELINE_STAGES,
  computeLeadsOverviewFromStats,
} from '../lib/dashboardMetrics';
import { fetchLeadPipelineStats, fetchAllLeadsForScope } from '../lib/leadsQuery';
import { fetchMyCallAttempts } from '../lib/callActivity';
import { hasOutreachByPlan } from '../lib/callActivity';


// Use the shared map so any currency code the user picks renders the correct symbol
const CURRENCY_SYMBOLS = CURRENCY_MAP;

function formatTimePhrasing(targetDateStr, type) {
  const targetDate = new Date(targetDateStr);
  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  
  if (type === 'invoice') {
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = targetDate.toDateString() === tomorrow.toDateString();
    
    if (isTomorrow || diffDays <= 1) {
      return "tomorrow";
    }
    return `in ${diffDays} days`;
  } else {
    if (diffHours < 24) {
      if (diffHours <= 0) {
        return "now";
      }
      if (diffHours === 1) {
        return "in 1 hour";
      }
      return `in ${diffHours} hours`;
    }
    
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = targetDate.toDateString() === tomorrow.toDateString();
    if (isTomorrow) {
      return "tomorrow";
    }
    
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return `in ${diffDays} days`;
  }
}

export default function Dashboard({ currentUser, onSelectLead }) {
  const navigate = useNavigate();
  const { showToast, teamProfilesMap = {}, teamIds = [], teamSettings = null } = useAppContext() || {};
  const [metrics, setMetrics] = useState({ total: 0, contacted: 0, replied: 0, positive: 0 });
  const [copyAnalytics, setCopyAnalytics] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [debugError, setDebugError] = useState(null);

  // New States
  const [invoices, setInvoices] = useState([]);
  const [fxRates, setFxRates] = useState(null); // latest exchange rates, base = user's main currency
  const [suggestionRules, setSuggestionRules] = useState([]);
  const [leadsList, setLeadsList] = useState([]);
  const [upNextFeed, setUpNextFeed] = useState([]);
  const [windowDays, setWindowDays] = useState(2);
  const [upNextTab, setUpNextTab] = useState('mine');
  const [teamOverview, setTeamOverview] = useState(null);
  const [teamActivity, setTeamActivity] = useState([]);
  const [expandedReplies, setExpandedReplies] = useState({});
  const [ignoredMismatches, setIgnoredMismatches] = useState({});
  const [weekActivity, setWeekActivity] = useState({ messaged: 0, called: 0, followUpsDue: 0, days: 7 });
  const [messageStageCounts, setMessageStageCounts] = useState({});
  const [callStageCounts, setCallStageCounts] = useState({});
  const [weeklyPitchCount, setWeeklyPitchCount] = useState(0);
  const [dashboardScope, setDashboardScope] = useState(() => {
    const saved = localStorage.getItem('reachdesk_dashboard_scope');
    if (saved) return saved;
    return isTeamOwner(currentUser) ? 'team' : 'mine';
  });
  const { reveal, rootClass, blockClass, blockProp } = useFirstVisitReveal();
  const [templateStatsPage, setTemplateStatsPage] = useState(1);
  const [upcomingNextPage, setUpcomingNextPage] = useState(1);

  // Rules of Hooks: must run before any conditional return (including loading guards).
  const headerFirstName = currentUser?.full_name
    ? currentUser.full_name.trim().split(' ')[0]
    : currentUser?.email?.split('@')[0];
  usePageHeader({
    title: headerFirstName ? `Welcome back, ${headerFirstName}` : 'Dashboard',
  });

  const plan = getEffectivePlan(currentUser);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const isOwner = isTeamOwner(currentUser);
  const hasTeam = hasTeammates(teamIds);
  const suggestionsEnabled = currentUser?.suggestions_enabled !== false;

  const isTeamScope = dashboardScope === 'team' && hasTeam;

  const loadDashboardData = async (isMounted = true) => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const { data: teamMembers } = await supabase.rpc('get_my_team_members');
      const fetchedTeamIds = teamMembers?.length ? teamMembers.map(m => m.id) : [currentUser.id];
      const activeIsTeamScope = teamMembers?.length > 1 && dashboardScope === 'team';
      const activeScopeIds = activeIsTeamScope ? fetchedTeamIds : [currentUser.id];
      
      console.log('[DEBUG_LOAD] Start', { dashboardScope, teamMembersLength: teamMembers?.length, activeIsTeamScope, activeScopeIdsLength: activeScopeIds?.length });
      
      const reqId = Date.now() + Math.random();
      window.__lastDashboardReq = reqId;
      const remindersEnabled = currentUser?.reminders_enabled !== false;
      const feedColumns = 'id, user_id, first_name, last_name, status, call_status, created_at, last_contacted_at, last_called_at, action_to_take, next_checkpoint_at, template_used, reply_type, meeting_ends_at, folder_id';

      const settled = await Promise.allSettled([
        supabase.from('revenue_entries').select('*').in('user_id', activeScopeIds),
        supabase.from('action_suggestion_rules').select('*'),
        fetchLeadPipelineStats({ userIds: activeScopeIds }),
        remindersEnabled
          ? fetchDueCheckpointLeads({ userIds: activeScopeIds, limit: 5 })
          : Promise.resolve([]),
        hasOutreachByPlan(currentUser)
          ? fetchMyCallAttempts(currentUser.id)
          : Promise.resolve([]),
        // Thin columns for Up Next / team overview — paged so we never stop at 1000.
        fetchAllLeadsForScope({ userIds: activeScopeIds, columns: feedColumns }),
      ]);

      const [
        invoicesSettled,
        rulesSettled,
        pipelineSettled,
        dueSettled,
        attemptsSettled,
        feedSettled,
      ] = settled;

      if (pipelineSettled.status === 'rejected') {
        throw pipelineSettled.reason;
      }
      if (invoicesSettled.status === 'rejected') {
        console.warn('[Dashboard] invoices load failed:', invoicesSettled.reason);
      }
      if (rulesSettled.status === 'rejected') {
        console.warn('[Dashboard] rules load failed:', rulesSettled.reason);
      }
      if (dueSettled.status === 'rejected') {
        console.warn('[Dashboard] due checkpoints load failed:', dueSettled.reason);
      }
      if (attemptsSettled.status === 'rejected') {
        console.warn('[Dashboard] call attempts load failed:', attemptsSettled.reason);
      }
      if (feedSettled.status === 'rejected') {
        console.warn('[Dashboard] feed leads load failed:', feedSettled.reason);
      }

      const invoicesRes = invoicesSettled.status === 'fulfilled'
        ? invoicesSettled.value
        : { data: [] };
      const rulesRes = rulesSettled.status === 'fulfilled'
        ? rulesSettled.value
        : { data: [] };
      const pipelineStats = pipelineSettled.value;
      const dueCheckpoints = dueSettled.status === 'fulfilled' ? dueSettled.value : [];
      const attemptsData = attemptsSettled.status === 'fulfilled' ? (attemptsSettled.value?.data || attemptsSettled.value || []) : [];
      const feedLeads = feedSettled.status === 'fulfilled' ? feedSettled.value : [];

      const loadedInvoices = invoicesRes.data || [];
      const loadedRules = rulesRes.data || [];
      const loadedLeads = feedLeads || [];
      const loadedAttempts = attemptsData || [];

      
      // Map Folders
      const folderIds = new Set(loadedLeads.map(l => l.folder_id).filter(Boolean));
      if (folderIds.size > 0) {
        const { data: folderData } = await supabase.from('folders').select('id, name').in('id', Array.from(folderIds));
        const folderMap = {};
        (folderData || []).forEach(f => folderMap[f.id] = f.name);
        loadedLeads.forEach(l => {
          l.folder_name = l.folder_id ? (folderMap[l.folder_id] || 'Unfiled') : 'Unfiled';
        });
      } else {
        loadedLeads.forEach(l => { l.folder_name = 'Unfiled'; });
      }

      // Map Attempt Counts
      const attemptCounts = {};
      loadedAttempts.forEach(a => {
        attemptCounts[a.lead_id] = (attemptCounts[a.lead_id] || 0) + 1;
      });
      loadedLeads.forEach(l => {
        l.attempt_count = attemptCounts[l.id] || 0;
      });

      setInvoices(loadedInvoices);
      setSuggestionRules(loadedRules);
      setLeadsList(loadedLeads);
      setReminders(dueCheckpoints);

      setMetrics(computeLeadsOverviewFromStats(pipelineStats));
      setMessageStageCounts(pipelineStats.message_current || {});
      setCallStageCounts(pipelineStats.call_current || {});
      setWeeklyPitchCount(pipelineStats.velocity_7d || 0);

      const calledLeadIds = new Set();
      const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const a of loadedAttempts) {
        const t = new Date(a.occurred_at || a.created_at).getTime();
        if (t >= since) calledLeadIds.add(a.lead_id);
      }
      setWeekActivity({
        messaged: pipelineStats.week_messaged || 0,
        called: calledLeadIds.size,
        followUpsDue: pipelineStats.week_followups_due || 0,
        days: 7,
      });

      if (getLimit(limits, 'copyAnalytics')) {
        const counts = pipelineStats.positive_by_template || {};
        const templateIds = Object.keys(counts);
        const { data: templatesData } = templateIds.length
          ? await supabase.from('templates').select('id, title').in('id', templateIds)
          : { data: [] };
        const sentCounts = pipelineStats.sent_by_template || {}; // we don't have this in pipelineStats from SQL yet, wait, we need reply-rate view (name, sent, replies, rate %)
        const sortedAnalytics = [];
        for (const [templateId, count] of Object.entries(counts)) {
          const matchedTemplate = (templatesData || []).find((t) => t.id === templateId);
          if (matchedTemplate) {
            const sent = Number(sentCounts[templateId]) || 0;
            const positive = Number(count) || 0;
            const rate = sent > 0 ? (positive / sent) * 100 : 0;
            sortedAnalytics.push({
              id: matchedTemplate.id,
              title: matchedTemplate.title,
              count: positive,
              sent,
              positive,
              rate,
            });
          }
        }
        sortedAnalytics.sort((a, b) => b.count - a.count);

        setCopyAnalytics(sortedAnalytics);
      }

      const personalFeed = buildPersonalUpNextFeed({
        leads: loadedLeads,
        invoices: loadedInvoices,
        rules: loadedRules,
        windowDays,
        currentUserId: currentUser.id,
        suggestionsEnabled,
        profile: currentUser,
      });
      setUpNextFeed(personalFeed);

      if (isTeamScope) {
        setTeamOverview(buildTeamOverview({
          leads: loadedLeads,
          rules: loadedRules,
          teamProfilesMap,
          suggestionsEnabled,
          profile: currentUser,
          currentUserId: currentUser.id,
          totalLeads: pipelineStats.total,
        }));
        try {
          const todayKey = todayDateKeyInZone(getEffectiveUserTimeZone(currentUser));
          const events = await fetchTeamTimelineForDay({
            fromDate: todayKey,
            toDate: todayKey,
            limit: 10,
            memberId: null,
          });
          setTeamActivity(events.slice(0, 10));
        } catch {
          setTeamActivity([]);
        }
      } else {
        setTeamOverview(null);
        setTeamActivity([]);
      }

    } catch (err) {
      console.error('Error loading dashboard analytics:', err);
    } finally {
      if (isMounted) setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadDashboardData();
    }
  }, [currentUser?.id, windowDays, dashboardScope]); // removed teamProfilesMap to stop flickering

  // Latest exchange rates into the user's main currency (only needed when some revenue is in another currency).
  const needsFx = invoices.some((e) => e.currency && e.currency.toUpperCase() !== (currentUser?.default_currency || 'USD').toUpperCase());
  useEffect(() => {
    if (!needsFx) return;
    let cancelled = false;
    getLatestRates(currentUser?.default_currency || 'USD').then((data) => { if (!cancelled) setFxRates(data); });
    return () => { cancelled = true; };
  }, [needsFx, currentUser?.default_currency]);

  // Digest push deep-link: scroll to Due Follow-ups
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('dueFollowups') === '1') {
      const el = document.getElementById('due-followups');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [loading, reminders]);

  const handleScopeChange = (scope) => {
    setDashboardScope(scope);
    localStorage.setItem('reachdesk_dashboard_scope', scope);
  };

  // Unified Handler: Suggestion mismatch apply
  const handleApplyMismatchSuggestion = async (lead, suggestion) => {
    try {
      const { error } = await supabase
        .from('leads')
        .update({ action_to_take: suggestion })
        .eq('id', lead.id);
      if (error) throw error;
      loadDashboardData();
    } catch (err) {
      console.error('Error applying suggestion mismatch:', err);
      alert('Failed to apply suggestion: ' + err.message);
    }
  };

  // Unified Handler: Checkpoint outcome — uses same object signature as CheckpointPopover
  const handleLogCheckpointOutcome = async (lead, targetStatus, extraUpdates = {}) => {
    try {
      const updatedLead = await updateLeadStatusAndCheckpoint({
        lead,
        newStatus: targetStatus,
        suggestionRules,
        currentUser,
        extraUpdates
      });
      if (updatedLead?.draftCreated && showToast) {
        showToast(`Draft invoice generated for ${[updatedLead.first_name, updatedLead.last_name].filter(Boolean).join(' ') || 'Lead'}`);
      }
      
      // Mark corresponding pending reminders as completed
      const { error: cancelError } = await supabase
        .from('follow_up_reminders')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('lead_id', lead.id)
        .eq('status', 'pending');

      if (cancelError) {
        console.warn('Could not cancel pending reminders:', cancelError);
      }

      loadDashboardData();
      if (targetStatus === 'Closed Won' && lead.status !== 'Closed Won') {
        celebrateClosedWon();
      }
    } catch (err) {
      console.error('Error logging checkpoint outcome:', err);
      alert('Failed to update: ' + err.message);
    }
  };

  // Unified Handler: Log Meeting Outcome
  const handleLogMeetingOutcome = async (lead, targetStatus) => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const updatedLead = await updateLeadStatusAndCheckpoint({
        lead,
        newStatus: targetStatus,
        suggestionRules,
        currentUser,
        extraUpdates: {
          last_contacted_at: todayStr,
          meeting_ends_at: null
        }
      });
      if (updatedLead?.draftCreated && showToast) {
        showToast(`Draft invoice generated for ${[updatedLead.first_name, updatedLead.last_name].filter(Boolean).join(' ') || 'Lead'}`);
      }
      
      // Mark corresponding pending reminders as completed
      const { error: cancelError } = await supabase
        .from('follow_up_reminders')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('lead_id', lead.id)
        .eq('status', 'pending');

      if (cancelError) {
        console.warn('Could not cancel pending reminders:', cancelError);
      }

      loadDashboardData();
      if (targetStatus === 'Closed Won' && lead.status !== 'Closed Won') {
        celebrateClosedWon();
      }
    } catch (err) {
      console.error('Error logging meeting outcome:', err);
      alert('Failed to update: ' + err.message);
    }
  };

  // Unified Handler: Overdue Invoice Friendly Reminder Copy
  const handleCopyInvoiceReminder = (inv) => {
    const template = `Hi ${inv.client_name},\n\nHope you are doing well.\n\nThis is a friendly reminder that invoice #${inv.invoice_number} for $${inv.total} was due on ${new Date(inv.due_date).toLocaleDateString()}.\n\nPlease let me know when we can expect payment.\n\nBest regards,\n${currentUser.full_name || 'ReachDesk CRM User'}`;
    navigator.clipboard.writeText(template);
    alert(`Friendly reminder template copied for Invoice #${inv.invoice_number}!`);
  };

  if (!currentUser || loading) {
    return (
      <div className="loading-container">
        {!currentUser ? 'Loading profile...' : 'Loading analytics...'}
      </div>
    );
  }

  // Calculate Monthly Collected Revenue (this calendar month only, case-insensitive)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  // `invoices` here are rows from revenue_entries (the Revenue Tracker): amount, currency, paid_at, status.
  // Only money actually received ("paid"). Every currency is converted to the user's main currency at the latest rate.
  const mainCurrency = (currentUser?.default_currency || 'USD').toUpperCase();
  const isPaid = (e) => e.status?.toLowerCase() === 'paid' && e.paid_at;
  const entryCurrency = (e) => (e.currency || mainCurrency).toUpperCase();
  const fmtNum = (v) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v);
  // Converted amount of one entry, or null if we have no rate for its currency yet.
  const inMain = (e) => convertToBase(Number(e.amount) || 0, entryCurrency(e), mainCurrency, fxRates?.rates);
  const sumInMain = (list) => list.reduce((sum, e) => sum + (inMain(e) ?? 0), 0);

  const thisMonthPaidInvoices = invoices.filter(inv => {
    if (!isPaid(inv)) return false;
    const date = new Date(inv.paid_at);
    return date.getFullYear() === currentYear && date.getMonth() === currentMonth;
  });
  const totalRevenueCollected = sumInMain(thisMonthPaidInvoices);

  // Per-currency breakdown (original amounts) for the hover tooltip.
  const currencyBreakdown = thisMonthPaidInvoices.reduce((acc, e) => {
    const cur = entryCurrency(e);
    acc[cur] = (acc[cur] || 0) + (Number(e.amount) || 0);
    return acc;
  }, {});
  const hasForeign = Object.keys(currencyBreakdown).some((c) => c !== mainCurrency);
  const unconverted = Object.entries(currencyBreakdown).filter(([cur]) => cur !== mainCurrency && !fxRates?.rates?.[cur]);
  const revenueTooltip = hasForeign
    ? [
        ...Object.entries(currencyBreakdown).map(([cur, v]) => {
          const c = convertToBase(v, cur, mainCurrency, fxRates?.rates);
          return cur === mainCurrency ? `${fmtNum(v)} ${cur}` : `${fmtNum(v)} ${cur}${c != null ? ` → ${fmtNum(c)} ${mainCurrency}` : ' (rate not available)'}`;
        }),
        fxRates?.date ? `Rates as of ${fxRates.date}` : 'Latest exchange rates',
      ].join('\n')
    : undefined;
  const revenueNote = !hasForeign
    ? ''
    : unconverted.length
      ? `not counted: ${unconverted.map(([cur, v]) => `${fmtNum(v)} ${cur}`).join(', ')} (rate unavailable)`
      : 'converted at today\'s rate';
  const revenueTarget = Number(currentUser.monthly_revenue_target) || 0;
  const targetPct = revenueTarget > 0 ? Math.min(100, Math.round((totalRevenueCollected / revenueTarget) * 100)) : 0;

  // Calculate Pitching Velocity (exact count from RPC — not capped at max-rows)
  let velocityLevel = 'low';
  let velocityColor = 'var(--danger-color)';
  let velocityMsg = 'Pipeline is cooling down. Increase pitching velocity.';
  let dialPercentage = 20; // 0.2 of gauge

  if (weeklyPitchCount >= 8) {
    velocityLevel = 'high';
    velocityColor = 'var(--success-color)';
    velocityMsg = 'Excellent outreach drive. High pipeline growth!';
    dialPercentage = 100;
  } else if (weeklyPitchCount >= 3) {
    velocityLevel = 'medium';
    velocityColor = 'var(--warning-color)';
    velocityMsg = 'Healthy pitching volume. Keep the momentum going.';
    dialPercentage = 60;
  }

  const pathLength = 126; // arc circumference length
  const dashOffset = pathLength * (1 - dialPercentage / 100);

  // Dual pipelines (exact counts from RPC)
  const forwardStages = MESSAGE_PIPELINE_STAGES;
  const STAGE_COLORS = MESSAGE_STAGE_COLORS;
  const showCallsStrip = hasOutreachByPlan(currentUser);
  const callStageIds = CALL_PIPELINE_STAGES.map((s) => s.id);
  const callStageMeta = Object.fromEntries(CALL_PIPELINE_STAGES.map((s) => [s.id, s]));

  const revealBlock = blockClass;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-header-text">
          <h1>{headerFirstName ? `Welcome back, ${headerFirstName}` : 'Dashboard'}</h1>
          <p className="dashboard-subtitle">{weekActivity.followUpsDue} follow-ups due · {weeklyPitchCount} {weeklyPitchCount === 1 ? 'pitch' : 'pitches'} in the last 7 days</p>
        </div>
        <div className="dashboard-header-actions">
          {hasTeam && (
            <div className="rd-segmented">
              <button
                type="button"
                className={`rd-segmented__btn ${dashboardScope === 'mine' ? 'rd-segmented__btn--active' : ''}`}
                onClick={() => handleScopeChange('mine')}
              >
                Mine
              </button>
              <button
                type="button"
                className={`rd-segmented__btn ${dashboardScope === 'team' ? 'rd-segmented__btn--active' : ''}`}
                onClick={() => handleScopeChange('team')}
              >
                Team
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="dashboard-kpi-grid">
        <div className="dashboard-kpi-tile">
          <span className="dashboard-kpi-title">Leads</span>
          <span className="dashboard-kpi-value">{metrics.total >= 10000 ? (metrics.total/1000).toFixed(1) + 'k' : metrics.total}</span>
          <span className="dashboard-kpi-subtext">{metrics.contacted >= 10000 ? (metrics.contacted/1000).toFixed(1) + 'k' : metrics.contacted} contacted</span>
        </div>
        <div className="dashboard-kpi-tile">
          <span className="dashboard-kpi-title">Replied</span>
          <span className="dashboard-kpi-value">{metrics.replied >= 10000 ? (metrics.replied/1000).toFixed(1) + 'k' : metrics.replied}</span>
          <span className="dashboard-kpi-subtext">{(metrics.total > 0 ? ((metrics.replied / metrics.total) * 100) : 0).toFixed(1)}% reply rate</span>
        </div>
        <div className="dashboard-kpi-tile">
          <span className="dashboard-kpi-title">Positive</span>
          <span className="dashboard-kpi-value">{metrics.positive >= 10000 ? (metrics.positive/1000).toFixed(1) + 'k' : metrics.positive}</span>
          <span className="dashboard-kpi-subtext">{(metrics.replied > 0 ? ((metrics.positive / metrics.replied) * 100) : 0).toFixed(1)}% of replies</span>
        </div>
        <div className="dashboard-kpi-tile">
          <span className="dashboard-kpi-title">Closed won</span>
          <span className="dashboard-kpi-value" style={{ color: 'var(--success-color)' }}>{messageStageCounts['Closed Won'] || 0}</span>
          <span className="dashboard-kpi-subtext">{messageStageCounts['Booked'] || 0} booked</span>
        </div>
        <div className="dashboard-kpi-tile">
          <span className="dashboard-kpi-title">Collected</span>
          <span className="dashboard-kpi-value" title={revenueTooltip}>{hasForeign ? '≈ ' : ''}{new Intl.NumberFormat('en-US', { style: 'currency', currency: currentUser?.default_currency || 'USD', currencyDisplay: 'code', maximumFractionDigits: 0 }).format(totalRevenueCollected)}</span>
          <span className="dashboard-kpi-subtext">this month{revenueNote ? ` · ${revenueNote}` : ''}</span>
        </div>
      </div>

      <div className="dashboard-pipeline-card">
        <div className="dashboard-pipeline-header">
          <h3>Messages pipeline</h3>
          <button type="button" className="dashboard-link" onClick={() => navigate('/reports')}>Open in Reports</button>
        </div>
        <div className="dashboard-pipeline-bar">
          {(() => {
            const visibleStages = forwardStages
              .map(st => ({ st, count: messageStageCounts[st] || 0 }))
              .filter(item => item.count > 0);
            const total = visibleStages.reduce((sum, item) => sum + item.count, 0);

            return visibleStages.map(({ st, count }, idx) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const isFirst = idx === 0;
              const isLast = idx === visibleStages.length - 1;
              const segmentClass = `dashboard-pipeline-segment${isFirst ? ' is-first' : ''}${isLast ? ' is-last' : ''}`;

              return (
                <div 
                  key={st} 
                  className={segmentClass} 
                  style={{ flexGrow: count, backgroundColor: STAGE_COLORS[st] }}
                  aria-label={`${st}: ${count}`}
                >
                  <span className="pipeline-tip" role="tooltip">
                    <span className="pipeline-tip-dot" style={{ background: STAGE_COLORS[st] }} />
                    <span className="pipeline-tip-label">{st}</span>
                    <span className="pipeline-tip-count">{count}</span>
                    <span className="pipeline-tip-pct">· {pct}%</span>
                  </span>
                </div>
              );
            });
          })()}
        </div>
        <div className="dashboard-pipeline-legend">
          {forwardStages.map(st => {
            const count = messageStageCounts[st] || 0;
            return (
              <div key={st} className="dashboard-pipeline-legend-item">
                <span className="dashboard-pipeline-legend-dot" style={{ backgroundColor: STAGE_COLORS[st] }}></span>
                <span className="dashboard-pipeline-legend-label">{st}</span>
                <span className="dashboard-pipeline-legend-count">{count >= 10000 ? (count/1000).toFixed(1) + 'k' : count}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="dashboard-bottom-grid">
        <div className="dashboard-card dashboard-donext-card">
          <div className="dashboard-card-header">
            <h3>Do next</h3>
            <div className="dashboard-donext-filters">
              <span className="dashboard-donext-pill">Due · {upNextFeed.filter(i => i.type === 'checkpoint' && i.overdue).length}</span>
              <span className="dashboard-donext-pill">Upcoming · {upNextFeed.filter(i => i.type === 'checkpoint' && !i.overdue).length}</span>
              <span className="dashboard-donext-pill">Callbacks · {upNextFeed.filter(i => i.channel === 'call').length}</span>
            </div>
          </div>
          
          <div className="dashboard-donext-list">
            {upNextFeed.filter(i => i.type === 'checkpoint').length === 0 ? (
              <div className="dashboard-empty-state">
                <Check size={20} style={{ color: 'var(--success-color)', marginBottom: '0.5rem' }} />
                <div>No pending follow-ups!</div>
              </div>
            ) : (
              upNextFeed
                .filter(i => i.type === 'checkpoint')
                .slice(0, 6)
                .map(item => {
                  const lead = item.lead;
                  const channel = item.channel || 'message';
                  const initials = (lead.first_name?.[0] || '') + (lead.last_name?.[0] || '');
                  
                  // Follow-up logic
                  let followUpText = `${lead.folder_name || 'Unfiled'} · `;
                  if (channel === 'call') {
                    followUpText += `Attempt ${lead.attempt_count + 1}`;
                  } else {
                    if (!lead.last_contacted_at) {
                      followUpText += 'Not contacted yet';
                    } else {
                      const days = Math.floor((new Date() - new Date(lead.last_contacted_at)) / (1000 * 60 * 60 * 24));
                      followUpText += `Last contacted ${days}d ago`;
                    }
                  }

                  let timeLabel = item.overdue ? 'Overdue' : 'Today';
                  let timeColor = item.overdue ? 'var(--danger-color)' : 'var(--warning-color)';

                  return (
                    <div key={item.id} className="dashboard-donext-row" onClick={() => onSelectLead && onSelectLead(lead)}>
                      <div className="dashboard-donext-avatar">{initials || '-'}</div>
                      <div className="dashboard-donext-info">
                        <span className="dashboard-donext-name">{`${lead.first_name || ""} ${lead.last_name || ""}`.trim() || lead.email}</span>
                        <span className="dashboard-donext-meta">{followUpText}</span>
                      </div>
                      <div className="dashboard-donext-actions">
                        <span className={`dashboard-donext-type ${channel === 'call' ? 'call' : 'message'}`}>{channel === 'call' ? 'Call' : 'Message'}</span>
                        <span className="dashboard-donext-time" style={{ color: timeColor }}>{timeLabel}</span>
                        <ArrowRight size={16} className="dashboard-donext-arrow" />
                      </div>
                    </div>
                  );
                })
            )}
          </div>
          {upNextFeed.filter(i => i.type === 'checkpoint').length > 6 && (
            <button className="dashboard-link" onClick={() => navigate('/reminders')} style={{ marginTop: '1rem' }}>
              View all ({upNextFeed.filter(i => i.type === 'checkpoint').length})
            </button>
          )}
        </div>

        <div className="dashboard-right-col">
          <div className="dashboard-card dashboard-revenue-card">
            <div className="dashboard-card-header">
              <h3>Revenue</h3>
              {isTeamScope && currentUser?.team_role !== 'owner' && !teamSettings?.members_can_view_revenue && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem', fontWeight: 400 }}>
                  (Showing your revenue only)
                </span>
              )}
              <button className="dashboard-link" onClick={() => navigate('/settings')}>Set target</button>
            </div>
            <div className="dashboard-revenue-amount">
              <span className="dashboard-revenue-value" title={revenueTooltip}>{hasForeign ? '≈ ' : ''}{new Intl.NumberFormat('en-US', { style: 'currency', currency: currentUser?.default_currency || 'USD', currencyDisplay: 'code', maximumFractionDigits: 0 }).format(totalRevenueCollected)}</span>
              <span className="dashboard-revenue-subtext">collected this month{revenueNote ? ` · ${revenueNote}` : ''}</span>
            </div>
            <div className="dashboard-revenue-chart">
              {/* Mock 6-month chart layout with actual logic to render bars if we have monthly invoice data */}
              
            {invoices.length === 0 ? (
              <div className="dashboard-empty-state" style={{ height: '80px', margin: '0.5rem 0' }}>
                <span style={{ marginBottom: '0.5rem' }}>No revenue data yet.</span>
                <button className="dashboard-link" onClick={() => navigate('/revenue')}>Add revenue</button>
              </div>
            ) : (() => {
              const sixMonthTotals = [5, 4, 3, 2, 1, 0].map(offset => {
                const d = new Date();
                d.setMonth(d.getMonth() - offset);
                const mYear = d.getFullYear();
                const mMonth = d.getMonth();
                const mInvoices = invoices.filter(inv => {
                  if (!isPaid(inv)) return false;
                  const date = new Date(inv.paid_at);
                  return date.getFullYear() === mYear && date.getMonth() === mMonth;
                });
                return sumInMain(mInvoices);
              });
              const maxMonth = Math.max(...sixMonthTotals, 1);
              const chartDivisor = revenueTarget > 0 ? Math.max(maxMonth, revenueTarget) : maxMonth;

              return (
                <div className="dashboard-revenue-bars" style={{ position: 'relative' }}>
                  {revenueTarget > 0 && (
                    <div 
                      style={{
                        position: 'absolute',
                        bottom: `${(revenueTarget / chartDivisor) * 100}%`,
                        left: 0, right: 0,
                        borderTop: '1px dashed var(--text-muted, #8E8C86)',
                        zIndex: 1,
                        opacity: 0.5
                      }}
                      title={`Target: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: currentUser?.default_currency || 'USD', currencyDisplay: 'code', maximumFractionDigits: 0 }).format(revenueTarget)}`}
                    />
                  )}
                  {sixMonthTotals.map((mTotal, i) => {
                    const offset = 5 - i;
                    const d = new Date();
                    d.setMonth(d.getMonth() - offset);
                    const heightPct = (mTotal / chartDivisor) * 100;
                    const isCurrent = offset === 0;
                    return (
                      <div 
                        key={offset} 
                        className={`dashboard-bar ${isCurrent ? 'current' : ''}`} 
                        style={{ height: `${heightPct}%`, zIndex: 2, position: 'relative' }}
                        title={`${new Intl.NumberFormat('en-US', { style: 'currency', currency: currentUser?.default_currency || 'USD', currencyDisplay: 'code', maximumFractionDigits: 0 }).format(mTotal)} in ${d.toLocaleString('default', { month: 'short' })}`}
                      ></div>
                    );
                  })}
                </div>
              );
            })()}
              <span className="dashboard-revenue-chart-label">Last 6 months</span>
            </div>
          </div>

          <div className="dashboard-card dashboard-templates-card">
            <div className="dashboard-card-header">
              <h3>Top templates</h3>
              <span className="dashboard-link">Templates</span>
            </div>
            <div className="dashboard-templates-list">
              {copyAnalytics.slice(0, 3).map(tpl => {
                const notEnoughData = tpl.sent < 5;
                return (
                  <div key={tpl.id} className="dashboard-template-row">
                    <div className="dashboard-template-info">
                      <span className="dashboard-template-name">{tpl.title}</span>
                      <span className="dashboard-template-meta">Sent {tpl.sent} · Replies {tpl.count}</span>
                    </div>
                    <div className="dashboard-template-rate">
                      {notEnoughData ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Not enough data</span>
                      ) : (
                        <span>{Number(tpl.rate || 0).toFixed(1)}%</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {copyAnalytics.length === 0 && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No template data available yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
