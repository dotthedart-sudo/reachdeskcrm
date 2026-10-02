import React from 'react';

/**
 * PageContainer provides a consistent, responsive layout wrapper for all main pages.
 * 
 * Variants:
 * - 'standard' (default): max-width 1200px, centered
 * - 'wide': max-width 1600px, centered
 * - 'full': 100% width, no max-width, flex-1 for full-height apps (Notes, Calendar, Drawing)
 */
export function PageContainer({ children, variant = 'standard', className = '', style = {} }) {
  let baseClass = 'page-container';
  if (variant === 'wide') baseClass += ' page-container-wide';
  if (variant === 'full') baseClass += ' page-container-full';

  return (
    <div className={`${baseClass} ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}
