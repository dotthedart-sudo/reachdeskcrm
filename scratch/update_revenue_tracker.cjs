const fs = require('fs');

// 1. Update App.jsx to pass teamSettings to RevenueTrackerWrapper
let appCode = fs.readFileSync('src/App.jsx', 'utf8');
appCode = appCode.replace(
  'const { profile, revenueLogs, currencySymbol, handleAddRevenueLog, handleDeleteRevenueLog } = useAppContext();',
  'const { profile, revenueLogs, currencySymbol, handleAddRevenueLog, handleDeleteRevenueLog, teamSettings } = useAppContext();'
);
appCode = appCode.replace(
  '<RevenueTracker\\n      currentUser={profile}',
  '<RevenueTracker\\n      currentUser={profile}\\n      teamSettings={teamSettings}'
);
fs.writeFileSync('src/App.jsx', appCode);

// 2. Update RevenueTracker.jsx
let rtCode = fs.readFileSync('src/components/RevenueTracker.jsx', 'utf8');
rtCode = rtCode.replace(
  'currencySymbol = \\\'PKR\\\'\\n}) {',
  'currencySymbol = \\\'PKR\\\',\\n  teamSettings = null\\n}) {'
);
const titleSection = `        <div>
          <p className="color-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
            Log and monitor your freelance earnings across multiple currencies
          </p>`;
const newTitleSection = `        <div>
          <p className="color-muted" style={{ fontSize: '0.9rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Log and monitor your freelance earnings across multiple currencies
            {currentUser?.team_id && currentUser?.team_role !== 'owner' && !teamSettings?.members_can_view_revenue && (
              <span style={{ fontSize: '0.75rem', color: 'var(--warning-color, #f59e0b)', fontWeight: 500 }}>
                (Showing your revenue only)
              </span>
            )}
          </p>`;
rtCode = rtCode.replace(titleSection, newTitleSection);
fs.writeFileSync('src/components/RevenueTracker.jsx', rtCode);

console.log('Updated App.jsx and RevenueTracker.jsx');
