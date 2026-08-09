import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Clock, Menu, X as XIcon, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAppContext } from '../App';
import {
  isTeamsFeatureLocked,
  isPaidPlanActive,
  canManageOwnBilling,
  isTeamMember,
  getSidebarPlanLabel,
} from '../lib/teamWorkspace';
import { isValidTrialEndDate } from '../lib/billing';
import { isBillingLock } from '../lib/accountLock';
import { PageHeaderProvider } from '../context/PageHeaderContext';
import UpgradeLockModal from './UpgradeLockModal';
import MobileNav from './MobileNav';
import { useLeadLimitStatus, LeadLimitTopBar } from '../lib/leadLimits';
import { exportLeads } from '../utils/exportUtils';
import { supabase } from '../lib/supabase';
import { BRAND_LOGO_TEXT } from '../config/brand';
import AppHeader from './AppHeader';
import SidebarNav from './SidebarNav';

export default function AppLayout({
  profile,
  theme,
  toggleTheme,
  remindersCount,
  adminNotifCount,
  handleLogout,
  subStatus,
  children,
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => !!profile?.sidebar_collapsed);
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    setIsCollapsed(!!profile?.sidebar_collapsed);
  }, [profile?.sidebar_collapsed]);

  const handleToggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
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
    }, 400);
  };

  const limitStatus = useLeadLimitStatus(profile?.id);
  const { calendarUnlocked, reportsUnlocked, fetchProfile } = useAppContext() || {};

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
  const teamsLocked = isTeamsFeatureLocked(profile);
  const showBillingLink = !isTeamMember(profile) && canManageOwnBilling(profile);
  const billingLabel = isPaidPlanActive(profile) && profile?.plan !== 'trial'
    ? 'Manage Plan'
    : 'Upgrade Plan';

  const getInitials = () => {
    if (profile?.full_name) {
      const parts = profile.full_name.trim().split(/\s+/);
      return parts.map((p) => p[0]).join('').substring(0, 2).toUpperCase();
    }
    if (profile?.email) {
      return profile.email.substring(0, 2).toUpperCase();
    }
    return 'RD';
  };

  const tip = (label) => (isCollapsed ? label : undefined);

  const sidebarNavProps = {
    pathname,
    tip,
    profile,
    isAdmin,
    remindersCount,
    adminNotifCount,
    reportsUnlocked,
    calendarUnlocked,
    teamsLocked,
    showBillingLink,
    billingLabel,
    onLogout: handleLogout,
    onMobileClose: () => setIsSidebarOpen(false),
  };

  return (
    <>
      <LeadLimitTopBar
        status={limitStatus}
        onExport={handleExportLeads}
        onCleanup={() => navigate('/leads')}
        onUpgrade={() => navigate('/upgrade')}
      />
      <PageHeaderProvider>
        <div className="app-container">
          <div className="mobile-top-bar">
            <button
              type="button"
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
            <div style={{ width: 20 }} />
          </div>

          {isSidebarOpen && (
            <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
          )}

          <div className={`sidebar${isCollapsed ? ' collapsed' : ''}${isSidebarOpen ? ' mobile-open' : ''}`}>
            <div className="sidebar__scroll">
              <div className="sidebar-logo">
                <img
                  src="/logo.png"
                  alt=""
                  className="sidebar-logo-mark"
                  width={22}
                  height={22}
                  decoding="async"
                />
                <span className="logo-text nav-label">{BRAND_LOGO_TEXT}</span>
                <button
                  type="button"
                  className="sidebar-collapse-btn"
                  onClick={handleToggleCollapse}
                  title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                </button>
                <button
                  type="button"
                  className="hamburger-btn mobile-only-close"
                  onClick={() => setIsSidebarOpen(false)}
                  style={{ display: 'none' }}
                >
                  <XIcon size={20} />
                </button>
              </div>

              <SidebarNav {...sidebarNavProps} />
              <SidebarNav {...sidebarNavProps} mobile />
            </div>
          </div>

          <div className="app-main">
            <AppHeader
              profile={profile}
              onRefreshProfile={fetchProfile}
              theme={theme}
              toggleTheme={toggleTheme}
              onLogout={handleLogout}
              planLabel={planLabel}
              getInitials={getInitials}
            />

            <div className="main-content">
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
          </div>

          {isBillingLock(profile) && (
            <UpgradeLockModal
              profile={profile}
              handleLogout={handleLogout}
              theme={theme}
            />
          )}

          <MobileNav onOpenMenu={() => setIsSidebarOpen((prev) => !prev)} />
        </div>
      </PageHeaderProvider>
    </>
  );
}
