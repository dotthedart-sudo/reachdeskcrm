import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { usePageHeaderContext } from '../context/PageHeaderContext';
import AppHeaderActions from './AppHeaderActions';
import CompactSearch from './ui/CompactSearch';

const ROUTE_DEFAULTS = {
  '/dashboard': { title: 'Dashboard' },
  '/leads': { title: 'Leads' },
  '/templates': { title: 'Templates' },
  '/invoices': { title: 'Client Invoices' },
  '/revenue': { title: 'Revenue Tracker' },
  '/reports': { title: 'Reports' },
  '/notes': { title: 'Notes' },
  '/calendar': { title: 'Calendar' },
  '/teams': { title: 'Teams' },
  '/reminders': { title: 'Notifications' },
  '/settings': { title: 'Configuration' },
  '/get-started': { title: 'Get Started' },
  '/upgrade': { title: 'Billing' },
  '/admin': { title: 'Admin Panel' },
};

export default function AppHeader({
  profile,
  onRefreshProfile,
  theme,
  toggleTheme,
  onLogout,
  planLabel,
  getInitials,
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { header } = usePageHeaderContext();
  const [globalQuery, setGlobalQuery] = useState('');

  const defaults = ROUTE_DEFAULTS[pathname] || { title: '' };
  const title = header.title || defaults.title;
  const breadcrumbs = header.breadcrumbs?.length ? header.breadcrumbs : defaults.breadcrumbs || [];

  const breadcrumbTrail = useMemo(() => {
    if (breadcrumbs.length === 0 && title) {
      return [{ label: title }];
    }
    return breadcrumbs;
  }, [breadcrumbs, title]);

  const handleGlobalSearch = (query) => {
    const q = String(query || '').trim();
    if (!q) return;
    navigate(`/leads?search=${encodeURIComponent(q)}`);
  };

  return (
    <header className="app-header">
      <div className="app-header__left">
        {breadcrumbTrail.length > 1 ? (
          <nav className="app-header__breadcrumbs" aria-label="Breadcrumb">
            {breadcrumbTrail.map((crumb, i) => {
              const isLast = i === breadcrumbTrail.length - 1;
              return (
                <React.Fragment key={`${crumb.label}-${i}`}>
                  {i > 0 && <ChevronRight size={14} className="app-header__sep" aria-hidden />}
                  {crumb.onClick && !isLast ? (
                    <button type="button" className="app-header__crumb-link" onClick={crumb.onClick}>
                      {crumb.label}
                    </button>
                  ) : (
                    <span className={isLast ? 'app-header__title' : 'app-header__crumb'}>
                      {crumb.label}
                    </span>
                  )}
                  {crumb.dropdown}
                </React.Fragment>
              );
            })}
          </nav>
        ) : (
          <h1 className="app-header__title">{title || 'ReachDesk CRM'}</h1>
        )}
      </div>

      <div className="app-header__right">
        {header.actions && (
          <div className="app-header__page-actions">{header.actions}</div>
        )}

        {!header.hideSearch && (
          <CompactSearch
            value={globalQuery}
            onChange={setGlobalQuery}
            onSubmit={handleGlobalSearch}
            placeholder="Search leads…"
            width={280}
            className="app-header__search"
          />
        )}

        <AppHeaderActions
          profile={profile}
          onRefreshProfile={onRefreshProfile}
          theme={theme}
          toggleTheme={toggleTheme}
          onLogout={onLogout}
          planLabel={planLabel}
          getInitials={getInitials}
        />
      </div>
    </header>
  );
}
