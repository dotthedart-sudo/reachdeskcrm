const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf8');

code = code.replace(
  'const { showToast, teamProfilesMap = {}, teamIds = [] } = useAppContext() || {};',
  'const { showToast, teamProfilesMap = {}, teamIds = [], teamSettings = null } = useAppContext() || {};'
);

const h3Idx = code.indexOf('<h3>Revenue</h3>');
if (h3Idx !== -1) {
  const newH3 = '<h3>Revenue</h3>\n            {isTeamScope && currentUser?.team_role !== \\\'owner\\\' && !teamSettings?.members_can_view_revenue && (\n              <span style={{ fontSize: \\\'0.75rem\\\', color: \\\'var(--text-muted)\\\', marginLeft: \\\'0.5rem\\\', fontWeight: 400 }}>\n                (Showing your revenue only)\n              </span>\n            )}';
  code = code.substring(0, h3Idx) + newH3.replace(/\\\\'/g, "'") + code.substring(h3Idx + 16);
}

const targetChart = `            {invoices.length === 0 ? (
              <div className="dashboard-empty-state" style={{ height: '80px', margin: '0.5rem 0' }}>
                <span style={{ marginBottom: '0.5rem' }}>No revenue data yet.</span>
                <button className="dashboard-link" onClick={() => navigate('/revenue')}>Add revenue</button>
              </div>
            ) : (
              <div className="dashboard-revenue-bars">

                {[5, 4, 3, 2, 1, 0].map(offset => {
                  const d = new Date();
                  d.setMonth(d.getMonth() - offset);
                  const mYear = d.getFullYear();
                  const mMonth = d.getMonth();
                  const mInvoices = invoices.filter(inv => {
                    // revenue_entries use date or created_at, no status needed usually, but let's check
                    const date = new Date(inv.date || inv.created_at);
                    return date.getFullYear() === mYear && date.getMonth() === mMonth;
                  });
                  const mTotal = mInvoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);
                  const maxTarget = revenueTarget || 5000;
                  const heightPct = Math.min(100, (mTotal / maxTarget) * 100);
                  const isCurrent = offset === 0;
                  return (
                    <div 
                      key={offset} 
                      className={\`dashboard-bar \${isCurrent ? 'current' : ''}\`} 
                      style={{ height: \`\${heightPct}%\` }}
                      title={\`\${CURRENCY_SYMBOLS[currentUser?.default_currency] || '$'}\${mTotal} in \${d.toLocaleString('default', { month: 'short' })}\`}
                    ></div>
                  );
                })}
              </div>
              )}`;

const replacementChart = `            {invoices.length === 0 ? (
              <div className="dashboard-empty-state" style={{ height: '80px', margin: '0.5rem 0' }}>
                <span style={{ marginBottom: '0.5rem' }}>No revenue data yet.</span>
                <button className="dashboard-link" onClick={() => navigate('/revenue')}>Add revenue</button>
              </div>
            ) : (() => {
              const sixMonthTotals = [5, 4, 3, 2, 1, 0].map(offset => {
                const d = new Date();
                d.setMonth(d.getMonth() - offset);
                const mYear = d.getFullYear();
                const mMonth = d.getMonth();
                const mInvoices = invoices.filter(inv => {
                  if (inv.status?.toLowerCase() !== 'paid') return false;
                  const date = new Date(inv.paid_at);
                  return date.getFullYear() === mYear && date.getMonth() === mMonth;
                });
                return mInvoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);
              });
              const maxMonth = Math.max(...sixMonthTotals, 1);
              const chartDivisor = revenueTarget > 0 ? Math.max(maxMonth, revenueTarget) : maxMonth;

              return (
                <div className="dashboard-revenue-bars" style={{ position: 'relative' }}>
                  {revenueTarget > 0 && (
                    <div 
                      style={{
                        position: 'absolute',
                        bottom: \`\${(revenueTarget / chartDivisor) * 100}%\`,
                        left: 0, right: 0,
                        borderTop: '1px dashed var(--text-muted, #8E8C86)',
                        zIndex: 1,
                        opacity: 0.5
                      }}
                      title={\`Target: \${CURRENCY_SYMBOLS[currentUser?.default_currency] || '$'}\${revenueTarget}\`}
                    />
                  )}
                  {sixMonthTotals.map((mTotal, i) => {
                    const offset = 5 - i;
                    const d = new Date();
                    d.setMonth(d.getMonth() - offset);
                    const heightPct = (mTotal / chartDivisor) * 100;
                    const isCurrent = offset === 0;
                    return (
                      <div 
                        key={offset} 
                        className={\`dashboard-bar \${isCurrent ? 'current' : ''}\`} 
                        style={{ height: \`\${heightPct}%\`, zIndex: 2, position: 'relative' }}
                        title={\`\${CURRENCY_SYMBOLS[currentUser?.default_currency] || '$'}\${mTotal} in \${d.toLocaleString('default', { month: 'short' })}\`}
                      ></div>
                    );
                  })}
                </div>
              );
            })()}`;

const chartIdx = code.indexOf(targetChart);
if (chartIdx !== -1) {
  code = code.substring(0, chartIdx) + replacementChart + code.substring(chartIdx + targetChart.length);
  fs.writeFileSync('src/components/Dashboard.jsx', code);
  console.log('Fixed chart in Dashboard.jsx');
} else {
  console.log('Target chart not found in Dashboard.jsx');
}
