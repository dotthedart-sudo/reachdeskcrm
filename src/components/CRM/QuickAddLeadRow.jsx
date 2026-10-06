import React, { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';

export default function QuickAddLeadRow({
  totalCols = 1,
  onQuickAdd,
  disabled = false,
  listName = '',
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameInputRef = useRef(null);
  const phoneInputRef = useRef(null);

  // Global shortcut 'N' / 'n' when not in another input or modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (disabled) return;
      if (e.key === 'n' || e.key === 'N') {
        const active = document.activeElement;
        const isInput =
          active &&
          (active.tagName === 'INPUT' ||
            active.tagName === 'TEXTAREA' ||
            active.tagName === 'SELECT' ||
            active.isContentEditable);
        if (!isInput && !document.querySelector('.rd-modal--open, [role="dialog"]')) {
          e.preventDefault();
          nameInputRef.current?.focus();
          setIsFocused(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled]);

  const handleCommit = async () => {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName && !trimmedPhone) return;

    try {
      setSaving(true);
      await onQuickAdd?.({ name: trimmedName, phone: trimmedPhone });
      setName('');
      setPhone('');
      nameInputRef.current?.focus();
    } catch (err) {
      console.error('Failed to quick-add lead:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    } else if (e.key === 'Escape') {
      setName('');
      setPhone('');
      nameInputRef.current?.blur();
      setIsFocused(false);
    }
  };

  const handlePhoneKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    } else if (e.key === 'Escape') {
      setName('');
      setPhone('');
      phoneInputRef.current?.blur();
      setIsFocused(false);
    }
  };

  return (
    <tr
      className="rd-dt-row rd-dt-quick-add"
      style={{
        background: 'var(--rd-dt-bg)',
        borderBottom: '1px solid var(--rd-dt-line)',
      }}
      onClick={() => {
        if (!isFocused) {
          nameInputRef.current?.focus();
        }
      }}
    >
      <td
        colSpan={totalCols}
        style={{
          padding: '0 12px',
          height: 38,
          verticalAlign: 'middle',
          borderLeft: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, color: 'var(--text-muted)' }}>
            <Plus size={13} style={{ color: 'var(--status-cold, #5B8FB9)' }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
              New lead:
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 620 }}>
            <input
              ref={nameInputRef}
              type="text"
              className="rd-dt-quick-add__input"
              placeholder="Type a name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                if (!name && !phone) setIsFocused(false);
              }}
              onKeyDown={handleNameKeyDown}
              disabled={disabled || saving}
              style={{ flex: 1, minWidth: 140 }}
            />

            <input
              ref={phoneInputRef}
              type="text"
              className="rd-dt-quick-add__input"
              placeholder="Tab for phone..."
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                if (!name && !phone) setIsFocused(false);
              }}
              onKeyDown={handlePhoneKeyDown}
              disabled={disabled || saving}
              style={{ flex: 1, minWidth: 140 }}
            />

            {(name || phone) && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleCommit}
                disabled={saving || (!name.trim() && !phone.trim())}
                style={{ height: 26, fontSize: 11, padding: '0 8px', borderRadius: 4, flexShrink: 0 }}
              >
                {saving ? 'Adding…' : 'Enter ↵'}
              </button>
            )}
          </div>

          {!name && !phone && !isFocused && (
            <span className="rd-dt-quick-add__hint" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
              Press <kbd style={{ padding: '1px 4px', background: 'var(--bg-secondary)', borderRadius: 3, border: '1px solid var(--border)' }}>N</kbd> or Tab for phone, Enter to save
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
