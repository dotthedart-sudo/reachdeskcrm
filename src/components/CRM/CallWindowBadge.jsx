import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getCallWindowBadgeStyle,
  getCallWindowStatus,
  getLeadLocalTimeLabel,
  COUNTRY_TIMEZONE_OPTIONS,
} from '../../lib/leadTimezone';

export default function CallWindowBadge({
  lead,
  defaultCountryCode = '+92',
  showLocalTime = false,
  at = new Date(),
  editable = false,
  onTimezoneChange,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const { status, label } = getCallWindowStatus(lead, at, { defaultCountryCode });
  const style = getCallWindowBadgeStyle(status);
  const localTime = showLocalTime ? getLeadLocalTimeLabel(lead, at, defaultCountryCode) : null;

  const sorted = useMemo(
    () => [...COUNTRY_TIMEZONE_OPTIONS].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((c) => (
      c.name.toLowerCase().includes(q)
      || c.dial.includes(q.replace(/^\+/, ''))
      || c.timezone.toLowerCase().includes(q)
    ));
  }, [query, sorted]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <span ref={wrapRef} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, position: 'relative' }}>
      <button
        type="button"
        className="badge"
        disabled={!editable}
        onClick={(e) => {
          e.stopPropagation();
          if (editable) setOpen((v) => !v);
        }}
        title={editable ? 'Set lead timezone / country' : undefined}
        style={{
          background: style.bg,
          color: style.color,
          border: 'none',
          fontSize: '0.65rem',
          fontWeight: 600,
          cursor: editable ? 'pointer' : 'default',
          padding: '2px 8px',
          borderRadius: 999,
        }}
      >
        {label}
      </button>
      {showLocalTime && (
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
          {localTime ? `Their time: ${localTime}` : (editable ? 'Set timezone or add phone' : '—')}
        </span>
      )}
      {open && (
        <div
          className="rd-menu"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            zIndex: 40,
            top: 'calc(100% + 6px)',
            left: 0,
            minWidth: 260,
          }}
        >
          <div className="rd-menu__search">
            <input
              type="search"
              className="rd-menu__search-input"
              placeholder="Search country or dial code…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="rd-menu__list">
            <button
              type="button"
              className={`rd-menu__item${!lead?.timezone ? ' rd-menu__item--active' : ''}`}
              onClick={() => {
                onTimezoneChange?.(null);
                setOpen(false);
                setQuery('');
              }}
            >
              <span className="rd-menu__item-label">Auto from phone</span>
            </button>
            {filtered.map((c) => {
              const active = lead?.timezone === c.timezone;
              return (
                <button
                  key={`${c.name}-${c.timezone}`}
                  type="button"
                  className={`rd-menu__item${active ? ' rd-menu__item--active' : ''}`}
                  onClick={() => {
                    onTimezoneChange?.(c.timezone);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <span className="rd-menu__item-label">{c.name}</span>
                  <span className="rd-menu__item-meta">+{c.dial}</span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="rd-menu__empty">No matching countries</div>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
