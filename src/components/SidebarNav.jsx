import React from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, Users, BookOpen, FileText, Receipt, TrendingUp,
  BarChart2, Calendar, UsersRound, Bell, HelpCircle, Settings,
  CreditCard, ShieldAlert, LogOut, Lock,
} from 'lucide-react';

function SidebarSection({ label, children }) {
  return (
    <div className="sidebar-section">
      <div className="sidebar-section__label nav-label">{label}</div>
      <ul className="sidebar-menu sidebar-section__list">{children}</ul>
    </div>
  );
}

function SidebarLink({
  to,
  icon: Icon,
  label,
  active,
  tip,
  locked,
  badge,
  onClick,
  danger,
}) {
  return (
    <li>
      <Link
        to={to}
        title={tip}
        onClick={onClick}
        className={`sidebar-item${active ? ' active' : ''}${danger ? ' sidebar-item--danger' : ''}`}
      >
        <span className="sidebar-item__main">
          <Icon size={17} />
          <span className="nav-label">{label}</span>
        </span>
        {locked && <Lock size={11} className="nav-label sidebar-item__lock" aria-hidden />}
        {badge}
      </Link>
    </li>
  );
}

export default function SidebarNav({
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
  onMobileClose,
  onLogout,
  mobile = false,
}) {
  const close = onMobileClose || (() => {});

  if (mobile) {
    return (
      <div className="sidebar-nav-groups mobile-only-menu">
        <SidebarSection label="Outreach">
          <SidebarLink to="/leads?mode=messages" onClick={close} icon={Users} label="Cold Outreach" active={pathname === '/leads'} tip={tip('Cold Outreach')} />
          <SidebarLink to="/calendar" onClick={close} icon={Calendar} label="Calendar" active={pathname === '/calendar'} tip={tip(!calendarUnlocked ? 'Calendar (Upgrade)' : 'Calendar')} locked={!calendarUnlocked} />
        </SidebarSection>
        
        <SidebarSection label="Business">
          <SidebarLink to="/invoices" onClick={close} icon={Receipt} label="Client Invoices" active={pathname === '/invoices'} tip={tip('Client Invoices')} />
          <SidebarLink to="/revenue" onClick={close} icon={TrendingUp} label="Revenue Tracker" active={pathname === '/revenue'} tip={tip('Revenue Tracker')} />
        </SidebarSection>
        
        <SidebarSection label="Insights">
          <SidebarLink to="/reports" onClick={close} icon={BarChart2} label="Reports" active={pathname === '/reports'} tip={tip(!reportsUnlocked ? 'Reports (Upgrade)' : 'Reports')} locked={!reportsUnlocked} />
          <SidebarLink to="/notes" onClick={close} icon={FileText} label="Notes" active={pathname.startsWith('/notes')} tip={tip('Notes')} />
        </SidebarSection>
        
        <SidebarSection label="Workspace">
          <SidebarLink to="/teams" onClick={close} icon={UsersRound} label="Teams" active={pathname === '/teams'} tip={tip(teamsLocked ? 'Teams (Upgrade)' : 'Teams')} locked={teamsLocked} />
          <SidebarLink to="/get-started" onClick={close} icon={HelpCircle} label="Get Started Guide" active={pathname === '/get-started'} tip={tip('Get Started Guide')} />
          {(profile?.plan ?? '').toLowerCase() !== 'starter' && (
            <SidebarLink to="/settings" onClick={close} icon={Settings} label="Configuration" active={pathname === '/settings'} tip={tip('Configuration')} />
          )}
          {showBillingLink && (
            <SidebarLink to="/upgrade" onClick={close} icon={CreditCard} label={billingLabel} active={pathname === '/upgrade'} tip={tip(billingLabel)} />
          )}
          {isAdmin && (
            <SidebarLink
              to="/admin"
              onClick={close}
              icon={ShieldAlert}
              label="Admin Panel"
              active={pathname === '/admin'}
              tip={tip('Admin Panel')}
              badge={adminNotifCount > 0 ? (
                <span className="sidebar-item__badge sidebar-item__badge--hot">{adminNotifCount > 99 ? '99+' : adminNotifCount}</span>
              ) : null}
            />
          )}
        </SidebarSection>

        <div className="sidebar-bottom">
          <ul className="sidebar-menu">
            <li className="sidebar-item-divider" style={{ borderTop: '1px solid var(--border-color)', margin: '1rem 0' }}></li>
            <SidebarLink
              to="#"
              onClick={(e) => {
                e.preventDefault();
                onLogout?.();
                close();
              }}
              icon={LogOut}
              label="Log Out"
              danger
            />
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar-nav-groups desktop-only-menu">
      <SidebarSection label="CRM">
        <SidebarLink to="/dashboard" icon={LayoutDashboard} label="Dashboard" active={pathname === '/dashboard'} tip={tip('Dashboard')} />
        <SidebarLink to="/leads" icon={Users} label="Leads" active={pathname === '/leads'} tip={tip('Leads')} />
        <SidebarLink to="/templates" icon={BookOpen} label="Templates" active={pathname === '/templates'} tip={tip('Templates')} />
        <SidebarLink to="/notes" icon={FileText} label="Notes" active={pathname.startsWith('/notes')} tip={tip('Notes')} />
      </SidebarSection>

      <SidebarSection label="Outreach">
        <SidebarLink to="/leads?mode=messages" icon={Users} label="Cold Outreach" active={pathname === '/leads'} tip={tip('Cold Outreach')} />
        <SidebarLink to="/calendar" icon={Calendar} label="Calendar" active={pathname === '/calendar'} tip={tip(!calendarUnlocked ? 'Calendar (Upgrade)' : 'Calendar')} locked={!calendarUnlocked} />
      </SidebarSection>

      <SidebarSection label="Business">
        <SidebarLink to="/invoices" icon={Receipt} label="Client Invoices" active={pathname === '/invoices'} tip={tip('Client Invoices')} />
        <SidebarLink to="/revenue" icon={TrendingUp} label="Revenue Tracker" active={pathname === '/revenue'} tip={tip('Revenue Tracker')} />
      </SidebarSection>

      <SidebarSection label="Insights">
        <SidebarLink to="/reports" icon={BarChart2} label="Reports" active={pathname === '/reports'} tip={tip(!reportsUnlocked ? 'Reports (Upgrade)' : 'Reports')} locked={!reportsUnlocked} />
      </SidebarSection>

      <SidebarSection label="Workspace">
        <SidebarLink to="/teams" icon={UsersRound} label="Teams" active={pathname === '/teams'} tip={tip(teamsLocked ? 'Teams (Upgrade)' : 'Teams')} locked={teamsLocked} />
        <SidebarLink
          to="/reminders"
          icon={Bell}
          label="Reminders"
          active={pathname === '/reminders'}
          tip={tip('Reminders')}
          badge={remindersCount > 0 ? (
            <span className="sidebar-item__badge sidebar-item__badge--count">{remindersCount > 99 ? '99+' : remindersCount}</span>
          ) : null}
        />
      </SidebarSection>

      <div className="sidebar-bottom">
        <ul className="sidebar-menu">
          <SidebarLink to="/get-started" icon={HelpCircle} label="Get Started" active={pathname === '/get-started'} tip={tip('Get Started')} />
          <SidebarLink to="/settings" icon={Settings} label="Configuration" active={pathname === '/settings'} tip={tip('Configuration')} />
          {showBillingLink && (
            <SidebarLink to="/upgrade" icon={CreditCard} label={billingLabel} active={pathname === '/upgrade'} tip={tip(billingLabel)} />
          )}
          {isAdmin && (
            <SidebarLink
              to="/admin"
              icon={ShieldAlert}
              label="Admin Panel"
              active={pathname === '/admin'}
              tip={tip('Admin Panel')}
              badge={adminNotifCount > 0 ? (
                <span className="sidebar-item__badge sidebar-item__badge--hot">{adminNotifCount > 99 ? '99+' : adminNotifCount}</span>
              ) : null}
            />
          )}
          <li>
            <button type="button" className="sidebar-item sidebar-item--danger sidebar-item--button" title={tip('Log Out')} onClick={onLogout}>
              <span className="sidebar-item__main">
                <LogOut size={17} />
                <span className="nav-label">Log Out</span>
              </span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
