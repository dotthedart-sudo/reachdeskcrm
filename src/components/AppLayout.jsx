import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Users, BookOpen, Receipt, TrendingUp, ShieldAlert,
  Sun, Moon, LayoutDashboard, Clock, LogOut,
  Settings, FileText, Bell, CreditCard,
  Menu, X as XIcon, HelpCircle, Calendar,
  PanelLeftClose, PanelLeftOpen, UsersRound, Lock, BarChart2
} from 'lucide-react';
import { useAppContext } from '../App';
import { isTeamsFeatureLocked, isPaidPlanActive, canManageOwnBilling, isTeamMember, getSidebarPlanLabel } from '../lib/teamWorkspace';
import { isValidTrialEndDate } from '../lib/billing';
import { isBillingLock } from '../lib/accountLock';
import UpgradeLockModal from './UpgradeLockModal';
import MobileNav from './MobileNav';
import { useLeadLimitStatus, LeadLimitTopBar } from '../lib/leadLimits';
import { exportLeads } from '../utils/exportUtils';
import { supabase } from '../lib/supabase';
import { BRAND_LOGO_TEXT } from '../config/brand';

export default function AppLayout({
  profile,
  theme,
  toggleTheme,
  remindersCount,
  adminNotifCount,
  brandName,
  handleLogout,
  subStatus,
  children
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // ── Collapsible sidebar (desktop only) ─────────────────────────────────────
  // Initialise from profile immediately — no flash (value read before first paint)
  const [isCollapsed, setIsCollapsed] = useState(() => !!profile?.sidebar_collapsed);
  const saveTimeoutRef = useRef(null);

  // Sync if profile prop changes (e.g. after onRefreshProfile resolves)
  useEffect(() => {
    setIsCollapsed(!!profile?.sidebar_collapsed);
  }, [profile?.sidebar_collapsed]);

  const handleToggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);

    // Persist to DB — direct save, same pattern as reminders_enabled
    if (!profile?.id) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await supabase
          .from('user_profiles')
          .update({ sidebar_collapsed: next })
          .eq('id', profile.id);
      } catch (err) {
        console.error('[Sidebar] Failed to persist collapse state:', err);
      }
    }, 400); // small debounce so rapid double-clicks don't fire two requests
  };
  // ───────────────────────────────────────────────────────────────────────────

  const limitStatus = useLeadLimitStatus(profile?.id);
  const { calendarUnlocked, reportsUnlocked } = useAppContext() || {};

  const handleExportLeads = async () => {
    if (!profile?.id) return;
    try {
      await exportLeads(profile.id);
    } catch (err) {
      console.error('Failed to export leads:', err);
      alert(err.message || 'Export failed.');
    }
  };

  const isAdmin = profile?.role === 'admin';
  const planLabel = getSidebarPlanLabel(profile);

  const handleNotesClickMobile = () => {
    setIsSidebarOpen(false);
  };

  const getInitials = () => {
    if (profile?.full_name) {
      const parts = profile.full_name.trim().split(/\s+/);
      return parts.map(p => p[0]).join('').substring(0, 2).toUpperCase();
    }
    if (profile?.email) {
      return profile.email.substring(0, 2).toUpperCase();
    }
    return 'RD';
  };

  // Tooltip helper: shows label only when sidebar is collapsed
  const tip = (label) => isCollapsed ? label : undefined;

  return (
    <>
      <LeadLimitTopBar
        status={limitStatus}
        onExport={handleExportLeads}
        onCleanup={() => navigate('/leads')}
        onUpgrade={() => navigate('/upgrade')}
      />
      <div className="app-container">
      {/* Mobile Top Bar */}
      <div className="mobile-top-bar">
        <button
          className="hamburger-btn"
          onClick={() => setIsSidebarOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <span
          className="logo-text"
          onClick={() => { navigate('/dashboard'); setIsSidebarOpen(false); }}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          {BRAND_LOGO_TEXT}
        </span>
        <div style={{ width: 20 }}></div>
      </div>

      {/* Sidebar overlay backdrop for mobile */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <div className={`sidebar${isCollapsed ? ' collapsed' : ''}${isSidebarOpen ? ' mobile-open' : ''}`}>
        <div>
          {/* Sidebar Logo + collapse toggle */}
          <div className="sidebar-logo" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span className="logo-text nav-label">
                {BRAND_LOGO_TEXT}
              </span>
            </div>

            {/* Desktop collapse toggle — hidden on mobile via CSS (desktop @media block only) */}
            <button
              className="sidebar-collapse-btn"
              onClick={handleToggleCollapse}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed
                ? <PanelLeftOpen size={16} />
                : <PanelLeftClose size={16} />
              }
            </button>

            {/* Mobile close button */}
            <button
              className="hamburger-btn mobile-only-close"
              onClick={() => setIsSidebarOpen(false)}
              style={{ display: 'none' }}
            >
              <XIcon size={20} />
            </button>
          </div>

          {/* Desktop-only Sidebar Menu */}
          <ul className="sidebar-menu desktop-only-menu">
            <li>
              <Link to="/dashboard" title={tip('Dashboard')} className={`sidebar-item ${pathname === '/dashboard' ? 'active' : ''}`}>
                <LayoutDashboard size={18} /><span className="nav-label">Dashboard</span>
              </Link>
            </li>

            <li>
              <Link to="/leads" title={tip('CRM Leads')} className={`sidebar-item ${pathname === '/leads' ? 'active' : ''}`}>
                <Users size={18} /><span className="nav-label">CRM Leads</span>
              </Link>
            </li>

            <li>
              <Link to="/templates" title={tip('Templates')} className={`sidebar-item ${pathname === '/templates' ? 'active' : ''}`}>
                <BookOpen size={18} /><span className="nav-label">Templates</span>
              </Link>
            </li>

            <li>
              <Link to="/invoices" title={tip('Client Invoices')} className={`sidebar-item ${pathname === '/invoices' ? 'active' : ''}`}>
                <Receipt size={18} /><span className="nav-label">Client Invoices</span>
              </Link>
            </li>

            <li>
              <Link to="/revenue" title={tip('Revenue Tracker')} className={`sidebar-item ${pathname === '/revenue' ? 'active' : ''}`}>
                <TrendingUp size={18} /><span className="nav-label">Revenue Tracker</span>
              </Link>
            </li>

            <li>
              <Link
                to="/reports"
                title={tip(!reportsUnlocked ? 'Reports (Upgrade)' : 'Reports')}
                className={`sidebar-item ${pathname === '/reports' ? 'active' : ''}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div className="sidebar-item__main">
                  <BarChart2 size={18} /><span className="nav-label">Reports</span>
                </div>
                {!reportsUnlocked && (
                  <Lock size={12} className="nav-label" style={{ opacity: 0.65 }} />
                )}
              </Link>
            </li>

            <li>
              <Link to="/notes" title={tip('Notes')} className={`sidebar-item ${pathname === '/notes' ? 'active' : ''}`}>
                <FileText size={18} /><span className="nav-label">Notes</span>
              </Link>
            </li>

            <li>
              <Link
                to="/calendar"
                title={tip(!calendarUnlocked ? 'Calendar (Upgrade)' : 'Calendar')}
                className={`sidebar-item ${pathname === '/calendar' ? 'active' : ''}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div className="sidebar-item__main">
                  <Calendar size={18} /><span className="nav-label">Calendar</span>
                </div>
                {!calendarUnlocked && (
                  <Lock size={12} className="nav-label" style={{ opacity: 0.65 }} />
                )}
              </Link>
            </li>

            <li>
              <Link
                to="/teams"
                title={tip(isTeamsFeatureLocked(profile) ? 'Teams (Upgrade)' : 'Teams')}
                className={`sidebar-item ${pathname === '/teams' ? 'active' : ''}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div className="sidebar-item__main">
                  <UsersRound size={18} /><span className="nav-label">Teams</span>
                </div>
                {isTeamsFeatureLocked(profile) && (
                  <Lock size={12} className="nav-label" style={{ opacity: 0.65 }} />
                )}
              </Link>
            </li>

            <li>
              <Link
                to="/reminders"
                title={tip('Reminders')}
                className={`sidebar-item ${pathname === '/reminders' ? 'active' : ''}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div className="sidebar-item__main">
                  <Bell size={18} /><span className="nav-label">Reminders</span>
                </div>
                {remindersCount > 0 && (
                  <span className="badge badge-pending" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '50%' }}>
                    {remindersCount}
                  </span>
                )}
              </Link>
            </li>

            <li>
              <Link to="/get-started" title={tip('Get Started')} className={`sidebar-item ${pathname === '/get-started' ? 'active' : ''}`}>
                <HelpCircle size={18} /><span className="nav-label">Get Started</span>
              </Link>
            </li>

            <li>
              <Link to="/settings" title={tip('Configuration')} className={`sidebar-item ${pathname === '/settings' ? 'active' : ''}`}>
                <Settings size={18} /><span className="nav-label">Configuration</span>
              </Link>
            </li>

            {!isTeamMember(profile) && canManageOwnBilling(profile) && (
            <li>
              <Link to="/upgrade" title={tip(isPaidPlanActive(profile) && profile?.plan !== 'trial' ? 'Manage Plan' : 'Upgrade Plan')} className={`sidebar-item ${pathname === '/upgrade' ? 'active' : ''}`}>
                <CreditCard size={18} /><span className="nav-label">{isPaidPlanActive(profile) && profile?.plan !== 'trial' ? 'Manage Plan' : 'Upgrade Plan'}</span>
              </Link>
            </li>
            )}

            {isAdmin && (
              <li>
                <Link
                  to="/admin"
                  title={tip('Admin Panel')}
                  className={`sidebar-item ${pathname === '/admin' ? 'active' : ''}`}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <ShieldAlert size={16} />
                    <span className="nav-label">Admin Panel</span>
                  </div>
                  {adminNotifCount > 0 && (
                    <span style={{ background: 'var(--status-hot)', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 600 }}>
                      {adminNotifCount}
                    </span>
                  )}
                </Link>
              </li>
            )}

            <li>
              <div
                className="sidebar-item"
                title={tip('Log Out')}
                onClick={handleLogout}
                style={{ marginTop: '0.5rem', borderTop: '0.5px solid var(--border)', paddingTop: '0.75rem', borderRadius: 0, cursor: 'pointer' }}
              >
                <LogOut size={16} style={{ color: 'var(--status-hot)' }} />
                <span className="nav-label" style={{ color: 'var(--status-hot)' }}>Log Out</span>
              </div>
            </li>
          </ul>

          {/* Mobile-only Sidebar Menu (Clean, Text-only, Filtered) */}
          <ul className="sidebar-menu mobile-only-menu">
            <li>
              <Link to="/invoices" onClick={() => setIsSidebarOpen(false)} className="mobile-menu-item">
                Client Invoices
              </Link>
            </li>

            <li>
              <Link to="/revenue" onClick={() => setIsSidebarOpen(false)} className="mobile-menu-item">
                Revenue Tracker
              </Link>
            </li>

            <li>
              <Link to="/reports" onClick={() => setIsSidebarOpen(false)} className="mobile-menu-item">
                {!reportsUnlocked ? 'Reports (Upgrade)' : 'Reports'}
              </Link>
            </li>

            <li>
              <Link
                to="/notes"
                onClick={handleNotesClickMobile}
                className="mobile-menu-item"
              >
                Notes
              </Link>
            </li>

            <li>
              <Link to="/calendar" onClick={() => setIsSidebarOpen(false)} className="mobile-menu-item">
                {!calendarUnlocked ? 'Calendar (Upgrade)' : 'Calendar'}
              </Link>
            </li>

            <li>
              <Link to="/teams" onClick={() => setIsSidebarOpen(false)} className="mobile-menu-item">
                {isTeamsFeatureLocked(profile) ? 'Teams (Upgrade)' : 'Teams'}
              </Link>
            </li>

            <li>
              <Link to="/get-started" onClick={() => setIsSidebarOpen(false)} className="mobile-menu-item">
                Get Started Guide
              </Link>
            </li>

            {(profile?.plan ?? '').toLowerCase() !== 'starter' && (
              <li>
                <Link to="/settings" onClick={() => setIsSidebarOpen(false)} className="mobile-menu-item">
                  Configuration
                </Link>
              </li>
            )}

            {!isTeamMember(profile) && canManageOwnBilling(profile) && (
            <li>
              <Link to="/upgrade" onClick={() => setIsSidebarOpen(false)} className="mobile-menu-item">
                {isPaidPlanActive(profile) && profile?.plan !== 'trial' ? 'Manage Plan' : 'Upgrade Plan'}
              </Link>
            </li>
            )}

            {isAdmin && (
              <li>
                <Link to="/admin" onClick={() => setIsSidebarOpen(false)} className="mobile-menu-item" style={{ color: 'var(--primary-magenta)' }}>
                  Admin Panel
                </Link>
              </li>
            )}

            <li>
              <div
                className="mobile-menu-item"
                onClick={() => { handleLogout(); setIsSidebarOpen(false); }}
                style={{ cursor: 'pointer', color: 'var(--danger-color)', borderTop: '1px solid var(--border-color)', marginTop: '1rem', paddingTop: '1rem' }}
              >
                Log Out
              </div>
            </li>
          </ul>
        </div>

        <div className="sidebar-footer" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.5rem', marginBottom: '0.25rem' }}>
            <span className="workspace-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>WORKSPACE</span>
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                padding: '4px',
                transition: 'color 0.15s ease'
              }}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>

          <div className="user-info-card">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Profile Avatar"
                className="user-avatar"
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <div className="user-avatar">{getInitials()}</div>
            )}
            <div className="user-details" style={{ overflow: 'hidden' }}>
              <div className="user-name" title={profile?.full_name || profile?.email || 'Logged In'} style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '140px', fontWeight: 600 }}>
                {profile?.full_name || profile?.email || 'Logged In'}
              </div>
              <div className="user-role" title={profile?.full_name ? profile?.email : undefined} style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                {profile?.full_name ? profile.email : (profile?.email || 'Account')}
              </div>
              {planLabel && (
                <div className="user-plan" title={planLabel}>
                  {planLabel}
                </div>
              )}
              {!profile?.full_name && (
                <div style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                  <Link to="/settings" style={{ color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 500 }} onMouseEnter={e => e.target.style.textDecoration = 'underline'} onMouseLeave={e => e.target.style.textDecoration = 'none'}>
                    Add your name →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="main-content">
        {/* Trial banner — only when on trial with a real future/near end date (never epoch/null) */}
        {profile?.plan === 'trial' && subStatus === 'active' && isValidTrialEndDate(profile.trial_ends_at) && (() => {
          const msLeft = new Date(profile.trial_ends_at) - Date.now();
          const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
          const label = daysLeft === 0 ? 'less than a day' : daysLeft === 1 ? '1 day' : `${daysLeft} days`;
          return (
            <div className="rd-info-banner">
              <Clock size={16} style={{ color: 'var(--status-warm)', flexShrink: 0, marginTop: '2px' }} />
              <span>
                <strong>Free Trial Active</strong>
                {' '}— Your trial ends in{' '}
                <span className="rd-info-banner-accent">{label}</span>
                {' '}({new Date(profile.trial_ends_at).toLocaleDateString()}). Choose a plan in settings to avoid lock.
              </span>
            </div>
          );
        })()}
        {children}
      </div>

      {isBillingLock(profile) && (
        <UpgradeLockModal
          profile={profile}
          handleLogout={handleLogout}
          theme={theme}
        />
      )}

      {/* Mobile Bottom Navigation */}
      <MobileNav onOpenMenu={() => setIsSidebarOpen(prev => !prev)} />
      </div>
    </>
  );
}
