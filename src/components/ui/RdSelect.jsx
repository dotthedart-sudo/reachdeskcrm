import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * Shared styled dropdown — replaces native <select> app-wide.
 * options: { value, label, group? }[]
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
  const rootRef = useRef(null);

  const selected = options.find((o) => o.value === value);
  const groups = options.reduce((acc, opt) => {
    const key = opt.group || '';
    if (!acc[key]) acc[key] = [];
    acc[key].push(opt);
    return acc;
  }, {});

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (opt) => {
    onChange?.(opt.value, opt);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className={`rd-select rd-select--${size}${fullWidth ? ' rd-select--full' : ''} ${className}`.trim()}
    >
      <button
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

      {open && (
        <div className="rd-select__menu" role="listbox">
          {Object.entries(groups).map(([groupName, items]) => (
            <React.Fragment key={groupName || 'default'}>
              {groupName && <div className="rd-select__group-label">{groupName}</div>}
              {items.map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  className={`rd-select__option${opt.value === value ? ' rd-select__option--active' : ''}`}
                  onClick={() => pick(opt)}
                >
                  <span>{opt.label}</span>
                  {opt.value === value && <Check size={14} className="rd-select__check" />}
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
