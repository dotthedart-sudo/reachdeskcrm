import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock } from 'lucide-react';
import {
  datetimeLocalValueToIso,
  formatActivityDateTime,
  isoToDatetimeLocalValue,
  resolveTimeZone,
} from '../../lib/dateTime';
import { computePortalMenuPosition, portalMenuStyle } from '../../lib/portalMenu';

/**
 * Inline editable datetime cell — picker (select + type), not free-text only.
 * Popover is portaled so table overflow:hidden cannot clip it.
 */
export default function DateTimePickerCell({
  value,
  timeZone,
  onChange,
  placeholder = '—',
  disabled = false,
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [menuPos, setMenuPos] = useState(null);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const tz = resolveTimeZone(timeZone);

  useEffect(() => {
    if (open) {
      setDraft(isoToDatetimeLocalValue(value, tz) || '');
    }
  }, [open, value, tz]);

  const updatePos = () => {
    if (!triggerRef.current) return;
    setMenuPos(computePortalMenuPosition(triggerRef.current, {
      menuWidth: 260,
      menuHeight: 180,
    }));
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePos();
    const onDoc = (e) => {
      const inTrigger = wrapRef.current?.contains(e.target);
      const inPanel = panelRef.current?.contains(e.target);
      if (!inTrigger && !inPanel) setOpen(false);
    };
    const onReposition = () => updatePos();
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  const label = value ? formatActivityDateTime(value, { timeZone: tz, showZone: false }) : placeholder;

  const commit = () => {
    if (!draft) {
      onChange?.(null);
      setOpen(false);
      return;
    }
    const iso = datetimeLocalValueToIso(draft, tz);
    if (iso) onChange?.(iso);
    setOpen(false);
  };

  const panel = open && menuPos && createPortal(
    <div
      ref={panelRef}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        ...portalMenuStyle(menuPos),
        padding: '0.65rem',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        minWidth: 240,
      }}
    >
      <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>
        Date & time
      </label>
      <input
        type="datetime-local"
        className="form-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        style={{ width: '100%', fontSize: '0.85rem', marginBottom: '0.5rem' }}
        autoFocus
      />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setDraft('');
            onChange?.(null);
            setOpen(false);
          }}
        >
          Clear
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={commit}>
          Save
        </button>
      </div>
    </div>,
    document.body,
  );

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block', minWidth: compact ? 110 : 140 }}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((v) => !v);
        }}
        title={value ? formatActivityDateTime(value, { timeZone: tz, showZone: true }) : 'Set date & time'}
        style={{
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: 4,
          padding: '2px 6px',
          cursor: disabled ? 'default' : 'pointer',
          color: value ? 'var(--text-secondary)' : 'var(--text-muted)',
          fontSize: compact ? '0.8rem' : '0.85rem',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          maxWidth: 200,
        }}
      >
        <CalendarClock size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </button>
      {panel}
    </div>
  );
}
