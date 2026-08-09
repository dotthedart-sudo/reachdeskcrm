import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, Moon, Settings, Sun } from 'lucide-react';

export default function AppHeaderProfile({
  profile,
  theme,
  toggleTheme,
  onLogout,
  planLabel,
  getInitials,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (!profile) return null;

  const displayName = profile.full_name || profile.email || 'Account';
  const secondaryLine = profile.full_name ? profile.email : null;

  return (
    <div ref={rootRef} className="app-header-profile">
      <button
        type="button"
        className={`app-header-profile__trigger${open ? ' app-header-profile__trigger--open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Account menu"
        aria-expanded={open}
        title={displayName}
      >
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            className="app-header-profile__avatar app-header-profile__avatar--img"
          />
        ) : (
          <span className="app-header-profile__avatar">{getInitials?.() || 'RD'}</span>
        )}
      </button>

      {open && (
        <div className="app-header-profile__menu">
          <div className="app-header-profile__meta">
            <div className="app-header-profile__meta-name">{displayName}</div>
            {secondaryLine && (
              <div className="app-header-profile__meta-email">{secondaryLine}</div>
            )}
            {planLabel && (
              <div className="app-header-profile__meta-plan">{planLabel}</div>
            )}
          </div>

          {!profile.full_name && (
            <Link
              to="/settings"
              className="app-header-profile__item app-header-profile__item--accent"
              onClick={() => setOpen(false)}
            >
              Add your name
            </Link>
          )}

          <Link
            to="/settings"
            className="app-header-profile__item"
            onClick={() => setOpen(false)}
          >
            <Settings size={15} />
            Configuration
          </Link>

          <button
            type="button"
            className="app-header-profile__item"
            onClick={() => {
              toggleTheme?.();
            }}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>

          <div className="app-header-profile__divider" role="separator" />

          <button
            type="button"
            className="app-header-profile__item app-header-profile__item--danger"
            onClick={() => {
              setOpen(false);
              onLogout?.();
            }}
          >
            <LogOut size={15} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
