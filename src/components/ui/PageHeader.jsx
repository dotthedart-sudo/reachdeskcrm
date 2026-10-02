import React from 'react';

/**
 * PageHeader
 * @param {string} title - Main page title
 * @param {string} description - One-line description under the title
 * @param {React.ReactNode} action - The main action (e.g. Save button, Add button) on the right
 */
export function PageHeader({ title, description, action }) {
  return (
    <div className="page-header">
      <div className="page-header-info">
        <h1 className="page-header-title">{title}</h1>
        {description && <p className="page-header-description">{description}</p>}
      </div>
      {action && (
        <div className="page-header-action">
          {action}
        </div>
      )}
    </div>
  );
}
