import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Mail, UserMinus, Lock, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  canPurchaseExtraSeats,
  ensureProTeamWorkspace,
  getSeatsRemaining,
  getSeatsUsed,
  getTeamSeatLimit,
  getTeamSettings,
  hasTeamsPageAccess,
  isProTeamOwner,
  isTeamOwner,
  isTeamsFeatureLocked,
  updateTeamSettings,
  defaultTeamSettings,
} from '../lib/teamWorkspace';
import { getExtraSeats, TEAMS_INCLUDED_SEATS, EXTRA_SEAT_USD_MONTHLY } from '../lib/planConfig';
import ExtraSeatsPurchaseModal from './billing/ExtraSeatsPurchaseModal';
import SegmentedControl from './ui/SegmentedControl';
import ToggleSwitch from './ui/ToggleSwitch';
import {
  fetchTeamCallPermissions,
  updateTeamCallSettings,
  upsertMemberCallPermission,
} from '../lib/callActivity';
import {
  fetchTeamCalendarPermissions,
  updateTeamCalendarSettings,
  upsertMemberCalendarPermission,
} from '../lib/calendarActivity';

export default function Teams({ currentUser, onRefreshProfile }) {
  const navigate = useNavigate();
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamInvitations, setTeamInvitations] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [teamSuccess, setTeamSuccess] = useState('');
  const [settings, setSettings] = useState(() => defaultTeamSettings());
  const [callSettings, setCallSettings] = useState({
    call_activity_sharing: 'all_members',
    call_notes_visible_to_team: true,
    memberPermissions: {},
  });
  const [calendarSettings, setCalendarSettings] = useState({
    calendar_activity_sharing: 'all_members',
    memberPermissions: {},
  });
  const [activeSection, setActiveSection] = useState('people');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [callSettingsSaving, setCallSettingsSaving] = useState(false);
  const [extraSeatsModalOpen, setExtraSeatsModalOpen] = useState(false);

  const locked = isTeamsFeatureLocked(currentUser);
  const canManage = isProTeamOwner(currentUser);
  const isOwner = isTeamOwner(currentUser);
  const seatLimit = getTeamSeatLimit(currentUser);
  const seatsUsed = getSeatsUsed(teamMembers.length, teamInvitations.length);
  const seatsRemaining = getSeatsRemaining(currentUser, teamMembers.length, teamInvitations.length);
  const seatsAtCap = seatsUsed >= seatLimit;
  const extraSeats = getExtraSeats(currentUser);
  const canManageExtraSeats = canPurchaseExtraSeats(currentUser);
  const canBuyExtraSeat = canManageExtraSeats && seatsAtCap;

  const loadTeam = async () => {
    if (!hasTeamsPageAccess(currentUser)) {
      setTeamLoading(false);
      return;
    }

    setTeamLoading(true);
    setTeamError('');
    try {
      let teamId = currentUser.team_id;
      if (!teamId && canManage) {
        teamId = await ensureProTeamWorkspace(currentUser.id);
        if (onRefreshProfile) await onRefreshProfile();
      }

      if (!teamId) {
        setTeamMembers([]);
        setTeamInvitations([]);
        setSettings(defaultTeamSettings());
        setCallSettings({
          call_activity_sharing: 'all_members',
          call_notes_visible_to_team: true,
          memberPermissions: {},
        });
        setCalendarSettings({
          calendar_activity_sharing: 'all_members',
          memberPermissions: {},
        });
        return;
      }

      const [{ data: members, error: mErr }, { data: invites, error: iErr }, teamSettings, callPerms, calPerms] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('id, email, full_name, team_role, plan')
          .eq('team_id', teamId)
          .order('team_role', { ascending: true }),
        supabase
          .from('team_invitations')
          .select('*')
          .eq('team_id', teamId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        getTeamSettings(teamId),
        fetchTeamCallPermissions(teamId),
        fetchTeamCalendarPermissions(teamId),
      ]);

      if (mErr) throw mErr;
      if (iErr) throw iErr;

      setTeamMembers(members || []);
      setTeamInvitations(invites || []);
      setSettings(teamSettings);
      setCallSettings(callPerms);
      setCalendarSettings(calPerms);
    } catch (err) {
      console.error('Error loading team details:', err);
      setTeamError(err.message || 'Failed to load team workspace.');
    } finally {
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) loadTeam();
  }, [currentUser?.id, currentUser?.team_id, currentUser?.plan, currentUser?.team_role, currentUser?.extra_seats]);

  useEffect(() => {
    if (!currentUser?.team_id) return undefined;
    const channel = supabase
      .channel(`team-settings-${currentUser.team_id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'teams', filter: `id=eq.${currentUser.team_id}` },
        () => { loadTeam(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.team_id]);

  const handleSendInvite = async (e) => {
    e.preventDefault();
    if (!canManage || (seatsAtCap && !canBuyExtraSeat)) return;
    setTeamError('');
    setTeamSuccess('');

    if (!inviteEmail.trim()) return;

    if (seatsUsed >= seatLimit) {
      if (canBuyExtraSeat) {
        setTeamError(`All ${seatLimit} seats are in use. Add a paid seat to invite another teammate.`);
      } else {
        setTeamError(`All ${seatLimit} seats are in use. Remove a member or cancel a pending invite to add someone else.`);
      }
      return;
    }

    setInviteSending(true);
    try {
      if (!currentUser.team_id) {
        await ensureProTeamWorkspace(currentUser.id);
        if (onRefreshProfile) await onRefreshProfile();
      }

      const { data, error } = await supabase.functions.invoke('send-team-invite', {
        body: { invitedEmail: inviteEmail.trim().toLowerCase() },
      });

      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || 'Failed to send invite');

      const sentTo = inviteEmail.trim();
      setInviteEmail('');
      setTeamSuccess(
        data?.emailSent
          ? `Invite email sent to ${sentTo}. They must sign up with that address.`
          : `Invite created for ${sentTo}.${data?.warning ? ` ${data.warning}` : ''}`
      );
      await loadTeam();
    } catch (err) {
      console.error('Error sending invite:', err);
      setTeamError(err.message || 'Failed to send invite.');
    } finally {
      setInviteSending(false);
    }
  };

  const handleCancelInvite = async (inviteId) => {
    if (!canManage) return;
    setTeamError('');
    try {
      const { error } = await supabase
        .from('team_invitations')
        .update({ status: 'cancelled' })
        .eq('id', inviteId);
      if (error) throw error;
      setTeamSuccess('Invite cancelled.');
      await loadTeam();
    } catch (err) {
      console.error('Error cancelling invite:', err);
      setTeamError('Failed to cancel invite.');
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!canManage) return;
    if (!confirm('Remove this member from your workspace? They will lose access to shared leads and templates.')) return;
    setTeamError('');
    try {
      const { data, error } = await supabase.functions.invoke('remove-team-member', {
        body: { memberId },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || 'Failed to remove member');
      setTeamMembers((prev) => prev.filter((m) => m.id !== memberId));
      setTeamSuccess('Team member removed.');
      await loadTeam();
    } catch (err) {
      console.error('Error removing team member:', err);
      setTeamError(err.message || 'Failed to remove team member.');
    }
  };

  const handleLeadVisibilityChange = async (ownLeadsOnly) => {
    if (!canManage || !currentUser?.team_id) return;
    if (!!settings.members_see_own_leads_only === ownLeadsOnly) return;
    const next = { ...settings, members_see_own_leads_only: ownLeadsOnly };
    setSettings(next);
    setSettingsSaving(true);
    setTeamError('');
    try {
      const saved = await updateTeamSettings(currentUser.team_id, next);
      setSettings({
        members_can_view_revenue: !!saved.members_can_view_revenue,
        members_can_view_invoices: !!saved.members_can_view_invoices,
        members_see_own_leads_only: !!saved.members_see_own_leads_only,
      });
      setTeamSuccess('Permissions updated.');
      if (onRefreshProfile) await onRefreshProfile();
    } catch (err) {
      console.error('Error updating team settings:', err);
      setSettings((prev) => ({ ...prev, members_see_own_leads_only: !ownLeadsOnly }));
      setTeamError(err.message || 'Failed to update permissions.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleToggleSetting = async (key) => {
    if (!canManage || !currentUser?.team_id) return;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    setSettingsSaving(true);
    setTeamError('');
    try {
      const saved = await updateTeamSettings(currentUser.team_id, next);
      setSettings({
        members_can_view_revenue: !!saved.members_can_view_revenue,
        members_can_view_invoices: !!saved.members_can_view_invoices,
        members_see_own_leads_only: !!saved.members_see_own_leads_only,
      });
      setTeamSuccess('Permissions updated.');
      if (onRefreshProfile) await onRefreshProfile();
    } catch (err) {
      console.error('Error updating team settings:', err);
      setSettings((prev) => ({ ...prev, [key]: !next[key] }));
      setTeamError(err.message || 'Failed to update permissions.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleCallSharingChange = async (value) => {
    if (!canManage || !currentUser?.team_id) return;
    const prevSharing = callSettings.call_activity_sharing;
    const next = { ...callSettings, call_activity_sharing: value };
    setCallSettings(next);
    setCallSettingsSaving(true);
    setTeamError('');
    try {
      await updateTeamCallSettings(currentUser.team_id, next);
      if (value !== 'selected_members') {
        await supabase
          .from('team_member_permissions')
          .update({ can_view_team_call_activity: false, can_view_call_notes: false })
          .eq('team_id', currentUser.team_id);
        await loadTeam();
      }
      setTeamSuccess('Call activity permissions updated.');
    } catch (err) {
      console.error('Error updating call sharing:', err);
      setCallSettings((prev) => ({ ...prev, call_activity_sharing: prevSharing }));
      setTeamError(err.message || 'Failed to update call activity settings.');
    } finally {
      setCallSettingsSaving(false);
    }
  };

  const handleCallNotesToggle = async () => {
    if (!canManage || !currentUser?.team_id) return;
    const next = {
      ...callSettings,
      call_notes_visible_to_team: !callSettings.call_notes_visible_to_team,
    };
    setCallSettings(next);
    setCallSettingsSaving(true);
    setTeamError('');
    try {
      await updateTeamCallSettings(currentUser.team_id, next);
      setTeamSuccess('Call activity permissions updated.');
    } catch (err) {
      console.error('Error updating call notes setting:', err);
      setCallSettings((prev) => ({
        ...prev,
        call_notes_visible_to_team: callSettings.call_notes_visible_to_team,
      }));
      setTeamError(err.message || 'Failed to update call activity settings.');
    } finally {
      setCallSettingsSaving(false);
    }
  };

  const handleMemberCallPermission = async (userId, key, value) => {
    if (!canManage || !currentUser?.team_id) return;
    if (callSettings.call_activity_sharing !== 'selected_members' && key === 'can_view_team_call_activity') return;
    const existing = callSettings.memberPermissions[userId] || {
      can_view_team_call_activity: false,
      can_view_call_notes: false,
    };
    const nextPerm = { ...existing, [key]: value };
    setCallSettings((prev) => ({
      ...prev,
      memberPermissions: { ...prev.memberPermissions, [userId]: nextPerm },
    }));
    setCallSettingsSaving(true);
    setTeamError('');
    try {
      await upsertMemberCallPermission(currentUser.team_id, userId, nextPerm);
      setTeamSuccess('Member call permissions updated.');
    } catch (err) {
      console.error('Error updating member call permission:', err);
      setTeamError(err.message || 'Failed to update member permissions.');
      await loadTeam();
    } finally {
      setCallSettingsSaving(false);
    }
  };

  const handleCalendarSharingChange = async (value) => {
    if (!canManage || !currentUser?.team_id) return;
    const prevSharing = calendarSettings.calendar_activity_sharing;
    const next = { ...calendarSettings, calendar_activity_sharing: value };
    setCalendarSettings(next);
    setCallSettingsSaving(true);
    setTeamError('');
    try {
      await updateTeamCalendarSettings(currentUser.team_id, next);
      if (value !== 'selected_members') {
        await supabase
          .from('team_member_permissions')
          .update({ can_view_team_calendar_activity: false })
          .eq('team_id', currentUser.team_id);
        await loadTeam();
      }
      setTeamSuccess('Calendar activity permissions updated.');
    } catch (err) {
      console.error('Error updating calendar sharing:', err);
      setCalendarSettings((prev) => ({ ...prev, calendar_activity_sharing: prevSharing }));
      setTeamError(err.message || 'Failed to update calendar activity settings.');
    } finally {
      setCallSettingsSaving(false);
    }
  };

  const handleMemberCalendarPermission = async (userId, value) => {
    if (!canManage || !currentUser?.team_id) return;
    if (calendarSettings.calendar_activity_sharing !== 'selected_members') return;
    const nextPerm = { can_view_team_calendar_activity: value };
    setCalendarSettings((prev) => ({
      ...prev,
      memberPermissions: { ...prev.memberPermissions, [userId]: nextPerm },
    }));
    setCallSettingsSaving(true);
    setTeamError('');
    try {
      await upsertMemberCalendarPermission(currentUser.team_id, userId, nextPerm);
      setTeamSuccess('Member calendar permissions updated.');
    } catch (err) {
      console.error('Error updating member calendar permission:', err);
      setTeamError(err.message || 'Failed to update member permissions.');
      await loadTeam();
    } finally {
      setCallSettingsSaving(false);
    }
  };

  if (locked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '360px', gap: '1rem', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
        <Lock size={36} style={{ color: 'var(--text-muted)' }} />
        <h3 style={{ color: 'var(--text-primary)', margin: 0 }}>Teams is available on the Teams plan</h3>
        <p style={{ maxWidth: '420px', margin: 0 }}>
          Invite up to 5 teammates to a shared CRM workspace — leads, templates, and follow-ups in one place.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/upgrade')}>
          Upgrade to Teams
        </button>
      </div>
    );
  }

  const sectionTabs = [
    { id: 'people', label: 'People' },
    { id: 'data', label: 'Data access' },
    { id: 'activity', label: 'Activity sharing' },
  ];

  return (
    <div className="flex-col gap-4 page-stack">
      <div>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Manage your workspace members, invites, and sharing permissions.
        </p>
      </div>

      {teamError && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(224, 82, 82, 0.1)', border: '1px solid rgba(224, 82, 82, 0.2)', color: 'var(--status-hot)', fontSize: '0.875rem' }}>
          {teamError}
        </div>
      )}
      {teamSuccess && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#10b981', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Check size={15} style={{ flexShrink: 0 }} />
          <span>{teamSuccess}</span>
        </div>
      )}

      <div
        role="tablist"
        aria-label="Teams sections"
        style={{
          display: 'inline-flex',
          padding: 3,
          borderRadius: 8,
          border: '1px solid var(--border-color)',
          background: 'var(--bg-tertiary)',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        {sectionTabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeSection === id}
            onClick={() => setActiveSection(id)}
            style={{
              padding: '0.45rem 0.85rem',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
              background: activeSection === id ? 'var(--bg-card)' : 'transparent',
              color: activeSection === id ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeSection === 'people' && (
        <>
      {/* Members */}
      <div className="card rd-page-form flex-col gap-3">
        <div className="rd-page-form-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={18} style={{ color: 'var(--primary-magenta)' }} />
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>People</h3>
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {seatsUsed} of {seatLimit} seats
            {extraSeats > 0 && (
              <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                {' '}({TEAMS_INCLUDED_SEATS} included + {extraSeats} extra)
              </span>
            )}
          </span>
          {canManageExtraSeats && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setExtraSeatsModalOpen(true)}
            >
              Add more members
            </button>
          )}
        </div>

        {teamLoading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading team directory...</div>
        ) : (
          <div className="flex-col gap-2">
            {teamMembers.length === 0 && (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                No workspace yet. Send an invite to create one.
              </p>
            )}
            {teamMembers.map((member) => {
              const role = (member.team_role || 'member').toLowerCase();
              return (
                <div
                  key={member.id}
                  className="flex justify-between align-center"
                  style={{ padding: '0.65rem 0.75rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>{member.full_name || member.email}</span>
                    {member.full_name && (
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{member.email}</span>
                    )}
                    <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      {role === 'owner' && (
                        <span className="badge badge-approved" style={{ fontSize: '0.7rem' }}>Owner</span>
                      )}
                      {role === 'member' && (
                        <span className="badge badge-starter" style={{ fontSize: '0.7rem' }}>Member</span>
                      )}
                      {member.id === currentUser.id && (
                        <span className="badge badge-pending" style={{ fontSize: '0.7rem' }}>You</span>
                      )}
                    </div>
                  </div>
                  {canManage && member.id !== currentUser.id && role !== 'owner' && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.id)}
                      className="btn btn-danger btn-sm"
                      style={{ padding: '0.2rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      <UserMinus size={12} /> Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending invites — owner only controls; members still see list if any */}
      {(canManage || teamInvitations.length > 0) && (
        <div className="card rd-page-form flex-col gap-3" style={{ marginTop: '0.75rem' }}>
          <div className="rd-page-form-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Mail size={18} style={{ color: 'var(--accent-blue)' }} />
            <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Pending invites</h3>
          </div>

          {teamLoading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading invites...</div>
          ) : teamInvitations.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>No pending invites.</p>
          ) : (
            <div className="flex-col gap-2">
              {teamInvitations.map((invite) => (
                <div
                  key={invite.id}
                  className="flex justify-between align-center"
                  style={{ padding: '0.65rem 0.75rem', background: 'var(--bg-tertiary)', border: '1px dashed var(--border-color)', borderRadius: '6px' }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>{invite.invited_email}</span>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Sent {invite.created_at ? new Date(invite.created_at).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleCancelInvite(invite.id)}
                      className="btn btn-secondary btn-sm"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Invite form — owner only */}
      {canManage && (
        <div className="card rd-page-form flex-col gap-3" style={{ marginTop: '0.75rem' }}>
          <div className="rd-page-form-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Mail size={18} style={{ color: 'var(--primary-magenta)' }} />
            <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Invite teammate</h3>
          </div>

          {seatsAtCap && canBuyExtraSeat ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                All {seatLimit} seats are in use. Add more members to invite another teammate.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setExtraSeatsModalOpen(true)}
                style={{ alignSelf: 'flex-start' }}
              >
                Add more members — ${EXTRA_SEAT_USD_MONTHLY}/mo each
              </button>
            </div>
          ) : seatsAtCap ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
              All seats are in use. Remove a member or cancel a pending invite to add someone else.
            </p>
          ) : null}

          <form onSubmit={handleSendInvite} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
              <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                <Mail size={16} />
              </span>
              <input
                type="email"
                required
                placeholder="colleague@email.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="form-input w-full"
                style={{ paddingLeft: '2.5rem' }}
                disabled={(seatsAtCap && !canBuyExtraSeat) || inviteSending}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={(seatsAtCap && !canBuyExtraSeat) || inviteSending}>
              {inviteSending ? 'Sending…' : 'Send invite'}
            </button>
          </form>
        </div>
      )}
        </>
      )}

      {activeSection === 'data' && (
        <div className="card rd-page-form flex-col gap-3">
          <div className="rd-page-form-header">
            <h3>Data access</h3>
            <p className="rd-modal-sub">Lead visibility, revenue/invoice sharing, and what members can see in the CRM.</p>
          </div>

          {!currentUser?.team_id ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
              Send an invite to create your workspace before changing permissions.
            </p>
          ) : canManage ? (
            <div className="flex-col gap-3">
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Lead visibility</div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: settingsSaving ? 'wait' : 'pointer' }}>
                <input
                  type="radio"
                  name="lead_visibility"
                  checked={!settings.members_see_own_leads_only}
                  onChange={() => handleLeadVisibilityChange(false)}
                  disabled={settingsSaving}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Shared pipeline</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Everyone on the team sees all leads.</div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: settingsSaving ? 'wait' : 'pointer' }}>
                <input
                  type="radio"
                  name="lead_visibility"
                  checked={!!settings.members_see_own_leads_only}
                  onChange={() => handleLeadVisibilityChange(true)}
                  disabled={settingsSaving}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Hybrid — own leads + shared lists</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Members see their own leads plus lists explicitly shared with them.</div>
                </div>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  padding: '0.75rem',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  cursor: settingsSaving ? 'wait' : 'pointer',
                  marginTop: '0.5rem',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Members can view Revenue Tracker</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    When on, teammates can see revenue entries across the workspace.
                  </div>
                </div>
                <ToggleSwitch
                  checked={!!settings.members_can_view_revenue}
                  onChange={() => handleToggleSetting('members_can_view_revenue')}
                  disabled={settingsSaving}
                  ariaLabel="Members can view Revenue Tracker"
                />
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  padding: '0.75rem',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  cursor: settingsSaving ? 'wait' : 'pointer',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Members can view Invoices</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    When on, teammates can see invoices across the workspace. When off, each person only sees invoices they created.
                  </div>
                </div>
                <ToggleSwitch
                  checked={!!settings.members_can_view_invoices}
                  onChange={() => handleToggleSetting('members_can_view_invoices')}
                  disabled={settingsSaving}
                  ariaLabel="Members can view Invoices"
                />
              </label>
            </div>
          ) : (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <strong>Your access:</strong>{' '}
              {settings.members_see_own_leads_only
                ? 'You see your own leads plus lists shared with you.'
                : 'You see the full team pipeline.'}
              {' '}
              Revenue tracker is {settings.members_can_view_revenue ? 'shared with the team' : 'private to each person'}.
              {' '}
              Invoices are {settings.members_can_view_invoices ? 'shared with the team' : 'private to each creator'}.
            </div>
          )}
        </div>
      )}

      {activeSection === 'activity' && (
        <div className="card rd-page-form flex-col gap-3">
          <div className="rd-page-form-header">
            <h3>Activity sharing</h3>
            <p className="rd-modal-sub">Call activity and calendar timeline visibility for teammates.</p>
          </div>

          {!currentUser?.team_id ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
              Send an invite to create your workspace before changing permissions.
            </p>
          ) : canManage ? (
            <div className="flex-col gap-3">
              <div
                style={{
                  padding: '0.75rem',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Call activity sharing</div>
                  <ToggleSwitch
                    checked={callSettings.call_activity_sharing !== 'off'}
                    onChange={(checked) => handleCallSharingChange(checked ? 'all_members' : 'off')}
                    disabled={callSettingsSaving}
                  />
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Control who can see team-wide call logs. Owners always see full activity and notes.
                </div>
                {callSettings.call_activity_sharing !== 'off' && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <SegmentedControl
                      ariaLabel="Call activity sharing"
                      value={callSettings.call_activity_sharing}
                      onChange={handleCallSharingChange}
                      options={[
                        { value: 'all_members', label: 'All members' },
                        { value: 'selected_members', label: 'Selected members' },
                      ]}
                    />
                  </div>
                )}

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid var(--border-color)',
                    cursor: callSettingsSaving ? 'wait' : 'pointer',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Show call notes to viewers</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      When off, teammates see outcome and timing only unless they logged the call or have note permission.
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={!!callSettings.call_notes_visible_to_team}
                    onChange={handleCallNotesToggle}
                    disabled={callSettingsSaving || callSettings.call_activity_sharing === 'off'}
                    ariaLabel="Show call notes to viewers"
                  />
                </label>

                {callSettings.call_activity_sharing === 'selected_members' && (
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem' }}>Per-member access</div>
                    {teamMembers.filter((m) => (m.team_role || '').toLowerCase() !== 'owner').length === 0 ? (
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>No members yet.</p>
                    ) : (
                      <div className="flex-col gap-2">
                        {teamMembers
                          .filter((m) => (m.team_role || '').toLowerCase() !== 'owner')
                          .map((member) => {
                            const perm = callSettings.memberPermissions[member.id] || {
                              can_view_team_call_activity: false,
                              can_view_call_notes: false,
                            };
                            const label = member.full_name || member.email;
                            return (
                              <div
                                key={member.id}
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '0.75rem',
                                  padding: '0.5rem 0',
                                  borderBottom: '1px solid var(--border-color)',
                                  fontSize: '0.85rem',
                                }}
                              >
                                <span style={{ fontWeight: 500 }}>{label}</span>
                                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <ToggleSwitch
                                      checked={!!perm.can_view_team_call_activity}
                                      disabled={callSettingsSaving}
                                      onChange={(checked) => handleMemberCallPermission(
                                        member.id,
                                        'can_view_team_call_activity',
                                        checked,
                                      )}
                                    />
                                    <span>View activity</span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <ToggleSwitch
                                      checked={!!perm.can_view_call_notes}
                                      disabled={callSettingsSaving || !perm.can_view_team_call_activity}
                                      onChange={(checked) => handleMemberCallPermission(
                                        member.id,
                                        'can_view_call_notes',
                                        checked,
                                      )}
                                    />
                                    <span>View notes</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div
                style={{
                  padding: '0.75rem',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Calendar activity sharing</div>
                  <ToggleSwitch
                    checked={calendarSettings.calendar_activity_sharing !== 'off'}
                    onChange={(checked) => handleCalendarSharingChange(checked ? 'all_members' : 'off')}
                    disabled={callSettingsSaving}
                  />
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Control who can browse teammates&apos; calendar timeline and planned outreach.
                </div>
                {calendarSettings.calendar_activity_sharing !== 'off' && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <SegmentedControl
                      ariaLabel="Calendar activity sharing"
                      value={calendarSettings.calendar_activity_sharing}
                      onChange={handleCalendarSharingChange}
                      options={[
                        { value: 'all_members', label: 'All members' },
                        { value: 'selected_members', label: 'Selected members' },
                      ]}
                    />
                  </div>
                )}

                {calendarSettings.calendar_activity_sharing === 'selected_members' && (
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem' }}>Calendar access by member</div>
                    {teamMembers.filter((m) => (m.team_role || '').toLowerCase() !== 'owner').length === 0 ? (
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>No members yet.</p>
                    ) : (
                      <div className="flex-col gap-2">
                        {teamMembers
                          .filter((m) => (m.team_role || '').toLowerCase() !== 'owner')
                          .map((member) => {
                            const perm = calendarSettings.memberPermissions[member.id] || {
                              can_view_team_calendar_activity: false,
                            };
                            const label = member.full_name || member.email;
                            return (
                              <div
                                key={member.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '0.75rem',
                                  padding: '0.5rem 0',
                                  borderBottom: '1px solid var(--border-color)',
                                  fontSize: '0.85rem',
                                }}
                              >
                                <span style={{ fontWeight: 500 }}>{label}</span>
                                <ToggleSwitch
                                  checked={!!perm.can_view_team_calendar_activity}
                                  disabled={callSettingsSaving}
                                  onChange={(checked) => handleMemberCalendarPermission(member.id, checked)}
                                />
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Call activity: {callSettings.call_activity_sharing === 'off' ? 'private to each person' : 'shared with the team'}.
              Calendar activity: {calendarSettings.calendar_activity_sharing === 'off' ? 'private to each person' : 'shared with the team'}.
            </div>
          )}
        </div>
      )}

      {!isOwner && activeSection === 'people' && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
          You’re a member of this workspace. Only the owner can invite people, change permissions, or remove members.
        </p>
      )}

      <ExtraSeatsPurchaseModal
        open={extraSeatsModalOpen}
        onClose={() => setExtraSeatsModalOpen(false)}
        profile={currentUser}
        onSuccess={async (data) => {
          setTeamSuccess(`Your workspace now supports ${data?.seatLimit ?? seatLimit} seats.`);
          if (onRefreshProfile) await onRefreshProfile();
          await loadTeam();
        }}
      />
    </div>
  );
}
