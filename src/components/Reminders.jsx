import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getTeamIds } from '../lib/utils';
import { Bell, CheckCircle, Clock, Check, X } from 'lucide-react';
import { updateLeadStatusAndCheckpoint, REPLY_CHECK_STATUSES, FOLLOW_UP_CHECK_STATUSES } from '../lib/reminders';
import { celebrateClosedWon } from '../utils/celebrateWin';

export default function Reminders({ currentUser, onSelectLead }) {
  const navigate = useNavigate();
  const [reminders, setReminders] = useState([]);
  const [adminRequests, setAdminRequests] = useState([]);
  const [suggestionRules, setSuggestionRules] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReminders = async () => {
    setLoading(true);
    try {
      const { data: rules, error: rulesErr } = await supabase.from('action_suggestion_rules').select('*');
      if (!rulesErr && rules) {
        setSuggestionRules(rules);
      }

      const teamIds = await getTeamIds(currentUser.id);
      const { data, error } = await supabase
        .from('follow_up_reminders')
        .select('*, lead:leads(*)')
        .in('user_id', teamIds)
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true });

      if (error) {
        console.error('Error querying follow_up_reminders:', error);
      } else {
        setReminders(data || []);
      }

      const isAdmin = currentUser.role === 'admin';
      if (isAdmin) {
        const { data: reqs, error: reqsErr } = await supabase
          .from('admin_notifications')
          .select('*')
          .eq('type', 'upgrade_request')
          .eq('request_status', 'pending')
          .order('created_at', { ascending: false });

        if (!reqsErr) setAdminRequests(reqs || []);
      }
    } catch (err) {
      console.error('Error fetching reminders page data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchReminders();
    }
  }, [currentUser]);

  const handleReminderOutcome = async (reminderId, leadObj, newStatus, extra = {}) => {
    try {
      await updateLeadStatusAndCheckpoint({
        lead: leadObj,
        newStatus,
        suggestionRules,
        currentUser,
        extraUpdates: extra
      });

      const { error } = await supabase
        .from('follow_up_reminders')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', reminderId);

      if (error) throw error;
      setReminders(prev => prev.filter(r => r.id !== reminderId));

      if (newStatus === 'Closed Won' && leadObj.status !== 'Closed Won') {
        celebrateClosedWon();
      }
    } catch (err) {
      console.error('Error completing reminder outcome:', err);
    }
  };

  const handleReminderDismiss = async (reminderId) => {
    try {
      const { error } = await supabase
        .from('follow_up_reminders')
        .update({ status: 'dismissed', updated_at: new Date().toISOString() })
        .eq('id', reminderId);

      if (error) throw error;
      setReminders(prev => prev.filter(r => r.id !== reminderId));
    } catch (err) {
      console.error('Error dismissing reminder:', err);
    }
  };

  if (!currentUser) {
    return <div className="loading-container">Loading profile...</div>;
  }

  if (loading) {
    return <div className="loading-container">Loading reminders...</div>;
  }

  return (
    <div className="flex-col gap-4 page-stack" style={{ textAlign: 'left' }}>
      <div className="mb-4">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontFamily: 'var(--font-heading)', margin: 0 }}>
          <Bell size={22} style={{ color: 'var(--status-cold)' }} /> Follow-up Reminders
        </h2>
        <p className="color-muted" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)', lineHeight: 'var(--leading-body)' }}>
          Automated outreach follow-up schedule (+12h, +24h, +72h, +5d, +7d, +14d, +21d).
        </p>
      </div>

      {reminders.length === 0 && adminRequests.length === 0 ? (
        <div className="card rd-empty-state">
          <div className="rd-empty-state-icon">
            <CheckCircle size={32} />
          </div>
          <h3>You&apos;re all caught up!</h3>
          <p>No pending follow-ups or upgrade requests right now.</p>
        </div>
      ) : (
        <div className="grid-3">
          {adminRequests.map(req => (
            <div key={req.id} className="card flex-col gap-3" style={{ border: '1px solid rgba(139, 92, 246, 0.4)', background: 'rgba(139, 92, 246, 0.03)', justifyContent: 'space-between' }}>
              <div>
                <div className="flex justify-between align-start">
                  <h4 style={{ fontWeight: 600, fontSize: '1rem', margin: 0 }}>
                    Upgrade Request
                  </h4>
                  <span className="badge badge-pending">
                    Pending
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                  User: {req.from_email}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Requested Plan: {req.requested_plan?.toUpperCase()}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Amount: Rs {req.paid_amount || 0} ({req.billing_cycle})
                </div>
              </div>
              <div className="flex gap-2" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                <button 
                  onClick={() => navigate('/admin')}
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Review in Admin Panel
                </button>
              </div>
            </div>
          ))}

          {reminders.map(rem => {
            const isDue = new Date(rem.scheduled_at) <= new Date();
            const diffMs = Date.now() - new Date(rem.scheduled_at).getTime();
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

            if (!rem.lead) {
              return (
                <div key={rem.id} className="card flex-col" style={{ padding: '1rem', gap: '0.5rem', border: '1px solid var(--border-color)', justifyContent: 'space-between' }}>
                  <div className="flex-col" style={{ gap: '0.35rem' }}>
                    <h4 style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0, color: 'var(--text-muted)' }}>
                      Deleted Lead (ID: {rem.lead_id})
                    </h4>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      This lead no longer exists.
                    </p>
                  </div>
                  <div className="flex gap-2" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', marginTop: '0.4rem' }}>
                    <button
                      onClick={() => handleReminderDismiss(rem.id)}
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1, justifyContent: 'center', fontSize: '0.72rem', height: '26px', minHeight: 'auto', padding: '3px 6px' }}
                    >
                      Dismiss Reminder
                    </button>
                  </div>
                </div>
              );
            }

            const leadStatus = rem.lead.status || 'Lead';
            const isReplyCheck = REPLY_CHECK_STATUSES.includes(leadStatus);
            const isFollowUpCheck = FOLLOW_UP_CHECK_STATUSES.includes(leadStatus);
            const firstName = rem.lead.name?.split(' ')[0] || 'they';

            return (
              <div key={rem.id} className="card flex-col" style={{ padding: '1rem', gap: '0.5rem', border: '1px solid var(--border-color)', justifyContent: 'space-between', background: isDue ? 'rgba(239, 68, 68, 0.02)' : 'var(--bg-card)' }}>
                <div className="flex-col" style={{ gap: '0.35rem' }}>
                  <div className="flex justify-between align-start">
                    <h4 style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0 }}>
                      {rem.lead_name || 'Lead'}
                    </h4>
                    <span className={`badge ${isDue ? 'badge-pending' : 'badge-starter'}`} style={isDue ? { backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)', fontSize: '0.7rem', fontWeight: 600 } : { fontSize: '0.7rem' }}>
                      {isDue ? `Overdue (${diffHours}h)` : 'Scheduled'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Clock size={13} /> Reminder #{rem.reminder_number}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Scheduled: {new Date(rem.scheduled_at).toLocaleString()}
                  </div>
                </div>

                <div className="flex gap-2" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', marginTop: '0.4rem' }}>
                  {isReplyCheck ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%' }}>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Did {firstName} reply?
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', width: '100%' }}>
                        <button
                          onClick={() => handleReminderOutcome(rem.id, rem.lead, 'Positive Reply', { reply_type: 'positive' })}
                          className="btn btn-secondary btn-sm"
                          style={{ borderColor: 'var(--success-color)', color: 'var(--success-color)', fontSize: '0.7rem', padding: '3px 4px', fontWeight: 600, minHeight: 'auto', height: '24px' }}
                        >
                          Positive reply
                        </button>
                        <button
                          onClick={() => handleReminderOutcome(rem.id, rem.lead, 'Booked', { reply_type: 'positive' })}
                          className="btn btn-secondary btn-sm"
                          style={{ borderColor: '#8b5cf6', color: '#8b5cf6', fontSize: '0.7rem', padding: '3px 4px', fontWeight: 600, minHeight: 'auto', height: '24px' }}
                        >
                          Call booked
                        </button>
                        <button
                          onClick={() => handleReminderOutcome(rem.id, rem.lead, 'No Show / Rescheduled')}
                          className="btn btn-secondary btn-sm"
                          style={{ borderColor: 'var(--warning-color)', color: 'var(--warning-color)', fontSize: '0.7rem', padding: '3px 4px', fontWeight: 600, minHeight: 'auto', height: '24px' }}
                        >
                          No show
                        </button>
                        <button
                          onClick={() => handleReminderOutcome(rem.id, rem.lead, 'Not Interested', { reply_type: 'negative' })}
                          className="btn btn-secondary btn-sm"
                          style={{ borderColor: 'var(--danger-color)', color: 'var(--danger-color)', fontSize: '0.7rem', padding: '3px 4px', fontWeight: 600, minHeight: 'auto', height: '24px' }}
                        >
                          Negative reply
                        </button>
                      </div>
                      <button
                        onClick={() => handleReminderDismiss(rem.id)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.7rem', padding: '3px 4px', border: 'none', color: 'var(--text-muted)', marginTop: '0.15rem', minHeight: 'auto', height: '20px' }}
                      >
                        Dismiss Reminder
                      </button>
                    </div>
                  ) : isFollowUpCheck ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%' }}>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {rem.lead.status === 'Calendly Sent' ? 'Did they book a call yet?' : `Did you follow up with ${firstName}?`}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReminderOutcome(rem.id, rem.lead, 'Waiting')}
                          className="btn btn-primary btn-sm"
                          style={{ flex: 1, justifyContent: 'center', fontSize: '0.72rem', height: '26px', minHeight: 'auto', padding: '3px 6px' }}
                        >
                          <Check size={12} /> Mark as done
                        </button>
                        <button
                          onClick={() => handleReminderDismiss(rem.id)}
                          className="btn btn-secondary btn-sm"
                          style={{ flex: 1, justifyContent: 'center', fontSize: '0.72rem', height: '26px', minHeight: 'auto', padding: '3px 6px' }}
                        >
                          <X size={12} /> Dismiss
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%' }}>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Lead status changed to "{leadStatus}".
                      </div>
                      <button
                        onClick={() => handleReminderDismiss(rem.id)}
                        className="btn btn-secondary btn-sm"
                        style={{ width: '100%', justifyContent: 'center', fontSize: '0.72rem', height: '26px', minHeight: 'auto', padding: '3px 6px' }}
                      >
                        Archive Reminder
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
