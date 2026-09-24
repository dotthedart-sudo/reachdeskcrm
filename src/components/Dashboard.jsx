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
  const { showToast, teamProfilesMap = {}, teamIds = [] } = useAppContext() || {};
  const [metrics, setMetrics] = useState({ total: 0, contacted: 0, replied: 0, positive: 0 });
  const [copyAnalytics, setCopyAnalytics] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);

  // New States
  const [invoices, setInvoices] = useState([]);
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

  const loadDashboardData = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const teamIds = await getTeamIds(currentUser.id);
      if (!teamIds || teamIds.length === 0 || teamIds.includes(undefined) || teamIds.includes(null)) {
        setLoading(false);
        return;
      }

      const activeScopeIds = (dashboardScope === 'team' && isOwner && hasTeam) ? teamIds : [currentUser.id];
      const remindersEnabled = currentUser?.reminders_enabled !== false;
      const feedColumns = 'id, user_id, first_name, last_name, status, call_status, created_at, last_contacted_at, last_called_at, action_to_take, next_checkpoint_at, template_used, reply_type, meeting_ends_at';

      const settled = await Promise.allSettled([
        supabase.from('invoices').select('*').in('user_id', activeScopeIds),
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
      const attemptsData = attemptsSettled.status === 'fulfilled' ? attemptsSettled.value : [];
      const feedLeads = feedSettled.status === 'fulfilled' ? feedSettled.value : [];

      const loadedInvoices = invoicesRes.data || [];
      const loadedRules = rulesRes.data || [];
      const loadedLeads = feedLeads || [];
      const loadedAttempts = attemptsData || [];

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
        const { data: templatesData } = await supabase
          .from('templates')
          .select('id, name')
          .or(`user_id.eq.${currentUser.id},user_id.is.null`);

        const counts = pipelineStats.positive_by_template || {};
        const sentCounts = pipelineStats.sent_by_template || {}; // we don't have this in pipelineStats from SQL yet, wait, we need reply-rate view (name, sent, replies, rate %)
        const sortedAnalytics = [];
        for (const [templateName, count] of Object.entries(counts)) {
          const matchedTemplate = (templatesData || []).find((t) => t.name === templateName);
          if (matchedTemplate) {
            sortedAnalytics.push({
              id: matchedTemplate.id,
              title: matchedTemplate.name,
              count: Number(count) || 0,
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

      if (isOwner && hasTeam) {
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
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadDashboardData();
    }
  }, [currentUser, windowDays, teamProfilesMap, dashboardScope]); // added dashboardScope

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
  const thisMonthPaidInvoices = invoices.filter(inv => {
    if (inv.status?.toLowerCase() !== 'paid') return false;
    const date = new Date(inv.issue_date || inv.created_at);
    return date.getFullYear() === currentYear && date.getMonth() === currentMonth;
  });
  const totalRevenueCollected = thisMonthPaidInvoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
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
      <div className={`rd-dashboard-page flex-col page-stack${rootClass}`} style={{ textAlign: 'left', gap: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <p className="color-muted page-intro" style={{ margin: 0 }}>Outreach engine tracking, conversions, and follow-ups status.</p>
          {hasTeam && (
            <div className="rd-segmented" style={{ flexShrink: 0 }}>
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

      {metrics.total === 0 && !loading ? (
        <div className={`card empty-state${revealBlock}`}>
          <div className="empty-state-icon" style={{ width: 56, height: 56, color: 'var(--text-primary)', background: 'var(--bg-hover)', borderColor: 'var(--border)' }}>
            <BarChart2 size={28} />
          </div>
          <h3 className="empty-state-title">Your Dashboard is Quiet</h3>
          <p className="empty-state-desc">
            Once you add leads and log interactions, your conversion metrics, pitching velocity, and pipeline progression will light up here.
          </p>
          <button onClick={() => navigate('/leads')} className="btn btn-primary">
            Go to CRM Leads →
          </button>
        </div>
      ) : (
        <>
          <div className="dashboard-main-layout">
            <div className="dashboard-col-left">
              {/* Primary KPIs Row — uses dash-kpi-grid so the mobile @media override
                  (max-width 768px → 1-column stack) applies correctly */}
      <div className={`dash-kpi-grid${revealBlock}`} style={{ marginBottom: 0 }}>
        
        {/* Leads card */}
        <div className="card flex align-start gap-3" style={{ minHeight: 140 }}>
          <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-hover)', color: 'var(--text-primary)', display: 'flex', alignSelf: 'center' }}>
            <Users size={24} />
          </div>
          <div style={{ width: '100%', minWidth: 0 }}>
            <span className="card-title">
              {dashboardScope === 'team' ? 'Team Overview' : 'Leads Overview'}
            </span>
            <div className="card-value" style={{ margin: 'var(--space-1) 0' }}>{metrics.total}</div>
            
            {/* Contacted / Replied / Positive mini-stats
                flex-wrap + min-width ensures the 3rd item never clips
                regardless of sidebar state or card width */}
            <div style={{
              display: 'flex',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-2)',
              borderTop: '1px solid var(--border)',
              paddingTop: 'var(--space-2)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              flexWrap: 'wrap'
            }}>
              <div style={{ minWidth: '70px' }}>Contacted: <strong style={{ color: 'var(--text-primary)' }}>{metrics.contacted}</strong></div>
              <div style={{ minWidth: '60px' }}>Replied: <strong style={{ color: 'var(--text-primary)' }}>{metrics.replied}</strong></div>
              <div style={{ minWidth: '65px' }}>Positive: <strong style={{ color: 'var(--success-color)' }}>{metrics.positive}</strong></div>
            </div>
          </div>
        </div>

        {/* Revenue progress card */}
        <div className="card flex-col justify-between" style={{ minHeight: 140 }}>
          <div className="flex align-center justify-between" style={{ width: '100%' }}>
            <span className="card-title">Invoices Collected</span>
            {(() => {
              const userCurrency = CURRENCY_SYMBOLS[currentUser?.default_currency] || '$';
              return (
                <span style={{ color: 'var(--success-color)', fontSize: '1.1rem', fontWeight: 500, lineHeight: 1 }}>
                  {userCurrency}
                </span>
              );
            })()}
          </div>

          {(() => {
            const userCurrency = CURRENCY_SYMBOLS[currentUser?.default_currency] || '$';
            return (
              <>
                {revenueTarget > 0 ? (
                  <div style={{ marginTop: 'var(--space-2)', width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span className="card-value" style={{ fontSize: 'var(--text-xl)' }} data-ph-mask>{userCurrency}{totalRevenueCollected}</span>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }} data-ph-mask>target: {userCurrency}{revenueTarget}</span>
                    </div>
                    <div style={{ width: '100%', height: 8, background: 'var(--border-strong)', borderRadius: 'var(--radius-sm)', marginTop: 'var(--space-2)', overflow: 'hidden' }}>
                      <div style={{ width: `${targetPct}%`, height: '100%', background: 'var(--success-color)', borderRadius: 'var(--radius-sm)', transition: 'width 0.4s ease' }} />
                    </div>
                    <span className="card-subtext">
                      {targetPct}% of your monthly target
                    </span>
                  </div>
                ) : (
                  <div style={{ marginTop: 'var(--space-2)', width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Set your monthly target to see progress here
                    </span>
                    <button 
                      onClick={() => navigate('/settings')} 
                      className="btn btn-secondary btn-sm" 
                      style={{ marginTop: 'var(--space-2)', width: '100%', justifyContent: 'center' }}
                    >
                      Set Monthly Target
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Velocity Dial card */}
        <div className="card flex justify-between align-center" style={{ minHeight: 140 }}>
          <div>
            <span className="card-title">Outreach Velocity</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
              <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)', fontWeight: 600, letterSpacing: 0, color: velocityColor, textTransform: 'capitalize' }}>
                {velocityLevel}
              </span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>({weeklyPitchCount} pitches)</span>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-2)', maxWidth: 150, lineHeight: 'var(--leading-tight)', wordBreak: 'break-word' }}>
              {velocityMsg}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="80" height="45" viewBox="0 0 100 55" style={{ display: 'block', margin: '0 auto' }}>
              {/* Back track */}
              <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="var(--border-strong)" strokeWidth="10" strokeLinecap="round" />
              {/* Filled progress */}
              <path 
                d="M 10 50 A 40 40 0 0 1 90 50" 
                fill="none" 
                stroke={velocityColor} 
                strokeWidth="10" 
                strokeLinecap="round" 
                strokeDasharray={pathLength} 
                strokeDashoffset={dashOffset} 
                style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
              />
            </svg>
            <span className="rd-section-label" style={{ marginTop: 'var(--space-1)' }}>Last 7 days</span>
          </div>
        </div>

      </div>

      {/* This week — clear activity (not pipeline confusion) */}
      <div className={`card${revealBlock}`}>
        <h3 style={{ fontSize: '0.9rem', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--text-secondary)' }}>
          <Activity size={16} /> This week
          <HelpPopover title="This week">
            How much outreach you logged in the last 7 days — not the same as pipeline stage. Messaged = leads with a contact stamp; Called = leads with a call log; Due = message follow-up checkpoints that are overdue.
          </HelpPopover>
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/leads?mode=messages')}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            <Mail size={14} /> Messaged <strong>{weekActivity.messaged}</strong>
          </button>
          {showCallsStrip && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigate('/leads?mode=calls&callView=queue')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Phone size={14} /> Called <strong>{weekActivity.called}</strong>
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/reminders')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Bell size={14} /> Follow-ups due <strong>{weekActivity.followUpsDue}</strong>
          </button>
        </div>
      </div>

      {/* Dual pipelines */}
      <div
        className={revealBlock}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        <div className="card" style={{ minWidth: 0, flexGrow: 1 }}>
          <h3 style={{ fontSize: '0.9rem', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
            <Mail size={16} /> Messages pipeline
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.85rem' }}>
            Where deals sit after email / LinkedIn — by message status.
          </p>
          <PipelineStepper
            stages={forwardStages}
            counts={messageStageCounts}
            getColor={(st) => STAGE_COLORS[st]}
          />
        </div>

        {showCallsStrip && (metrics.call_activity?.total_attempts > 0) && (
          <div className="card" style={{ minWidth: 0, flexGrow: 1 }}>
            <h3 style={{ fontSize: '0.9rem', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
              <Phone size={16} /> Calls pipeline
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.85rem' }}>
              Where dials sit in the Call Queue — by call status.
            </p>
            <PipelineStepper
              stages={callStageIds}
              counts={callStageCounts}
              getColor={(id) => callStageMeta[id]?.color}
              getLabel={(id) => callStageMeta[id]?.label || id}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ marginTop: '0.75rem' }}
              onClick={() => navigate('/leads?mode=calls&callView=queue')}
            >
              Open Call Queue →
            </button>
          </div>
        )}
      </div>

      </div>

      <div className="dashboard-col-right">
        
                {/* Column 1: Upcoming Next Feed */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0, flexGrow: 1 }}>
          <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
            <Activity size={18} style={{ color: 'var(--text-secondary)' }} /> Upcoming Next
            <button type="button" onClick={() => navigate('/reminders')} className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto', fontSize: '0.75rem' }}>View Reminders →</button>
            <HelpPopover title="Upcoming Next Feed">
              Shows follow-up checkpoints for the current scope.
            </HelpPopover>
          </h3>

          {isOwner && !hasTeam && (
            <div style={{ padding: '1rem', border: '1px dashed var(--border)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              No teammates invited yet.{' '}
              <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: 'inherit' }} onClick={() => navigate('/teams')}>
                Invite from Teams →
              </button>
            </div>
          )}

          {!getLimit(limits, 'upNextFeed') ? (
            <div style={{ padding: '1rem', border: '1px dashed var(--border)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              <Lock size={14} style={{ display: 'inline', marginBottom: '-2px' }} /> Plan limit reached.
            </div>
          ) : upNextFeed.filter(i => i.type === 'checkpoint').length === 0 ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <Check size={20} style={{ color: 'var(--success-color)', marginBottom: '0.5rem' }} />
              <div>No pending follow-ups!</div>
            </div>
          ) : (
            <div className="flex-col gap-3">
              {upNextFeed
                .filter((item) => item.type === 'checkpoint')
                .slice((upcomingNextPage - 1) * 4, upcomingNextPage * 4)
                .map((item) => {
                  const channel = item.channel || 'message';
                  const isReplied = ['Positive Reply', 'Not Interested', 'Booked', 'Rescheduled'].includes(item.lead.status);
                  const isTryAgain = ['No answer', 'Busy', 'Voicemail left'].includes(item.lead.status);
                  let statusColor = '#d6d3d1'; // grey
                  if (isTryAgain) statusColor = '#f59e0b'; // amber
                  if (isReplied) statusColor = '#10b981'; // green

                  return (
                    <div 
                      key={item.id} 
                      className="flex-col gap-2" 
                      style={{ 
                        padding: '0.85rem 1rem', 
                        borderRadius: '8px', 
                        background: 'var(--bg-card)', 
                        border: '1px solid var(--border)',
                        borderLeft: `3px solid ${statusColor}`
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 500,
                            letterSpacing: 0,
                            textTransform: 'none',
                            padding: '2px 7px',
                            borderRadius: 'var(--radius-sm)',
                            background: channel === 'call' ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
                            color: channel === 'call' ? '#10b981' : '#3b82f6',
                          }}
                        >
                          {channel === 'call' ? 'Call' : 'Message'}
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.68rem', height: 22, padding: '0 8px' }}
                          onClick={() => navigate(channel === 'call' ? '/leads?mode=calls&callView=queue' : '/leads?mode=messages')}
                        >
                          Open →
                        </button>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: '1.4' }}>
                        Follow up with <span data-ph-mask>{item.lead.first_name || ''} {item.lead.last_name || ''}</span>
                      </div>
                    </div>
                  );
                })}

              {upNextFeed.filter(i => i.type === 'checkpoint').length > 4 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem' }}>
                  <button
                    type="button"
                    disabled={upcomingNextPage === 1}
                    onClick={() => setUpcomingNextPage(p => Math.max(1, p - 1))}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                  >
                    Prev
                  </button>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Page {upcomingNextPage} of {Math.ceil(upNextFeed.filter(i => i.type === 'checkpoint').length / 4)}
                  </span>
                  <button
                    type="button"
                    disabled={upcomingNextPage >= Math.ceil(upNextFeed.filter(i => i.type === 'checkpoint').length / 4)}
                    onClick={() => setUpcomingNextPage(p => p + 1)}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Column 2: Template Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0, flexGrow: 1 }}>

          {/* Copy Performance Analytics */}
          <div className="card" style={{ flexGrow: 1 }}>
            <h3 style={{ fontSize: '0.95rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Trophy size={18} style={{ color: '#f59e0b' }} /> Template Stats
            </h3>

            {!getLimit(limits, 'copyAnalytics') ? (
              <div style={{ position: 'relative', minHeight: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <div style={{ filter: 'blur(3px)', width: '100%', opacity: 0.25, pointerEvents: 'none' }}>
                  <table style={{ width: '100%', fontSize: '0.75rem' }}>
                    <tbody>
                      <tr><td>Cold Pitch Template</td><td>3 replies</td></tr>
                      <tr><td>Follow-up sequence</td><td>1 reply</td></tr>
                    </tbody>
                  </table>
                </div>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                  <Lock size={14} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Analytics Locked</span>
                  <button onClick={() => navigate('/settings')} className="btn btn-secondary btn-sm" style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem', marginTop: '0.2rem' }}>
                    Upgrade
                  </button>
                </div>
              </div>
            ) : copyAnalytics.length === 0 ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                No outreach metrics recorded.
              </div>
            ) : (
              <div className="flex-col gap-2">
                {copyAnalytics.slice((templateStatsPage - 1) * 2, templateStatsPage * 2).map((item, idx) => (
                  <div key={item.id} className="flex-col gap-2" style={{ padding: '0.85rem 1rem', borderRadius: '8px', background: 'var(--bg-card-hover)', border: '1px solid var(--border)' }}>
                    <div className="flex justify-between align-center">
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        {(templateStatsPage === 1 && idx === 0) && <Trophy size={13} style={{ color: '#E8A838', marginRight: '0.25rem', display: 'inline-block', verticalAlign: 'text-bottom' }} />}
                        {item.title}
                      </div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--success-color)' }}>
                        {item.rate.toFixed(1)}% <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>reply rate</span>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <div>Sent: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item.sent}</span></div>
                      <div>Replies: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item.positive}</span></div>
                    </div>
                    
                    <div style={{ width: '100%', height: 6, background: 'var(--border-strong)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginTop: '4px' }}>
                      <div style={{ width: `${Math.min(100, item.rate)}%`, height: '100%', background: 'var(--success-color)', borderRadius: 'var(--radius-sm)', transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                ))}

                {copyAnalytics.length > 2 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem' }}>
                    <button
                      type="button"
                      disabled={templateStatsPage === 1}
                      onClick={() => setTemplateStatsPage(p => Math.max(1, p - 1))}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                    >
                      Prev
                    </button>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Page {templateStatsPage} of {Math.ceil(copyAnalytics.length / 2)}
                    </span>
                    <button
                      type="button"
                      disabled={templateStatsPage >= Math.ceil(copyAnalytics.length / 2)}
                      onClick={() => setTemplateStatsPage(p => p + 1)}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
