import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { computePortalMenuPosition, portalMenuStyle } from '../../lib/portalMenu';

/**
 * Shared styled dropdown — replaces native <select> app-wide.
 * options: { value, label, group? }[]
 * Menu is portaled to document.body so table overflow:hidden cannot clip it.
 */
export default function RdSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  disabled = false,
  className = '',
  size = 'sm',
  fullWidth = false,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const selected = options.find((o) => o.value === value);
  const groups = options.reduce((acc, opt) => {
    const key = opt.group || '';
    if (!acc[key]) acc[key] = [];
    acc[key].push(opt);
    return acc;
  }, {});

  const updatePos = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPos(computePortalMenuPosition(triggerRef.current, {
      menuWidth: Math.max(160, rect.width),
      menuHeight: 280,
    }));
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePos();
    const onDoc = (e) => {
      const inRoot = rootRef.current?.contains(e.target);
      const inPanel = panelRef.current?.contains(e.target);
      if (!inRoot && !inPanel) setOpen(false);
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

  const pick = (opt) => {
    onChange?.(opt.value, opt);
    setOpen(false);
  };

  const menu = open && menuPos && createPortal(
    <div
      ref={panelRef}
      className="rd-menu rd-select__menu"
      role="listbox"
      style={portalMenuStyle(menuPos)}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="rd-menu__list">
        {Object.entries(groups).map(([groupName, items]) => (
          <React.Fragment key={groupName || 'default'}>
            {groupName && <div className="rd-menu__group-label">{groupName}</div>}
            {items.map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={`rd-menu__item${opt.value === value ? ' rd-menu__item--active' : ''}`}
                onClick={() => pick(opt)}
              >
                <span className="rd-menu__item-label">{opt.label}</span>
                {opt.value === value && <Check size={14} className="rd-select__check" />}
              </button>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>,
    document.body,
  );

  return (
    <div
      ref={rootRef}
      className={`rd-select rd-select--${size}${fullWidth ? ' rd-select--full' : ''} ${className}`.trim()}
    >
      <button
        ref={triggerRef}
        type="button"
        className="rd-select__trigger"
        onClick={() => !disabled && setOpen((p) => !p)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={`rd-select__value${!selected ? ' rd-select__value--placeholder' : ''}`}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown size={14} className="rd-select__chevron" aria-hidden />
      </button>
      {menu}
    </div>
  );
}
