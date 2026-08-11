import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { computePortalMenuPosition, portalMenuStyle } from '../lib/portalMenu';

export const CURRENCIES = [
  { code: 'PKR', label: 'PKR (Rs.)' },
  { code: 'USD', label: 'USD ($)' },
  { code: 'GBP', label: 'GBP (£)' },
  { code: 'EUR', label: 'EUR (€)' },
  { code: 'AED', label: 'AED (د.إ)' },
  { code: 'SAR', label: 'SAR (ر.س)' },
  { code: 'CAD', label: 'CAD (C$)' },
  { code: 'AUD', label: 'AUD (A$)' },
  { code: 'SGD', label: 'SGD (S$)' },
  { code: 'MYR', label: 'MYR (RM)' },
  { code: 'INR', label: 'INR (₹)' },
  { code: 'BDT', label: 'BDT (৳)' },
  { code: 'NPR', label: 'NPR (रू)' },
  { code: 'LKR', label: 'LKR (රු)' },
  { code: 'KWD', label: 'KWD (د.ك)' },
  { code: 'QAR', label: 'QAR (ر.ق)' },
  { code: 'OMR', label: 'OMR (ر.ع)' },
  { code: 'BHD', label: 'BHD (BD)' },
  { code: 'TRY', label: 'TRY (₺)' },
  { code: 'EGP', label: 'EGP (E£)' },
  { code: 'NGN', label: 'NGN (₦)' },
  { code: 'KES', label: 'KES (KSh)' },
  { code: 'ZAR', label: 'ZAR (R)' },
  { code: 'JPY', label: 'JPY (¥)' },
  { code: 'CNY', label: 'CNY (¥)' },
  { code: 'KRW', label: 'KRW (₩)' },
  { code: 'CHF', label: 'CHF (Fr)' },
  { code: 'SEK', label: 'SEK (kr)' },
  { code: 'NOK', label: 'NOK (kr)' },
  { code: 'DKK', label: 'DKK (kr)' },
];

// Derived map: code → symbol, e.g. { 'USD': '$', 'GBP': '£', ... }
// Extracted from the label string between parentheses.
export const CURRENCY_MAP = Object.fromEntries(
  CURRENCIES.map(c => {
    const match = c.label.match(/\((.+)\)/);
    return [c.code, match ? match[1] : c.code];
  })
);

export default function CurrencySelector({
  value,
  onChange,
  placeholder = 'Select currency...',
  className = '',
}) {
  const [query, setQuery]   = useState('');
  const [open, setOpen]     = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const wrapperRef          = useRef(null);
  const triggerRef          = useRef(null);
  const panelRef            = useRef(null);
  const inputRef            = useRef(null);

  const selectedLabel = value
    ? (CURRENCIES.find(c => c.code === value)?.label ?? value)
    : '';

  const filtered = CURRENCIES.filter(c =>
    c.label.toLowerCase().includes(query.toLowerCase()) ||
    c.code.toLowerCase().includes(query.toLowerCase())
  );

  const showCustom =
    query.trim() !== '' &&
    !CURRENCIES.some(c => c.code.toLowerCase() === query.trim().toLowerCase());

  const updatePos = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPos(computePortalMenuPosition(triggerRef.current, {
      menuWidth: Math.max(180, rect.width),
      menuHeight: 240,
    }));
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePos();
    function handleOutside(e) {
      const inRoot = wrapperRef.current?.contains(e.target);
      const inPanel = panelRef.current?.contains(e.target);
      if (!inRoot && !inPanel) {
        setOpen(false);
        setQuery('');
      }
    }
    const onReposition = () => updatePos();
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  const handleOpen = () => {
    setQuery('');
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelect = (code) => {
    onChange(code);
    setOpen(false);
    setQuery('');
  };

  const handleCustom = () => {
    const code = query.trim().toUpperCase();
    if (code) {
      onChange(code);
      setOpen(false);
      setQuery('');
    }
  };

  const menu = open && menuPos && createPortal(
    <div
      ref={panelRef}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        ...portalMenuStyle(menuPos),
        backgroundColor: 'var(--bg-secondary, #1f2937)',
        border: '1px solid var(--border-color, #374151)',
        borderRadius: '8px',
        maxHeight: '220px',
        overflowY: 'auto',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      }}
    >
      {filtered.map(c => (
        <div
          key={c.code}
          onMouseDown={() => handleSelect(c.code)}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-color, #374151)',
            color: 'var(--text-primary, #f3f4f6)',
            backgroundColor: c.code === value ? 'rgba(147,51,234,0.12)' : 'transparent',
            transition: 'background 0.1s',
          }}
          onMouseEnter={e => {
            if (c.code !== value) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = c.code === value ? 'rgba(147,51,234,0.12)' : 'transparent';
          }}
        >
          <span>{c.label}</span>
          {c.code === value && (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2.5 7l3 3 6-6" stroke="#a855f7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      ))}

      {showCustom && (
        <div
          onMouseDown={handleCustom}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            color: 'var(--primary-magenta, #e879f9)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontWeight: 600,
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          Use "{query.trim().toUpperCase()}" as custom currency
        </div>
      )}

      {filtered.length === 0 && !showCustom && (
        <div style={{ padding: '12px', fontSize: '0.85rem', color: 'var(--text-muted, #9ca3af)', textAlign: 'center' }}>
          No currencies found
        </div>
      )}
    </div>,
    document.body,
  );

  return (
    <div
      ref={wrapperRef}
      className={`currency-selector-wrapper ${className}`}
      style={{ position: 'relative' }}
    >
      <div ref={triggerRef}>
        {!open ? (
          <button
            type="button"
            className="form-select"
            style={{
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              color: value ? 'inherit' : 'var(--text-muted, #9ca3af)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
            }}
            onClick={handleOpen}
          >
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {value ? selectedLabel : placeholder}
            </span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.6 }}>
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ) : (
          <input
            ref={inputRef}
            type="text"
            className="form-input"
            style={{ width: '100%' }}
            placeholder="Search currency..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setOpen(false); setQuery(''); }
              if (e.key === 'Enter') {
                e.preventDefault();
                if (filtered.length > 0) handleSelect(filtered[0].code);
                else if (showCustom) handleCustom();
              }
            }}
          />
        )}
      </div>
      {menu}
    </div>
  );
}
