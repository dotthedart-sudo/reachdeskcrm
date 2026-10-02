const fs = require('fs');

let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf8');

// Add teamSettings to context
code = code.replace(
  'const { showToast, teamProfilesMap = {}, teamIds = [] } = useAppContext() || {};',
  'const { showToast, teamProfilesMap = {}, teamIds = [], teamSettings = null } = useAppContext() || {};'
);

// Determine if we need to show the note
const oldHeader = '<h3>Revenue</h3>';
const newHeader = '<h3>Revenue</h3>\n            {isTeamScope && currentUser?.team_role !== \\\'owner\\\' && !teamSettings?.members_can_view_revenue && (\n              <span style={{ fontSize: \\\'0.75rem\\\', color: \\\'var(--text-muted)\\\', marginLeft: \\\'0.5rem\\\', fontWeight: 400 }}>\n                (Showing your revenue only)\n              </span>\n            )}';
code = code.replace(oldHeader, newHeader);

// Fix the chart mapping
const oldChart = `                  const mInvoices = invoices.filter(inv => {
                    // revenue_entries use date or created_at, no status needed usually, but let's check
                    const date = new Date(inv.date || inv.created_at);
                    return date.getFullYear() === mYear && date.getMonth() === mMonth;
                  });
                  const mTotal = mInvoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);
                  const maxTarget = revenueTarget || 5000;
                  const heightPct = Math.min(100, (mTotal / maxTarget) * 100);`;

const newChart = `                  const mInvoices = invoices.filter(inv => {
                    if (inv.status?.toLowerCase() !== 'paid') return false;
                    const date = new Date(inv.paid_at);
                    return date.getFullYear() === mYear && date.getMonth() === mMonth;
                  });
                  const mTotal = mInvoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);
                  const maxTarget = revenueTarget > 0 ? revenueTarget : (mTotal > 0 ? mTotal : 1);
                  const heightPct = (revenueTarget === 0 && mTotal === 0) ? 0 : Math.min(100, (mTotal / maxTarget) * 100);`;

code = code.replace(oldChart, newChart);

fs.writeFileSync('src/components/Dashboard.jsx', code);
console.log('Updated Dashboard.jsx');
