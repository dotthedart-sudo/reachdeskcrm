import React from 'react';
import { Search } from 'lucide-react';

export default function CompactSearch({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search…',
  className = '',
  width,
  ...rest
}) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') onSubmit?.(e.target.value);
  };

  return (
    <div
      className={`rd-compact-search ${className}`.trim()}
      style={width ? { width } : undefined}
    >
      <Search size={15} className="rd-compact-search__icon" aria-hidden />
      <input
        type="search"
        className="rd-compact-search__input"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        {...rest}
      />
    </div>
  );
}
