const fs = require('fs');

const code = fs.readFileSync('src/components/Dashboard.jsx', 'utf8');

const targetStr = `            {invoices.length === 0 ? (
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
                    if (inv.status?.toLowerCase() !== 'paid') return false;
                    const date = new Date(inv.paid_at);
                    return date.getFullYear() === mYear && date.getMonth() === mMonth;
                  });
                  const mTotal = mInvoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);
                  const maxTarget = revenueTarget > 0 ? revenueTarget : (mTotal > 0 ? mTotal : 1);
                  const heightPct = (revenueTarget === 0 && mTotal === 0) ? 0 : Math.min(100, (mTotal / maxTarget) * 100);
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

const replacement = `            {invoices.length === 0 ? (
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

if (code.includes(targetStr)) {
  fs.writeFileSync('src/components/Dashboard.jsx', code.replace(targetStr, replacement));
  console.log('Successfully updated Dashboard.jsx');
} else {
  console.error('Target string not found in Dashboard.jsx');
}
