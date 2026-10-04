import React, { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ReportsFunnel from './ReportsFunnel';
import ReportsErrorBoundary from './ReportsErrorBoundary';
import { fetchCustomStatuses } from '../../lib/customStatuses';
import { useAppContext } from '../../App';
import { ChevronDown } from 'lucide-react';
import { MESSAGE_PIPELINE_STAGES } from '../../lib/dashboardMetrics';

export default function ReportsOverviewTab({
  totalLeads,
  messageCounts,
  messageConversionRates,
  getMessageStageDisplayLabel,
  trendData,
  countMode,
  setCountMode
}) {
  const [metric, setMetric] = useState('outreach'); // outreach | calls | messages | invoices
  const { teamIds } = useAppContext() || {};
  const [colorsMap, setColorsMap] = useState({});

  React.useEffect(() => {
    let active = true;
    Promise.all([
      fetchCustomStatuses({ userIds: teamIds, channel: 'messaging' }),
      fetchCustomStatuses({ userIds: teamIds, channel: 'calls' })
    ]).then(([msgStatuses, callStatuses]) => {
      if (!active) return;
      const map = {};
      [...msgStatuses, ...callStatuses].forEach(s => {
        if (s.label) map[s.label.toLowerCase()] = s.color;
      });
      setColorsMap(map);
    });
    return () => { active = false; };
  }, [teamIds]);

  const getMetricLabel = (m) => {
    switch (m) {
      case 'outreach': return 'Outreach Volume';
      case 'calls': return 'Calls Made';
      case 'messages': return 'Messages Sent';
      case 'invoices': return 'Invoices Generated';
      default: return 'Volume';
    }
  };

  const chartData = useMemo(() => {
    if (!trendData) return [];
    return trendData.map(d => ({
      date: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: d[metric] || 0
    }));
  }, [trendData, metric]);

  const customGetStageLabel = (stage) => {
    const label = getMessageStageDisplayLabel(stage);
    return label === 'Lead' ? 'Contacts' : label;
  };

  return (
    <div className="reports-overview-tab flex-col gap-6" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Trend Chart Section */}
      <ReportsErrorBoundary sectionName="Trend Chart">
        <section className="card reports-chart-section" style={{ padding: '1.5rem', marginBottom: '0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Trend</h3>
            <div style={{ position: 'relative' }}>
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                className="form-input"
                style={{ appearance: 'none', paddingRight: '2rem', minWidth: '160px', height: '32px', fontSize: '0.85rem' }}
              >
                <option value="outreach">Outreach Volume</option>
                <option value="calls">Calls Made</option>
                <option value="messages">Messages Sent</option>
                <option value="invoices">Invoices Generated</option>
              </select>
              <ChevronDown size={14} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
            </div>
          </div>
          
          <div style={{ height: 300, width: '100%' }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--text-primary)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--text-primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} dx={-10} />
                  <Tooltip 
                    contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                    labelStyle={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}
                    itemStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
                  />
                  <Area type="monotone" dataKey="value" name={getMetricLabel(metric)} stroke="var(--text-primary)" fill="url(#colorValue)" strokeWidth={3} activeDot={{ r: 6, fill: 'var(--text-primary)', stroke: 'var(--bg-page)', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                No trend data available.
              </div>
            )}
          </div>
        </section>
      </ReportsErrorBoundary>

      {/* Conversion Funnel Section */}
      <ReportsErrorBoundary sectionName="Conversion Funnel">
        <section className="card reports-funnel-section" style={{ padding: '1.5rem', marginBottom: '0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Conversion Funnel</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {countMode === 'cumulative' 
                  ? 'Cumulative reach: counting all leads that reached each stage or beyond.' 
                  : 'Current state: counting leads currently sitting at each stage.'}
              </span>
            </div>
            <div className="reports-count-mode" role="group" aria-label="Pipeline count mode" style={{ display: 'inline-flex', background: 'var(--bg-secondary)', padding: '3px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <button
                type="button"
                className={`btn-sm ${countMode === 'cumulative' ? 'active' : ''}`}
                onClick={() => setCountMode('cumulative')}
                style={{
                  background: countMode === 'cumulative' ? 'var(--bg-primary)' : 'transparent',
                  color: countMode === 'cumulative' ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 14px',
                  fontSize: '0.85rem',
                  boxShadow: countMode === 'cumulative' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.2s',
                  fontWeight: countMode === 'cumulative' ? 600 : 400,
                  cursor: 'pointer'
                }}
              >
                Cumulative reach
              </button>
              <button
                type="button"
                className={`btn-sm ${countMode === 'current' ? 'active' : ''}`}
                onClick={() => setCountMode('current')}
                style={{
                  background: countMode === 'current' ? 'var(--bg-primary)' : 'transparent',
                  color: countMode === 'current' ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 14px',
                  fontSize: '0.85rem',
                  boxShadow: countMode === 'current' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.2s',
                  fontWeight: countMode === 'current' ? 600 : 400,
                  cursor: 'pointer'
                }}
              >
                Current state
              </button>
            </div>
          </div>

          <ReportsFunnel
            stages={MESSAGE_PIPELINE_STAGES}
            counts={messageCounts}
            conversionRates={messageConversionRates}
            totalLeads={totalLeads}
            getStageLabel={customGetStageLabel}
            countMode={countMode}
            colorsMap={colorsMap}
          />
        </section>
      </ReportsErrorBoundary>

    </div>
  );
}
