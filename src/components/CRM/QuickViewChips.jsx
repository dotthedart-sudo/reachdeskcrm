import React from 'react';

function QuickViewTile({
  iconColor, label, count, onClick,
}) {
  const isZero = count === 0;
  return (
    <button type="button" className="crm-quick-view-tile" onClick={onClick}>
      <div className="crm-quick-view-tile-header">
        <span className="crm-quick-view-tile-dot" style={{ backgroundColor: iconColor }} aria-hidden />
        <span className="crm-quick-view-tile-label">{label}</span>
      </div>
      <div className={`crm-quick-view-tile-count ${isZero ? 'crm-quick-view-tile-count--zero' : ''}`}>
        {count}
      </div>
    </button>
  );
}

export default function QuickViewChips({
  systemViews = [],
  systemFolderNames = {},
  getLeadCount,
  totalLeads = 0,
  onSelectFolder,
}) {
  return (
    <div className="crm-quick-view-section">
      <div className="crm-quick-view-section-header">
        <h3 className="crm-quick-view-section-title">Quick views</h3>
        <button type="button" className="crm-quick-view-all-btn" onClick={() => onSelectFolder('all')}>
          All leads &middot; {totalLeads}
        </button>
      </div>
      <div className="crm-quick-view-grid">
        {systemViews.map((sys) => {
          const count = getLeadCount?.(sys.id) ?? 0;
          return (
            <QuickViewTile
              key={sys.id}
              iconColor={sys.iconColor}
              label={systemFolderNames[sys.id] || sys.label}
              count={count}
              onClick={() => onSelectFolder(sys.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
