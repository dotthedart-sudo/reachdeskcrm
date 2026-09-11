import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../../App';
import { Phone, Plus, Lock, PhoneCall } from 'lucide-react';
import {
  buildOutreachSessionQueue,
  sortByCallability,
} from '../../../lib/outreachQueue';
import { getEffectiveUserTimeZone } from '../../../lib/dateTime';
import {
  deleteCallAttempt,
  fetchMyCallAttempts,
  fetchTeamCallActivity,
  fetchTeamCallPermissions,
  fetchTeamCallStats,
  fetchTeamMembersForCalls,
  getEffectiveOutreachAccess,
  hasTeamCallActivity,
} from '../../../lib/callActivity';
import { isTeamOwner } from '../../../lib/teamWorkspace';
import CallingSession from './CallingSession';
import LogCallModal from './LogCallModal';
import MyCallFeed from './MyCallFeed';
import TeamCallFeed from './TeamCallFeed';
import TeamCallStats from './TeamCallStats';

export default function CallActivityHub({
  currentUser,
  leads = [],
  onOpenLead,
  embedded = false,
  leadIdSet = null,
  hideSessionControls = false,
  onGoToQueue = null,
  onLeadUpdated = null,
}) {
  const navigate = useNavigate();
  const { teamIds = [] } = useAppContext() || {};
  const [unlocked, setUnlocked] = useState(null);
  const [tab, setTab] = useState('my');
  const [attempts, setAttempts] = useState([]);
  const [teamRows, setTeamRows] = useState([]);
  const [teamStats, setTeamStats] = useState([]);
  const [members, setMembers] = useState([]);
  const [teamPerms, setTeamPerms] = useState(null);
  const [loadingMy, setLoadingMy] = useState(true);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [memberFilter, setMemberFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [prioritizeCallable, setPrioritizeCallable] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [error, setError] = useState('');

  const teamId = currentUser?.team_id || null;
  const userTimeZone = useMemo(() => getEffectiveUserTimeZone(currentUser), [currentUser?.timezone]);
  const showTeamTab = hasTeamCallActivity(currentUser, teamIds)
    && (teamPerms?.call_activity_sharing || 'off') !== 'off';
  const defaultCountryCode = currentUser?.default_country_code || '+92';
  const showNoteSharing = !!teamId;

  useEffect(() => {
    let cancelled = false;
    getEffectiveOutreachAccess(currentUser).then((ok) => {
      if (!cancelled) setUnlocked(ok);
    });
    return () => { cancelled = true; };
  }, [currentUser]);

  const canViewTeamFeed = useMemo(() => {
    if (!teamId || !teamPerms) return isTeamOwner(currentUser);
    if (isTeamOwner(currentUser)) return true;
    if (teamPerms.call_activity_sharing === 'off') return false;
    if (teamPerms.call_activity_sharing === 'all_members') return true;
    return !!teamPerms.memberPermissions[currentUser?.id]?.can_view_team_call_activity;
  }, [teamId, teamPerms, currentUser]);

  const scopedLeads = useMemo(() => {
    if (!leadIdSet || leadIdSet.size === 0) return leads;
    return leads.filter((l) => leadIdSet.has(l.id));
  }, [leads, leadIdSet]);

  const filterAttempts = useCallback((rows) => {
    if (!leadIdSet || leadIdSet.size === 0) return rows;
    return rows.filter((a) => leadIdSet.has(a.lead_id));
  }, [leadIdSet]);

  const loadMy = useCallback(async () => {
    if (!currentUser?.id || unlocked === false) {
      setLoadingMy(false);
      return;
    }
    setLoadingMy(true);
    setError('');
    try {
      const data = await fetchMyCallAttempts(currentUser.id);
      setAttempts(filterAttempts(data));
    } catch (err) {
      setError(err.message || 'Failed to load call activity.');
    } finally {
      setLoadingMy(false);
    }
  }, [currentUser?.id, unlocked, filterAttempts]);

  const loadTeam = useCallback(async () => {
    if (!teamId || !canViewTeamFeed) {
      setTeamRows([]);
      setTeamStats([]);
      return;
    }
    setLoadingTeam(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [rows, stats] = await Promise.all([
        fetchTeamCallActivity({
          memberId: memberFilter || null,
          outcome: outcomeFilter || null,
          limit: 200,
        }),
        fetchTeamCallStats({ fromDate: today.toISOString() }),
      ]);
      setTeamRows(filterAttempts(rows));
      setTeamStats(stats);
    } catch (err) {
      console.error('[CallActivityHub] team load failed:', err);
    } finally {
      setLoadingTeam(false);
    }
  }, [teamId, canViewTeamFeed, memberFilter, outcomeFilter, filterAttempts]);

  useEffect(() => {
    if (unlocked) loadMy();
  }, [loadMy, unlocked]);

  useEffect(() => {
    if (!teamId) return;
    fetchTeamMembersForCalls(teamId).then(setMembers).catch(() => setMembers([]));
    fetchTeamCallPermissions(teamId).then(setTeamPerms).catch(() => setTeamPerms(null));
  }, [teamId]);

  useEffect(() => {
    if (tab === 'team' && unlocked) loadTeam();
  }, [tab, loadTeam, unlocked]);

  const attemptsByLead = useMemo(() => {
    const map = new Map();
    for (const a of filterAttempts(attempts)) {
      if (!map.has(a.lead_id)) map.set(a.lead_id, a);
    }
    return map;
  }, [attempts, filterAttempts]);

  const sessionQueue = useMemo(() => {
    const flatAttempts = [...attemptsByLead.values()];
    let q = buildOutreachSessionQueue(scopedLeads, flatAttempts, userTimeZone);
    if (prioritizeCallable) {
      q = sortByCallability(q, new Date(), defaultCountryCode);
    }
    return q;
  }, [scopedLeads, attemptsByLead, prioritizeCallable, defaultCountryCode, userTimeZone]);

  const handleLogged = (payload) => {
    const attempt = payload?.attempt || payload;
    if (attempt?.id) setAttempts((prev) => [attempt, ...prev]);
    setLogOpen(false);
    if (payload?.leadUpdates) onLeadUpdated?.(payload.leadUpdates);
  };

  const handleAttemptUpdated = (updated) => {
    setAttempts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    if (tab === 'team') loadTeam();
  };

  const handleAttemptDeleted = async (id) => {
    if (id === 'refresh') {
      await loadMy();
      if (tab === 'team') loadTeam();
      return;
    }
    await deleteCallAttempt(id);
    setAttempts((prev) => prev.filter((a) => a.id !== id));
    if (tab === 'team') loadTeam();
  };

  if (unlocked === null) {
    return <div style={{ color: 'var(--text-muted)', padding: '1.5rem 0' }}>Loading…</div>;
  }

  if (!unlocked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 280, gap: '1rem', textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
        <Lock size={32} />
        <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Call Activity is unavailable</h3>
        <p style={{ margin: 0, maxWidth: 420, fontSize: '0.9rem' }}>
          Log call outcomes, track follow-ups, and run calling sessions on Starter, Pro, and Teams. Team members inherit access from an active Teams workspace.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/upgrade')}>
          Upgrade
        </button>
      </div>
    );
  }

  if (sessionOpen) {
    return (
      <CallingSession
        queue={sessionQueue}
        userId={currentUser.id}
        teamId={teamId}
        profile={currentUser}
        onClose={() => setSessionOpen(false)}
        onOpenLead={onOpenLead}
        defaultCountryCode={defaultCountryCode}
        showNoteSharing={showNoteSharing}
        onLogged={handleLogged}
        timeZone={userTimeZone}
      />
    );
  }

  return (
    <div className="flex-col gap-4 page-stack">
      {!embedded && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Phone size={16} style={{ color: 'var(--primary-magenta)' }} /> Call Activity
          </h3>
          <p style={{ margin: 'var(--space-1) 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {showTeamTab
              ? 'Team Activity shows calls across your workspace when sharing is enabled. My Activity is your personal log.'
              : 'Log calls on any lead in your workspace and track follow-ups.'}
          </p>
        </div>
        {!hideSessionControls && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setSessionOpen(true)}
            disabled={sessionQueue.length === 0}
            title={sessionQueue.length === 0 ? 'No leads in calling queue — log calls or add leads in CRM' : `${sessionQueue.length} in queue`}
          >
            <PhoneCall size={14} /> Start Calling Session
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setLogOpen(true)}>
            <Plus size={14} /> Log Call
          </button>
        </div>
        )}
      </div>
      )}

      {embedded && !hideSessionControls && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setLogOpen(true)}>
            <Plus size={14} /> Log Call
          </button>
        </div>
      )}

      {showTeamTab && (
        <div className="flex gap-2" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: 1 }}>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'team' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
            onClick={() => setTab('team')}
          >
            Team Activity
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'my' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
            onClick={() => setTab('my')}
          >
            My Activity
          </button>
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={prioritizeCallable}
          onChange={(e) => setPrioritizeCallable(e.target.checked)}
        />
        Prioritize callable leads in calling session (9am–6pm lead local time)
      </label>

      {error && <div style={{ color: 'var(--danger-color)', fontSize: '0.85rem' }}>{error}</div>}

      {tab === 'team' && showTeamTab ? (
        <>
          <TeamCallStats stats={teamStats} loading={loadingTeam} />
          <TeamCallFeed
            rows={teamRows}
            members={members}
            loading={loadingTeam}
            memberFilter={memberFilter}
            onMemberFilterChange={setMemberFilter}
            outcomeFilter={outcomeFilter}
            onOutcomeFilterChange={setOutcomeFilter}
            onOpenLead={onOpenLead}
            canViewTeam={canViewTeamFeed}
          />
        </>
      ) : (
        <MyCallFeed
          leads={scopedLeads}
          attempts={attempts}
          loading={loadingMy}
          defaultCountryCode={defaultCountryCode}
          onGoToQueue={onGoToQueue}
          onOpenLead={onOpenLead}
          onLogCall={() => setLogOpen(true)}
          onAttemptUpdated={handleAttemptUpdated}
          onAttemptDeleted={handleAttemptDeleted}
          currentUserId={currentUser.id}
          userTimeZone={userTimeZone}
        />
      )}

      <LogCallModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        leads={scopedLeads}
        userId={currentUser.id}
        teamId={teamId}
        profile={currentUser}
        showNoteSharing={showNoteSharing}
        onLogged={handleLogged}
        timeZone={userTimeZone}
      />
    </div>
  );
}
