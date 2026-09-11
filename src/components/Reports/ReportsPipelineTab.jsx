import React from 'react';
import { Mail, Phone, PhoneCall, CheckCircle2, UserCheck, BarChart2 } from 'lucide-react';
import { DEFAULT_OUTCOMES } from '../../lib/callOutcomes';

export default function ReportsPipelineTab({
  totalLeads,
  messageCounts,
  messageConversionRates,
  callCounts,
  callConversionRates,
  callActivity = {},
  callStageIds,
  getMessageStageDisplayLabel,
  getCallStageLabel
}) {
  
  // Helper component to render Messages Stepper
  const PipelineStepper = ({ title, icon, description, stages, counts, getLabel }) => {
    return (
      <section className="card reports-pipeline-section" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {icon}
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{title}</h3>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', marginTop: 0 }}>
          {description}
        </p>
        
        <div className="reports-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem' }}>
          {stages.map((stage) => {
            const count = counts[stage] ?? 0;
            const isContacts = stage === 'Lead';
            const pctOfTotal = !isContacts && totalLeads > 0 && stage !== 'not_called'
              ? Math.round((count / totalLeads) * 100)
              : null;

            return (
              <div key={stage} className="reports-metric" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{getLabel(stage)}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>{count}</div>
                {pctOfTotal != null && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {pctOfTotal}% of filtered
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  const messageStages = Object.keys(messageCounts);

  const outcomesMap = callActivity.outcomes || {};
  const totalAttempts = callActivity.total_attempts || 0;
  const connectRate = callActivity.connect_rate || 0;
  const avgAttempts = callActivity.avg_attempts_per_lead || 0;
  const distinctLeads = callActivity.distinct_leads || 0;

  const outcomeList = DEFAULT_OUTCOMES;

  return (
    <div className="reports-pipeline-tab flex-col gap-6" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PipelineStepper 
        title="Messages Pipeline" 
        icon={<Mail size={18} style={{ color: 'var(--primary)' }} />}
        description="Email & LinkedIn stages by message status."
        stages={messageStages}
        counts={messageCounts}
        getLabel={getMessageStageDisplayLabel}
      />
      
      {/* Calls Pipeline Activity Section */}
      <section className="card reports-pipeline-section" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <PhoneCall size={18} style={{ color: 'var(--primary)' }} />
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Calls Pipeline & Activity</h3>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', marginTop: 0 }}>
          Real call attempts logged in Cold Outreach Tracker for the selected period.
        </p>

        {/* Call KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              <Phone size={14} /> Total Call Attempts
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{totalAttempts}</div>
          </div>

          <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              <CheckCircle2 size={14} style={{ color: '#10b981' }} /> Connect Rate
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 600, color: '#10b981' }}>{connectRate}%</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Answered / total attempts</div>
          </div>

          <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              <BarChart2 size={14} /> Avg Attempts / Lead
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{avgAttempts}</div>
          </div>

          <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              <UserCheck size={14} /> Distinct Leads Called
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{distinctLeads}</div>
          </div>
        </div>

        {/* Outcome Breakdown */}
        <div>
          <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>Outcome Breakdown</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {outcomeList.map((item) => {
              const count = outcomesMap[item.label] ?? 0;
              const pct = totalAttempts > 0 ? Math.round((count / totalAttempts) * 100) : 0;

              return (
                <div key={item.label} style={{ background: 'var(--bg-primary)', padding: '0.85rem 1rem', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 500 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                      {item.label}
                    </span>
                    <span style={{ fontWeight: 600 }}>{count} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>({pct}%)</span></span>
                  </div>
                  <div style={{ width: '100%', height: 6, background: 'var(--bg-hover)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: item.color, transition: 'width 0.3s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
