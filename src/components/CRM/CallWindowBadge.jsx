import React, { useEffect, useRef, useState } from 'react';
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

  const filtered = COUNTRY_TIMEZONE_OPTIONS.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q)
      || c.dial.includes(q.replace(/^\+/, ''))
      || c.timezone.toLowerCase().includes(q)
    );
  });

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
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            zIndex: 40,
            top: '100%',
            left: 0,
            marginTop: 4,
            padding: '0.5rem',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            minWidth: 260,
          }}
        >
          <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>
            Country / dial code
          </label>
          <input
            type="search"
            className="form-input"
            placeholder="Pakistan, +92…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: '100%', fontSize: '0.8rem', marginBottom: 6 }}
            autoFocus
          />
          <select
            className="form-input"
            style={{ width: '100%', fontSize: '0.8rem' }}
            value={lead?.timezone || ''}
            size={6}
            onChange={(e) => {
              onTimezoneChange?.(e.target.value || null);
              setOpen(false);
              setQuery('');
            }}
          >
            <option value="">Auto from phone</option>
            {filtered.map((c) => (
              <option key={`${c.name}-${c.timezone}`} value={c.timezone}>
                {c.name} (+{c.dial})
              </option>
            ))}
          </select>
        </div>
      )}
    </span>
  );
}
