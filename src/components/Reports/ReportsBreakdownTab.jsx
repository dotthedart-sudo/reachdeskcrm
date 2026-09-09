import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

export default function ReportsBreakdownTab({ breakdownData = [], growthStats = {} }) {

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b'];

  const barData = useMemo(() => {
    // Sort descending by value for a nicer horizontal bar chart
    return [...breakdownData].sort((a, b) => b.value - a.value);
  }, [breakdownData]);

  // For a growth donut, we'll just render the stat inside the center or do a partial fill.
  // We can represent current vs previous, but for a single stat we can just use a simple arc.
  // Alternatively, if it's a single stat like WoW growth, we can just display a big number and a mini gauge.
  
  const growthValue = growthStats.responseRateWoW || 0;
  const isPositive = growthValue >= 0;
  const donutData = [
    { name: 'Growth', value: Math.abs(growthValue) },
    { name: 'Remaining', value: Math.max(100 - Math.abs(growthValue), 0) }
  ];

  return (
    <div className="reports-breakdown-tab" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
      
      <section style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', fontWeight: 600 }}>Leads by List/Source</h3>
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

      <section style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
  );
}
