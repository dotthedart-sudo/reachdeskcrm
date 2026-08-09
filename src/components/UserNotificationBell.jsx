import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, Clock, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  fetchDueCheckpointLeads,
  leadDisplayName,
  formatOverdueLabel,
} from '../lib/checkpointNotifications';

/**
 * Top-right notification bell.
 * Follow-ups come from leads.next_checkpoint_at (not follow_up_reminders).
 * Push is server-side only (digest/instant cron) — this component is in-app only.
 */
export default function UserNotificationBell({ profile, onRefreshProfile }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [dueCheckpoints, setDueCheckpoints] = useState([]);
  const [adminNotifs, setAdminNotifs] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const isAdmin = profile?.role === 'admin';
  const remindersEnabled = profile?.reminders_enabled !== false;

  const openLead = (leadId) => {
    setIsOpen(false);
    navigate(`/leads?lead=${leadId}`);
  };

  const fetchNotifications = async () => {
    if (!profile?.id) return;
    try {
      const { data, error } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('user_id', profile.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false });

      if (!error) setNotifications(data || []);
    } catch (err) {
      console.error('Error fetching user notifications:', err);
    }
  };

  const fetchDueCheckpoints = async () => {
    if (!profile?.id || !remindersEnabled) {
      setDueCheckpoints([]);
      return;
    }
    try {
      const rows = await fetchDueCheckpointLeads({ userIds: [profile.id], limit: 30 });
      setDueCheckpoints(rows);
    } catch (err) {
      console.error('Error fetching due checkpoints:', err);
    }
  };

  const fetchAdminNotifs = async () => {
    if (!isAdmin) return;
    try {
      const { data, error } = await supabase
        .from('admin_notifications')
        .select('*')
        .eq('is_read', false)
        .order('created_at', { ascending: false });
      if (!error) setAdminNotifs(data || []);
    } catch (err) {
      console.error('Error fetching admin notifications:', err);
    }
  };

  const handleAcknowledgeAdmin = async (id, e) => {
    e?.stopPropagation();
    try {
      await supabase.from('admin_notifications').update({ is_read: true }).eq('id', id);
      setAdminNotifs((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Error acknowledging admin notif:', err);
    }
  };

  useEffect(() => {
    if (!profile?.id) return;

    fetchNotifications();
    fetchDueCheckpoints();
    if (isAdmin) fetchAdminNotifs();

    const interval = setInterval(() => {
      fetchDueCheckpoints();
      fetchNotifications();
      if (isAdmin) fetchAdminNotifs();
    }, 5 * 60 * 1000);

    const channel = supabase
      .channel(`user-notifications-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          if (payload.new && !payload.new.is_read) {
            setNotifications((prev) => [payload.new, ...prev]);
            if (onRefreshProfile) onRefreshProfile();
            if ('Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification(payload.new.title || 'ReachDesk CRM', {
                  body: payload.new.message || 'You have a new notification',
                  icon: '/android-chrome-192x192.png',
                  tag: `user-notif-${payload.new.id}`,
                });
              } catch (notifErr) {
                console.warn('[Bell] Browser Notification (user_notifications) failed:', notifErr);
              }
            }
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          filter: `user_id=eq.${profile.id}`,
        },
        () => {
          fetchDueCheckpoints();
        },
      );

    if (isAdmin) {
      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_notifications' },
        (payload) => {
          if (payload.new && !payload.new.is_read) {
            setAdminNotifs((prev) => [payload.new, ...prev]);
            if ('Notification' in window && Notification.permission === 'granted') {
              try {
                const fromEmail = payload.new.from_email || 'Someone';
                const notifTitle =
                  payload.new.type === 'new_signup'
                    ? 'ReachDesk CRM — New Signup'
                    : 'ReachDesk CRM — Upgrade Request';
                const notifBody =
                  payload.new.type === 'new_signup'
                    ? `${fromEmail} just signed up`
                    : payload.new.message || `${fromEmail} requested an upgrade`;
                new Notification(notifTitle, {
                  body: notifBody,
                  icon: '/android-chrome-192x192.png',
                  tag: `admin-notif-${payload.new.id}`,
                });
              } catch (notifErr) {
                console.warn('[Bell] Admin browser Notification failed:', notifErr);
              }
            }
          }
        },
      );
    }

    channel.subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [profile?.id, remindersEnabled, isAdmin]);

  // Digest push deep-link: open bell when landing with ?dueFollowups=1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('dueFollowups') === '1' && profile?.id) {
      setIsOpen(true);
      fetchDueCheckpoints();
    }
  }, [profile?.id, window.location.search]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkRead = async (id, e) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true })
        .eq('id', id);
      if (error) throw error;
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (onRefreshProfile) onRefreshProfile();
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true })
        .eq('user_id', profile.id)
        .eq('is_read', false);
      if (error) throw error;
      setNotifications([]);
      if (onRefreshProfile) onRefreshProfile();
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  if (!profile) return null;

  const totalCount =
    dueCheckpoints.length + notifications.length + (isAdmin ? adminNotifs.length : 0);

  return (
    <div ref={dropdownRef} className="app-header-bell">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`app-header-icon-btn${isOpen ? ' app-header-icon-btn--active' : ''}`}
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <Bell size={18} />
        {totalCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-2px',
              right: '-2px',
              background: 'var(--danger-color, #ef4444)',
              color: '#fff',
              borderRadius: '50%',
              width: '18px',
              height: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.7rem',
              fontWeight: 700,
              boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)',
            }}
          >
            {totalCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="app-header-bell__dropdown">
          <div
            style={{
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '0.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
              Notifications {totalCount > 0 && `(${totalCount})`}
            </span>
            {notifications.length > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary-purple)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {totalCount === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '1.5rem 0',
                  color: 'var(--text-muted)',
                  fontSize: '0.85rem',
                }}
              >
                No new notifications or pending follow-ups
              </div>
            ) : (
              <>
                {dueCheckpoints.map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => openLead(lead.id)}
                    style={{
                      padding: '0.85rem',
                      background: 'rgba(139, 92, 246, 0.08)',
                      borderRadius: '8px',
                      border: '1px solid rgba(139, 92, 246, 0.25)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      color: 'inherit',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        color: 'var(--primary-purple, #8b5cf6)',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                      }}
                    >
                      <Clock size={15} />
                      <span>Follow-up Due</span>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        lineHeight: 1.3,
                      }}
                    >
                      {leadDisplayName(lead)}
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.72rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span>{lead.status}</span>
                      <span style={{ color: 'var(--danger-color)', fontWeight: 600 }}>
                        {formatOverdueLabel(lead.next_checkpoint_at)}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--accent-blue)' }}>
                      Open lead to update status →
                    </span>
                  </button>
                ))}

                {notifications.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      padding: '0.75rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          color: 'var(--text-primary)',
                          paddingRight: '1.5rem',
                        }}
                      >
                        {n.title || 'Notification'}
                      </span>
                      <button
                        onClick={(e) => handleMarkRead(n.id, e)}
                        style={{
                          position: 'absolute',
                          top: '0.5rem',
                          right: '0.5rem',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '4px',
                          padding: '2px',
                        }}
                        title="Mark read"
                      >
                        <Check size={14} style={{ color: 'var(--success-color)' }} />
                      </button>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {n.message}
                    </p>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}

                {isAdmin &&
                  adminNotifs.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        navigate(`/admin?tab=users&userEmail=${encodeURIComponent(n.from_email || '')}`);
                        handleAcknowledgeAdmin(n.id);
                        setIsOpen(false);
                      }}
                      style={{
                        padding: '0.85rem',
                        background: 'rgba(91, 143, 185, 0.08)',
                        borderRadius: '8px',
                        border: '1px solid rgba(91, 143, 185, 0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.3rem',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(91, 143, 185, 0.15)')}
                      onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(91, 143, 185, 0.08)')}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          color: 'var(--accent-blue, #5b8fb9)',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                        }}
                      >
                        <Users size={13} />
                        <span>{n.type === 'new_signup' ? 'New Signup' : 'Upgrade Request'}</span>
                      </div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          lineHeight: 1.3,
                        }}
                      >
                        {n.from_email || '—'}
                      </p>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: '0.2rem',
                        }}
                      >
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {new Date(n.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <button
                          onClick={(e) => handleAcknowledgeAdmin(n.id, e)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '2px',
                          }}
                          title="Acknowledge"
                        >
                          <Check size={13} style={{ color: 'var(--success-color)' }} />
                        </button>
                      </div>
                    </div>
                  ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
