import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { Folder } from 'lucide-react';

export default function ReportsBreakdownTab({ breakdownData = [], listTableData = [], growthStats = {}, countMode = 'cumulative' }) {

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b'];

  const barData = useMemo(() => {
    return [...breakdownData].sort((a, b) => b.value - a.value);
  }, [breakdownData]);

  const growthValue = growthStats.responseRateWoW || 0;
  const isPositive = growthValue >= 0;
  const donutData = [
    { name: 'Growth', value: Math.abs(growthValue) },
    { name: 'Remaining', value: Math.max(100 - Math.abs(growthValue), 0) }
  ];

  return (
    <div className="reports-breakdown-tab flex-col gap-6" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Visual Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        <section className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Leads by List</h3>
          <div style={{ height: 350, width: '100%' }}>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--border-color)" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                  <YAxis dataKey="listName" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} width={100} />
                  <RechartsTooltip 
                    cursor={{ fill: 'var(--bg-hover)' }}
                    contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} barSize={24}>
                    {barData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                No list data available.
              </div>
            )}
          </div>
        </section>

        <section className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', fontWeight: 600, width: '100%', textAlign: 'left' }}>Growth & Engagement</h3>
          <div style={{ position: 'relative', width: 200, height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={90}
                  startAngle={90}
                  endAngle={-270}
                  dataKey="value"
                  stroke="none"
                >
                  <Cell fill={isPositive ? '#10b981' : '#ef4444'} />
                  <Cell fill="var(--border-color)" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ 
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', 
              display: 'flex', flexDirection: 'column', alignItems: 'center' 
            }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: isPositive ? '#10b981' : '#ef4444' }}>
                {isPositive ? '+' : ''}{growthValue}%
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                WoW Resp Rate
              </div>
            </div>
          </div>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '1.5rem' }}>
            Response rate {isPositive ? 'increased' : 'decreased'} compared to the previous period.
          </p>
        </section>
      </div>

      {/* Per-List Breakdown Report Table */}
      <section className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Per-List Breakdown</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Compare conversion metrics side-by-side across all your lists ({countMode === 'cumulative' ? 'Cumulative reach' : 'Current state'}).
            </span>
          </div>
        </div>

        <div className="table-responsive" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '0.75rem 1rem' }}>List Name</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Contacts</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Contacted</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Positive Reply</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Booked</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Closed Won</th>
              </tr>
            </thead>
            <tbody>
              {listTableData.length > 0 ? (
                listTableData.map((row, idx) => {
                  const contacted = countMode === 'current' ? row.contacted_curr : row.contacted_cum;
                  const positive = countMode === 'current' ? row.positive_reply_curr : row.positive_reply_cum;
                  const booked = countMode === 'current' ? row.booked_curr : row.booked_cum;
                  const closed = countMode === 'current' ? row.closed_won_curr : row.closed_won_cum;

                  return (
                    <tr key={row.folderId || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Folder size={15} style={{ color: row.color || 'var(--text-muted)' }} />
                        <span>{row.listName}</span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 600 }}>{row.contacts ?? 0}</td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>{contacted ?? 0}</td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>{positive ?? 0}</td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>{booked ?? 0}</td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: 'var(--success, #10b981)', fontWeight: 600 }}>{closed ?? 0}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No list data available for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
