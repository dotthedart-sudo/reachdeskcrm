import React from 'react';

/** Slim bulk-action bar — visible only when rows are selected. */
export default function BulkActionBar({ count = 0, children, className = '' }) {
  if (!count) return null;

  return (
    <div className={`bulk-action-bar ${className}`.trim()} role="region" aria-label="Bulk actions">
      <div className="bulk-action-bar__meta">
        <strong>{count}</strong> selected
      </div>
      <div className="bulk-action-bar__actions">{children}</div>
    </div>
  );
}
