import React from 'react';
import UserNotificationBell from './UserNotificationBell';
import ChatWidget from './ChatWidget';
import AppHeaderProfile from './AppHeaderProfile';

/** Compact header controls — assistant, notifications, account menu. */
export default function AppHeaderActions({
  profile,
  onRefreshProfile,
  theme,
  toggleTheme,
  onLogout,
  planLabel,
  getInitials,
}) {
  if (!profile) return null;

  return (
    <div className="app-header-actions">
      <ChatWidget profile={profile} />
      <UserNotificationBell profile={profile} onRefreshProfile={onRefreshProfile} />
      <AppHeaderProfile
        profile={profile}
        theme={theme}
        toggleTheme={toggleTheme}
        onLogout={onLogout}
        planLabel={planLabel}
        getInitials={getInitials}
      />
    </div>
  );
}
