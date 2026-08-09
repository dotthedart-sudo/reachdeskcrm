import React from 'react';

/** Shared segmented control for view/mode toggles. */
export default function SegmentedControl({
  options = [],
  value,
  onChange,
  ariaLabel,
  className = '',
  size = 'sm',
}) {
  return (
    <div
      className={`rd-segmented rd-segmented--${size} ${className}`.trim()}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`rd-segmented__btn${value === opt.value ? ' rd-segmented__btn--active' : ''}`}
          onClick={() => onChange?.(opt.value)}
          aria-pressed={value === opt.value}
        >
          {opt.icon && <span className="rd-segmented__icon">{opt.icon}</span>}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
