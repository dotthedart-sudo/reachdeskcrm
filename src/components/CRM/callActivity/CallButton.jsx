import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Phone, ChevronDown, Copy } from 'lucide-react';
import { DIALER_OPTIONS, executeDial, getDialerPrefs } from '../../../lib/callDialer';
import { computePortalMenuPosition, portalMenuStyle } from '../../../lib/portalMenu';

export default function CallButton({ phone, userId, onCopied, size = 'sm' }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const prefs = getDialerPrefs(userId);
  const dialer = prefs.dialer || 'native';

  const updatePos = () => {
    if (!triggerRef.current) return;
    setMenuPos(computePortalMenuPosition(triggerRef.current, {
      menuWidth: 180,
      menuHeight: 220,
    }));
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePos();
    const close = (e) => {
      const inRoot = ref.current?.contains(e.target);
      const inPanel = panelRef.current?.contains(e.target);
      if (!inRoot && !inPanel) setOpen(false);
    };
    const onReposition = () => updatePos();
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  if (!phone?.trim()) {
    return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>;
  }

  const runDial = async (d) => {
    setOpen(false);
    await executeDial(d, phone, prefs, { onCopied });
  };

  const btnClass = size === 'sm' ? 'btn btn-primary btn-sm' : 'btn btn-primary';

  const menu = open && menuPos && createPortal(
    <div
      ref={panelRef}
      style={{
        ...portalMenuStyle(menuPos),
        background: 'var(--bg-card)',
        border: '1px solid var(--border-strong)',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        minWidth: 180,
        padding: '0.25rem',
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {DIALER_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className="dropdown-item"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            width: '100%',
            background: 'transparent',
            border: 'none',
            padding: '0.45rem 0.65rem',
            textAlign: 'left',
            cursor: 'pointer',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
          }}
          onClick={() => runDial(opt.id)}
        >
          {opt.id === 'copy' ? <Copy size={13} /> : <Phone size={13} />}
          {opt.label}
        </button>
      ))}
    </div>,
    document.body,
  );

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'stretch' }}>
      <button
        type="button"
        className={btnClass}
        style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
        onClick={(e) => { e.stopPropagation(); runDial(dialer); }}
        title={`Call via ${DIALER_OPTIONS.find((o) => o.id === dialer)?.label || dialer}`}
      >
        <Phone size={13} /> Call
      </button>
      <button
        ref={triggerRef}
        type="button"
        className={`${btnClass} btn-secondary`}
        style={{
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          padding: '0 0.35rem',
          minWidth: 'auto',
          borderLeft: '1px solid var(--border)',
        }}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label="More dial options"
      >
        <ChevronDown size={12} />
      </button>
      {menu}
    </div>
  );
}
