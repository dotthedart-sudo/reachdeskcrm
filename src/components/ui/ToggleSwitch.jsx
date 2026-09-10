import React from 'react';
import './ToggleSwitch.css';

export default function ToggleSwitch({ checked, onChange, disabled, ariaLabel }) {
  return (
    <button
      type="button"
      className={`rd-toggle-switch ${checked ? 'rd-toggle-switch--on' : ''} ${disabled ? 'rd-toggle-switch--disabled' : ''}`}
      onClick={() => {
        if (!disabled && onChange) onChange(!checked);
      }}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
    >
      <span className="rd-toggle-switch__thumb" />
    </button>
  );
}
